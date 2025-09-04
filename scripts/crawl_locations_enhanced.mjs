// crawl_locations_enhanced_variants_with_geo.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 강화판: 바리에이션 다량 생성 + 페이지네이션 확대 + Google 좌표/영업시간 수집
 * - 지역(영통구) 동/별칭/인접 키워드 × 카테고리 동의어 × 수식어 × 템플릿 조합으로 쿼리 폭증
 * - 각 쿼리마다 페이지네이션(start+=DISPLAY)로 더 많은 후보 확보
 * - 블로그/웹문서 스니펫으로 텍스트 보강 → 키워드/특징 룰 기반 추론
 * - Google TextSearch → { place_id, lat, lng }, Details → opening_hours
 * - 기존 keywords는 합집합, features는 얕은 병합, 좌표/영업시간은 있을 때만 갱신
 */

// =================== 설정 ===================
const prisma = new PrismaClient();

// 기본 지역 라벨(로그용)
const REGION_CANON = "경기도 수원시 영통구";

// 지역 바리에이션(동/별칭/인접 표현)
const REGION_ALIASES = [
  "경기도 수원시 영통구",
  "수원시 영통구",
  "수원 영통구",
  "영통구"
];
const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동"]; // 영통구 주요 동

// 카테고리(여러 개 가능)
const CATEGORY_KEYWORDS = ["카페"]; // 필요 시 ["카페","서점","공원",...] 등으로 확장
const CATEGORY_SYNONYMS = {
  카페: ["카페", "커피", "브런치 카페", "디저트 카페", "스터디 카페", "로스터리"]
};

// 수식어(의도/분위기/편의)
const INTENT_MODIFIERS = [
  "인기", "추천", "베스트", "핫플", "신상", "숨은 명소", "로컬"
];
const MOOD_MODIFIERS = [
  "분위기 좋은", "감성", "아늑한", "조용한", "힙한", "채광 좋은", "뷰 좋은"
];
const STUDY_MODIFIERS = [
  "카공", "스터디", "팀플", "노트북", "콘센트 많음", "와이파이"
];
const FAMILY_POLICY = ["노키즈", "반려동물 동반", "데이트", "혼자 가기 좋은"];

// 쿼리 템플릿
const QUERY_TEMPLATES = [
  "{region} {category}",
  "{region} {modifier} {category}",
  "{subarea} {category}",
  "{subarea} {modifier} {category}",
  "{region} {category} 후기",
  "{region} {category} 리뷰",
  "{region} {category} 블로그",
  "{region} {modifier} {category} 후기",
  "{subarea} {category} 후기",
  "{subarea} {modifier} {category} 후기",
];

// 지역검색 파라미터
const DISPLAY = 30; // 1~30
const MAX_PAGES_PER_QUERY = 5; // 쿼리당 최대 페이지 수(start를 1,31,61,...)

// 전체 수집 상한(안전장치)
const MAX_QUERIES_PER_CATEGORY = 120; // 카테고리당 생성할 쿼리 수 상한
const MAX_ITEMS_PER_CATEGORY = 300;   // 카테고리당 upsert 대상 상한(대략치)

// 딜레이(ms)
const BASE_DELAY_MS = 140; // 네이버 레이트 리밋 고려

// opening_hours 컬럼이 없으면 true → features.openingHours에 임시 저장
const USE_FEATURES_FALLBACK = false;

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
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (좌표/영업시간 채우려면 필요)");
}

// =================== HTTP 헤더 ===================
const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  Accept: "application/json",
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
  quiet: [/조용/, /한산/, /차분/, /소음\s?낮/, /시끄럽지\s?않/, /적막/, /잔잔/, /고요/, /소곤소곤/],
  study: [/공부/, /스터디/, /과제/, /팀플/, /노트북/, /랩탑/, /카공/, /카공족/, /레포트/, /리포트/, /집중/, /집중하기\s?좋/],
  cozy:  [/감성/, /아늑/, /따뜻/, /분위기\s?좋/, /인테리어/, /무드/, /포근/, /힙한/, /감성카페/, /감성\s?분위기/, /채광\s?좋/, /햇살\s?좋/],
  outlets:[/콘센트\s?많/, /플러그/, /멀티탭/, /충전\s?가능/, /전원\s?가능/, /노트북\s?충전/, /충전기/, /콘센트\s?빵빵/],
  spacious:[/넓/, /좌석\s?많/, /테이블\s?크/, /공간\s?넉넉/, /자리\s?여유/, /좌석\s?간격/, /층고\s?높/, /시야\s?트임/],
  queue: [/웨이팅/, /대기줄/, /줄\s?길/, /대기\s?많/, /대기\s?시간/],
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

function countHits(regexList, t) { let c = 0; for (const r of regexList) if (r.test(t)) c++; return c; }
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
  return Object.entries(scores).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k]) => k);
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
// (1) 네이버 지역검색
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
        axios.get(NAVER_BLOG_URL, { headers: localHeaders, params: { query: q, display: 20 }, timeout: 8000 })
      );
      const items = data?.items || [];
      merged += " " + items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
      await sleep(80);
    } catch { /* skip */ }
  }
  return merged.trim();
}

// (3) 웹문서 보강
async function fetchWebSnippets(query, display=20) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_WEB_URL, { headers: localHeaders, params: { query, display: Math.min(display, 30) }, timeout: 8000 })
  );
  const items = data?.items || [];
  return items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
}

// (4) Google TextSearch → { place_id, lat, lng }
async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  // 주소가 너무 길거나 매칭 실패 시 REGION_CANON을 넣어 한 번 더 시도할 수 있게 설계
  const qPrimary = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
  const qFallback = `${name} ${REGION_CANON}`;

  const tryQuery = async (q) => {
    const params = { query: q, key: GOOGLE_MAPS_API_KEY, language: "ko" };
    const { data } = await withRetry(() => axios.get(GOOGLE_PLACES_TEXT, { params, timeout: 8000 }));
    const res = data?.results?.[0];
    if (!res) return null;
    return {
      place_id: res.place_id ?? null,
      lat: res.geometry?.location?.lat ?? null,
      lng: res.geometry?.location?.lng ?? null,
    };
  };

  let found = await tryQuery(qPrimary);
  if (!found) found = await tryQuery(qFallback);
  return found;
}

// (5) Google Details → opening_hours
async function fetchPlaceOpeningHours(placeId) {
  if (!placeId || !GOOGLE_MAPS_API_KEY) return null;
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_DETAILS, {
      params: { place_id: placeId, key: GOOGLE_MAPS_API_KEY, fields: "opening_hours", language: "ko" },
      timeout: 8000,
    })
  );
  const oh = data?.result?.opening_hours; if (!oh) return null;
  return { open_now: oh.open_now ?? null, weekday_text: oh.weekday_text ?? null, periods: oh.periods ?? null };
}

// =================== 업서트 ===================
async function upsertLocation(item, catLabel) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // 텍스트 보강
  let extraText = await fetchBlogSnippetsStrong({ name, region: REGION_CANON, category: catLabel });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(`${name} ${REGION_CANON} ${catLabel||""} 후기 리뷰 카공 조용 콘센트 와이파이`);
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;
  const baseText = normalizeText(baseTextRaw);

  // 추론
  let inferredKeywords = inferKeywords(baseText);
  const inferredFeatures = inferFeatures(baseText);

  // 카테고리 휴리스틱
  if ((catLabel || "").includes("카페")) {
    const hasStudySignal = inferredFeatures.wifi || inferredFeatures.power || inferredKeywords.includes("조용");
    if (hasStudySignal && !inferredKeywords.includes("공부")) inferredKeywords.push("공부");
  }

  // 키워드 합집합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...inferredKeywords]));

  // features 얕은 병합 + 디버그 스니펫
  const mergedFeaturesWithDebug = {
    ...(existing?.features || {}),
    ...inferredFeatures,
    wifi:     (existing?.features?.wifi     || inferredFeatures.wifi)     || undefined,
    power:    (existing?.features?.power    || inferredFeatures.power)    || undefined,
    pet:      (existing?.features?.pet      || inferredFeatures.pet)      || undefined,
    parking:  (existing?.features?.parking  || inferredFeatures.parking)  || undefined,
    restroom: (existing?.features?.restroom || inferredFeatures.restroom) || undefined,
    noise:    (existing?.features?.noise    || inferredFeatures.noise)    || undefined,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };

  // Google 좌표 + place_id
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) {
    console.warn("[google:text] error", e?.message || e);
  }

  // 영업시간
  let opening_hours = null;
  try {
    if (coords.place_id) opening_hours = await fetchPlaceOpeningHours(coords.place_id);
    console.log(`[google:hours] ${name} → ${opening_hours ? "ok" : "none"}`);
  } catch (e) {
    console.warn("[google:details] error", e?.message || e);
  }

  // features 임시 폴백 옵션
  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...mergedFeaturesWithDebug, openingHours: opening_hours }
    : mergedFeaturesWithDebug;

  // ⚠️ 좌표는 "신규 값이 있을 때만" 갱신 (없으면 기존 보존)
  const updatePayload = {
    location_name: name,
    address,
    latitude:  (coords.lat ?? existing?.latitude ?? null),
    longitude: (coords.lng ?? existing?.longitude ?? null),
    category: catLabel,
    description: desc || null,
    keywords: { set: mergedKeywords },
    features: featuresFinal,
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: catLabel,
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
    `[upsert] ${name} (${address || "no-addr"}) → id=${loc.location_id}` +
    ` | lat=${loc.latitude ?? "null"}, lng=${loc.longitude ?? "null"}` +
    ` | keywords=[${mergedKeywords.join(", ")}]` +
    (opening_hours ? " | hours✅" : " | hours✖")
  );
  return loc;
}

// =================== 바리에이션 생성 ===================
function uniquePush(arr, value) { if (value && !arr.includes(value)) arr.push(value); }
function composeQueriesForCategory(cat) {
  const catSyns = CATEGORY_SYNONYMS[cat] || [cat];
  const modifiers = [...INTENT_MODIFIERS, ...MOOD_MODIFIERS, ...STUDY_MODIFIERS, ...FAMILY_POLICY];
  const regionCombos = [];
  for (const r of REGION_ALIASES) uniquePush(regionCombos, r);
  for (const r of REGION_ALIASES) for (const s of SUBAREAS) uniquePush(regionCombos, `${r} ${s}`);
  for (const s of SUBAREAS) uniquePush(regionCombos, s);

  const queries = new Set();
  for (const region of regionCombos) {
    for (const category of catSyns) {
      for (const tmpl of QUERY_TEMPLATES) {
        const q1 = tmpl
          .replace("{region}", region)
          .replace("{subarea}", region) // subarea도 regionCombos에 포함시켜 일관 처리
          .replace("{category}", category)
          .replace("{modifier}", "");
        queries.add(q1.trim());

        for (const m of modifiers) {
          const q2 = tmpl
            .replace("{region}", region)
            .replace("{subarea}", region)
            .replace("{category}", category)
            .replace("{modifier}", m);
          queries.add(q2.trim());
        }
      }
    }
  }
  const list = Array.from(queries);
  return list.slice(0, MAX_QUERIES_PER_CATEGORY); // 상한 컷
}

// =================== 실행 루프 ===================
async function runCategory(cat) {
  const queries = composeQueriesForCategory(cat);
  console.log(`\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`);

  let upserts = 0;
  const seenSig = new Set(); // 같은 검색 결과 반복 방지(느슨한 수준)

  for (const q of queries) {
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      const start = 1 + page * DISPLAY; // 1,31,61,...
      const items = await fetchLocal(q, start);
      if (!items.length) break;

      for (const it of items) {
        if (upserts >= MAX_ITEMS_PER_CATEGORY) break;
        const name = stripHtml(it.title);
        const address = it.roadAddress || it.address || "";
        const sig = makeDedupeSig({ name, address });
        if (seenSig.has(sig)) continue;
        seenSig.add(sig);

        await upsertLocation(it, cat);
        upserts++;
        await sleep(BASE_DELAY_MS);
      }
      if (upserts >= MAX_ITEMS_PER_CATEGORY) break;
    }
    if (upserts >= MAX_ITEMS_PER_CATEGORY) break;
  }

  console.log(`[DONE] ${REGION_CANON} × ${cat} → inserted/updated ≈ ${upserts} (unique)`);
}

// =================== main ===================
(async () => {
  try {
    for (const cat of CATEGORY_KEYWORDS) {
      await runCategory(cat);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
