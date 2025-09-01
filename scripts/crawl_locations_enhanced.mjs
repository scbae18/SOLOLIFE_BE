// crawl_locations_enhanced_full.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * ✅ 핵심
 * - 네이버 지역검색으로 후보 수집
 * - 네이버 블로그(+웹문서) 스니펫을 다양 쿼리로 대량 수집 → 정규식 스코어링으로 키워드·특징 추론
 * - 기존 keywords와 합집합 저장(덮어쓰기 방지), features 얕은 병합
 * - Google Places Details(opening_hours)만 수집 (평점/가격/좌표는 손대지 않음)
 * - 디버그: 매칭 점수/스니펫을 features._debug*로 저장해 DBeaver에서 바로 확인 가능
 */

// =================== 설정 ===================
const prisma = new PrismaClient();

const REGION_QUERY = "경기도 수원시 영통구";   // 기본 지역
const CATEGORY_KEYWORDS = ["카페"];            // 대상 카테고리
const MAX_PER_CATEGORY = 60;                  // 카테고리별 목표 수
const DISPLAY = 30;                           // 지역검색 페이지당 (1~30)

// opening_hours 컬럼이 없으면 true → features.openingHours에 임시 저장
const USE_FEATURES_FALLBACK = false;

// 호출 간 딜레이(ms)
const BASE_DELAY_MS = 120;

// =================== 외부 API URL ===================
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL        = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL         = "https://openapi.naver.com/v1/search/webkr.json";
const GOOGLE_PLACES_TEXT    = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

// =================== 환경변수 체크 ===================
const {
  NAVER_OPENAPI_CLIENT_ID,
  NAVER_OPENAPI_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY,
} = process.env;

if (!NAVER_OPENAPI_CLIENT_ID || !NAVER_OPENAPI_CLIENT_SECRET) {
  throw new Error("NAVER_OPENAPI_CLIENT_ID / NAVER_OPENAPI_CLIENT_SECRET 누락");
}
if (!GOOGLE_MAPS_API_KEY) {
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (opening_hours 채우려면 필요)");
}

// =================== HTTP 헤더 ===================
const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  "Accept": "application/json",
};

// =================== 유틸 ===================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 3, delay = 400) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (e.response) console.error("[HTTP ERROR]", e.response.status, e.response.data);
      else console.error("[HTTP ERROR]", e.message);
      last = e; await sleep(delay * (i + 1));
    }
  }
  throw last;
}

const stripHtml = (s = "") => s.replace(/<[^>]*>/g, " ").trim();
function normalizeText(s = "") {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const makeDedupeSig = ({ name, address }) =>
  crypto.createHash("sha256")
    .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);

// =================== 룰(정규식 사전) + 스코어링 ===================
const MOOD_LEX = {
  quiet: [
    /조용/, /한산/, /차분/, /소음\s?낮/, /시끄럽지\s?않/,
    /적막/, /잔잔/, /고요/, /소곤소곤/,
  ],
  study: [
    /공부/, /스터디/, /과제/, /팀플/, /노트북/, /랩탑/,
    /카공/, /카공족/, /레포트/, /리포트/, /집중/, /집중하기\s?좋/,
  ],
  cozy: [
    /감성/, /아늑/, /따뜻/, /분위기\s?좋/, /인테리어/, /무드/, /포근/,
    /힙한/, /감성카페/, /감성\s?분위기/, /채광\s?좋/, /햇살\s?좋/,
  ],
  outlets: [
    /콘센트\s?많/, /플러그/, /멀티탭/, /충전\s?가능/, /전원\s?가능/,
    /노트북\s?충전/, /충전기/, /콘센트\s?빵빵/,
  ],
  spacious: [
    /넓/, /좌석\s?많/, /테이블\s?크/, /공간\s?넉넉/, /자리\s?여유/,
    /좌석\s?간격/, /층고\s?높/, /시야\s?트임/,
  ],
  queue: [
    /웨이팅/, /대기줄/, /줄\s?길/, /대기\s?많/, /대기\s?시간/,
  ],
};

const FEATURE_LEX = {
  wifi:     [/와이파이/, /\bwi-?fi\b/, /\bfree\s*wifi\b/, /\bfast\s*wifi\b/, /인터넷\s?빨라/, /속도\s?빠르/],
  power:    [/콘센트/, /플러그/, /전원\s?가능/, /충전\s?가능/, /멀티탭/],
  pet:      [/반려견/, /애견/, /반려동물/, /펫\s?동반/, /댕댕이/, /고양이\s?동반/],
  parking:  [/주차/, /발렛/, /주차장/, /주차\s?가능/, /주차\s?편/],
  restroom: [/화장실/, /\brestroom\b/, /\btoilet\b/, /세면대/],
  kidfree:  [/노키즈/, /no\s*kids/, /12세\s?이하\s?출입\s?금지/],
  rooftop:  [/루프탑/, /옥상/, /테라스/],
  view:     [/뷰맛집/, /전망\s?좋/, /야경/, /리버뷰/, /시티뷰/],
};

function countHits(regexList, t) {
  let c = 0;
  for (const r of regexList) if (r.test(t)) c++;
  return c;
}

function inferKeywords(text) {
  const t = normalizeText(text);
  const scores = {
    조용:        countHits(MOOD_LEX.quiet, t),
    공부:        countHits(MOOD_LEX.study, t),
    감성:        countHits(MOOD_LEX.cozy, t),
    콘센트많음:  countHits(MOOD_LEX.outlets, t),
    넓음:        countHits(MOOD_LEX.spacious, t),
    웨이팅많음:  countHits(MOOD_LEX.queue, t),
  };
  return Object.entries(scores)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function inferFeatures(text) {
  const t = normalizeText(text);
  const feats = {
    wifi:     countHits(FEATURE_LEX.wifi, t)     >= 1 || undefined,
    power:    countHits(FEATURE_LEX.power, t)    >= 1 || undefined,
    pet:      countHits(FEATURE_LEX.pet, t)      >= 1 || undefined,
    parking:  countHits(FEATURE_LEX.parking, t)  >= 1 || undefined,
    restroom: countHits(FEATURE_LEX.restroom, t) >= 1 || undefined,
    kidfree:  countHits(FEATURE_LEX.kidfree, t)  >= 1 || undefined,
    rooftop:  countHits(FEATURE_LEX.rooftop, t)  >= 1 || undefined,
    view:     countHits(FEATURE_LEX.view, t)     >= 1 || undefined,
  };
  if (countHits(MOOD_LEX.quiet, t) >= 1) feats.noise = 1; // 간이 소음지표: 낮음=1
  return feats;
}

// =================== 외부 API 호출 ===================
// (1) 네이버 지역검색 (후보)
async function fetchLocal(query, start = 1) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_LOCAL_URL, {
      headers: localHeaders,
      params: { query, display: DISPLAY, start, sort: "random" },
      timeout: 8000,
    })
  );
  return data.items || [];
}

// (2) 블로그 강력 수집
async function fetchBlogSnippetsStrong({ name, region, category }) {
  const variants = [
    `${name} ${region} 후기 리뷰 ${category||""}`,
    `${name} ${region} 카공 콘센트 ${category||""}`,
    `${name} ${region} 분위기 인테리어 ${category||""}`,
    `${name} ${region} 조용 공부 ${category||""}`,
    `${name} ${region} ${category||""}`,
  ];
  let merged = "";
  for (const q of variants) {
    try {
      const { data } = await withRetry(() =>
        axios.get(NAVER_BLOG_URL, {
          headers: localHeaders,
          params: { query: q, display: 20 },
          timeout: 8000,
        })
      );
      const items = data?.items || [];
      merged += " " + items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
      await sleep(80); // rate-limit 여유
    } catch { /* skip */ }
  }
  return merged.trim();
}

// (3) 웹문서 보강
async function fetchWebSnippets(query, display=20) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_WEB_URL, {
      headers: localHeaders,
      params: { query, display: Math.min(display, 30) },
      timeout: 8000,
    })
  );
  const items = data?.items || [];
  return items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
}

// (4) Google Places: opening_hours
async function searchPlaceIdByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const query = address ? `${name} ${address}` : name;
  const params = { query, key: GOOGLE_MAPS_API_KEY, language: "ko" };
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_TEXT, { params, timeout: 8000 })
  );
  return data?.results?.[0]?.place_id ?? null;
}

async function fetchPlaceOpeningHours(placeId) {
  if (!placeId || !GOOGLE_MAPS_API_KEY) return null;
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_DETAILS, {
      params: {
        place_id: placeId,
        key: GOOGLE_MAPS_API_KEY,
        fields: "opening_hours",
        language: "ko",
      },
      timeout: 8000,
    })
  );
  const oh = data?.result?.opening_hours;
  if (!oh) return null;
  return {
    open_now: oh.open_now ?? null,
    weekday_text: oh.weekday_text ?? null,
    periods: oh.periods ?? null,
  };
}

// =================== 업서트 ===================
async function upsertLocation(item, catLabel) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  // 기존 레코드(있다면 키워드/특징 보존용)
  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // 텍스트 수집(블로그 → 부족하면 웹문서)
  let extraText = await fetchBlogSnippetsStrong({ name, region: REGION_QUERY, category: catLabel });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(`${name} ${REGION_QUERY} ${catLabel||""} 후기 리뷰 카공 조용 콘센트 와이파이`);
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;
  const baseText = normalizeText(baseTextRaw);

  // 추론
  let inferredKeywords = inferKeywords(baseText);
  const inferredFeatures = inferFeatures(baseText);

  // 카테고리 휴리스틱: 카페 + wifi/전원/조용 → '공부' 보강
  if ((catLabel || "").includes("카페")) {
    const hasStudySignal = inferredFeatures.wifi || inferredFeatures.power || inferredKeywords.includes("조용");
    if (hasStudySignal && !inferredKeywords.includes("공부")) inferredKeywords.push("공부");
  }

  // 기존 키워드와 합집합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...inferredKeywords]));

  // features 얕은 병합(기존 true 유지, 새 추론 undefined면 덮어쓰지 않음)
  const mergedFeaturesBase = {
    ...(existing?.features || {}),
    ...inferredFeatures,
    wifi:     (existing?.features?.wifi     || inferredFeatures.wifi)     || undefined,
    power:    (existing?.features?.power    || inferredFeatures.power)    || undefined,
    pet:      (existing?.features?.pet      || inferredFeatures.pet)      || undefined,
    parking:  (existing?.features?.parking  || inferredFeatures.parking)  || undefined,
    restroom: (existing?.features?.restroom || inferredFeatures.restroom) || undefined,
    noise:    (existing?.features?.noise    || inferredFeatures.noise)    || undefined,
  };

  // 디버그 점수 + 스니펫을 함께 저장
  const kwScores = {
    조용: countHits(MOOD_LEX.quiet, baseText),
    공부: countHits(MOOD_LEX.study, baseText),
    감성: countHits(MOOD_LEX.cozy, baseText),
    콘센트많음: countHits(MOOD_LEX.outlets, baseText),
    넓음: countHits(MOOD_LEX.spacious, baseText),
    웨이팅많음: countHits(MOOD_LEX.queue, baseText),
  };
  const featScores = {
    wifi: countHits(FEATURE_LEX.wifi, baseText),
    power: countHits(FEATURE_LEX.power, baseText),
    pet: countHits(FEATURE_LEX.pet, baseText),
    parking: countHits(FEATURE_LEX.parking, baseText),
    restroom: countHits(FEATURE_LEX.restroom, baseText),
    kidfree: countHits(FEATURE_LEX.kidfree, baseText),
    rooftop: countHits(FEATURE_LEX.rooftop, baseText),
    view: countHits(FEATURE_LEX.view, baseText),
  };

  const mergedFeaturesWithDebug = {
    ...mergedFeaturesBase,
    _debugSnippet: baseTextRaw.slice(0, 200),
    _debugKwScores: kwScores,
    _debugFeatScores: featScores,
  };

  // 영업시간
  let opening_hours = null;
  try {
    const placeId = await searchPlaceIdByText(name, address);
    opening_hours = await fetchPlaceOpeningHours(placeId);
  } catch {}

  // features에 넣는 임시 폴백 옵션
  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...mergedFeaturesWithDebug, openingHours: opening_hours }
    : mergedFeaturesWithDebug;

  const updatePayload = {
    location_name: name,
    address,
    latitude: null,  // 좌표는 유지: NULL
    longitude: null, // 좌표는 유지: NULL
    category: catLabel,
    description: desc || null,
    keywords: { set: mergedKeywords },
    features: featuresFinal,
    updated_at: new Date(),
  };

  const createPayload = {
    location_name: name,
    address,
    latitude: null,
    longitude: null,
    category: catLabel,
    is_solo_friendly: true,
    description: desc || null,
    keywords: mergedKeywords,
    features: featuresFinal,
    dedupe_signature,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // opening_hours 컬럼이 있다면 여기에 저장(권장)
  if (!USE_FEATURES_FALLBACK) {
    updatePayload.opening_hours = opening_hours;
    createPayload.opening_hours = opening_hours;
  }

  const loc = await prisma.location.upsert({
    where: { dedupe_signature },
    update: updatePayload,
    create: createPayload,
  });

  console.log(
    `[upsert] ${name} (${address || "no-addr"}) → id=${loc.location_id}` +
    ` | keywords=[${mergedKeywords.join(", ")}]` +
    (opening_hours ? " | hours✅" : " | hours✖")
  );

  return loc;
}

// =================== 실행 루프 ===================
async function runOnce(category) {
  const kw = `${REGION_QUERY} ${category}`;
  let fetched = 0;

  for (let start = 1; fetched < MAX_PER_CATEGORY; start += DISPLAY) {
    const items = await fetchLocal(kw, start);
    if (!items.length) break;

    for (const it of items) {
      if (fetched >= MAX_PER_CATEGORY) break;
      await upsertLocation(it, category);
      fetched++;
      await sleep(BASE_DELAY_MS);
    }
  }
  console.log(`[${category}] inserted/updated ≈ ${fetched}`);
}

// =================== main ===================
(async () => {
  try {
    for (const cat of CATEGORY_KEYWORDS) {
      await runOnce(cat);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
