// crawl_locations_yeongtong_variants.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * ✅ 무엇을 하나?
 * - 네이버 '지역검색'을 영통구 고정으로, 검색어 바리에이션을 돌려 후보를 최대한 확보
 * - 네이버 블로그 스니펫으로 텍스트 보강 → 정규식 스코어링으로 keywords/features 추론
 * - Google Places Details에서 opening_hours만 수집
 * - 기존 keywords와는 "합집합" 저장, features는 얕은 병합
 * - dedupe_signature(이름+주소 해시)로 중복 삽입 방지
 */

// =================== 설정 ===================
const prisma = new PrismaClient();

// 영통구로 고정
const REGION_QUERY = "경기도 수원시 영통구";

// 원하는 카테고리 (필요 시 배열에 추가)
const CATEGORY_KEYWORDS = ["카페"];

// 한 쿼리로는 결과가 적으므로 바리에이션을 많이 돌린다
const QUERY_VARIANTS = [
  "{region} {category}",
  "{region} 인기 {category}",
  "{region} 추천 {category}",
  "{region} 후기 {category}",
  "{region} 리뷰 {category}",
  "{region} 조용한 {category}",
  "{region} 분위기 좋은 {category}",
  "{region} 카공 {category}",
  "{region} 감성 {category}",
  "{region} 노키즈 {category}",
  "{region} 루프탑 {category}",
  "{region} 뷰 좋은 {category}",
  // 필요하면 더 추가
];

// 네이버 지역검색: 현재 한 요청당 소수의 결과만 제공됨 → 바리에이션 수로 커버
const DISPLAY = 5; // 안전값
const BASE_DELAY_MS = 120;

// opening_hours 컬럼이 없으면 true → features.openingHours에 임시 저장
const USE_FEATURES_FALLBACK = false;

// =================== 외부 API URL ===================
const NAVER_LOCAL_URL  = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL   = "https://openapi.naver.com/v1/search/blog.json";
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
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (opening_hours 수집은 생략됨)");
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

// =================== 키워드/특징 룰 ===================
const MOOD_LEX = {
  quiet:    [/조용/, /한산/, /차분/, /소음\s?낮/, /시끄럽지\s?않/, /적막/, /잔잔/, /고요/, /소곤소곤/],
  study:    [/공부/, /스터디/, /과제/, /팀플/, /노트북/, /랩탑/, /카공/, /카공족/, /레포트/, /리포트/, /집중/, /집중하기\s?좋/],
  cozy:     [/감성/, /아늑/, /따뜻/, /분위기\s?좋/, /인테리어/, /무드/, /포근/, /힙한/, /감성카페/, /감성\s?분위기/, /채광\s?좋/, /햇살\s?좋/],
  outlets:  [/콘센트\s?많/, /플러그/, /멀티탭/, /충전\s?가능/, /전원\s?가능/, /노트북\s?충전/, /충전기/, /콘센트\s?빵빵/],
  spacious: [/넓/, /좌석\s?많/, /테이블\s?크/, /공간\s?넉넉/, /자리\s?여유/, /좌석\s?간격/, /층고\s?높/, /시야\s?트임/],
  queue:    [/웨이팅/, /대기줄/, /줄\s?길/, /대기\s?많/, /대기\s?시간/],
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

function countHits(regexList, text) {
  let c = 0;
  for (const r of regexList) if (r.test(text)) c++;
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
async function fetchLocal(keyword) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_LOCAL_URL, {
      headers: localHeaders,
      params: { query: keyword, display: DISPLAY, start: 1, sort: "random" },
      timeout: 8000,
    })
  );
  return data.items || [];
}

async function fetchBlogSnippets(query, limit = 20) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_BLOG_URL, {
      headers: localHeaders,
      params: { query, display: Math.min(limit, 30) },
      timeout: 8000,
    })
  );
  const items = data?.items || [];
  return items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
}

// Google Places: opening_hours
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
async function upsertLocation(item, category) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // 블로그 스니펫으로 텍스트 보강
  let extraText = await fetchBlogSnippets(`${name} ${REGION_QUERY} 후기 리뷰 ${category || ""}`, 20);
  if (!extraText) extraText = await fetchBlogSnippets(`${name} ${REGION_QUERY}`, 20);

  const baseText = `${name} ${desc} ${extraText || ""} ${category || ""}`;

  // 추론
  let inferredKeywords = inferKeywords(baseText);
  const inferredFeatures = inferFeatures(baseText);

  // 카테고리 휴리스틱: 카페 + wifi/전원/조용 → '공부' 보강
  if ((category || "").includes("카페")) {
    const hasStudySignal = inferredFeatures.wifi || inferredFeatures.power || inferredKeywords.includes("조용");
    if (hasStudySignal && !inferredKeywords.includes("공부")) inferredKeywords.push("공부");
  }

  // 기존 keywords와 합집합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...inferredKeywords]));

  // features 얕은 병합
  const mergedFeatures = {
    ...(existing?.features || {}),
    ...inferredFeatures,
    wifi:     (existing?.features?.wifi     || inferredFeatures.wifi)     || undefined,
    power:    (existing?.features?.power    || inferredFeatures.power)    || undefined,
    pet:      (existing?.features?.pet      || inferredFeatures.pet)      || undefined,
    parking:  (existing?.features?.parking  || inferredFeatures.parking)  || undefined,
    restroom: (existing?.features?.restroom || inferredFeatures.restroom) || undefined,
    noise:    (existing?.features?.noise    || inferredFeatures.noise)    || undefined,
  };

  // 영업시간
  let opening_hours = null;
  try {
    const placeId = await searchPlaceIdByText(name, address);
    opening_hours = await fetchPlaceOpeningHours(placeId);
  } catch {}

  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...mergedFeatures, openingHours: opening_hours }
    : mergedFeatures;

  const updatePayload = {
    location_name: name,
    address,
    latitude: null,
    longitude: null,
    category,
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
    category,
    is_solo_friendly: true,
    description: desc || null,
    keywords: mergedKeywords,
    features: featuresFinal,
    dedupe_signature,
    created_at: new Date(),
    updated_at: new Date(),
  };

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
    `[upsert] ${REGION_QUERY} | ${category} | ${name} → id=${loc.location_id}` +
    ` | keywords=[${mergedKeywords.join(", ")}]` +
    (opening_hours ? " | hours✅" : " | hours✖")
  );
  return loc;
}

// =================== 실행 루프(영통구 고정) ===================
function buildQueryFromTemplate(tmpl, region, category) {
  return tmpl.replace("{region}", region).replace("{category}", category);
}

async function runRegionYeongtong() {
  // 기존 dedupe_signature 로딩 → 중복 방지(바리에이션 많이 돌리므로 필수는 아님)
  // (upsert 자체도 where+create로 안전하지만, 미리 조회하지 않아도 OK)
  let inserted = 0;

  for (const category of CATEGORY_KEYWORDS) {
    console.log(`\n=== RUN: ${REGION_QUERY} × ${category} ===`);
    for (const tmpl of QUERY_VARIANTS) {
      const query = buildQueryFromTemplate(tmpl, REGION_QUERY, category);
      const items = await fetchLocal(query);
      if (!items.length) continue;

      for (const it of items) {
        await upsertLocation(it, category);
        inserted++;
        await sleep(BASE_DELAY_MS);
      }
    }
    console.log(`[DONE] ${REGION_QUERY} × ${category} → inserted/updated ≈ ${inserted}`);
  }
}

// =================== main ===================
(async () => {
  try {
    await runRegionYeongtong();
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
