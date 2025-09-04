// crawl_restaurants_enhanced_variants_with_geo.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 음식점 버전 (맛집 중심):
 * - 지역(영통구) 동/별칭/인접 키워드 × 음식점 동의어/세부카테고리 × 수식어 × 템플릿 조합
 * - 페이지네이션 확장(Naver Local) + 블로그/웹 스니펫으로 텍스트 보강
 * - Google TextSearch → { place_id, lat, lng }, Details → opening_hours
 * - 키워드 합집합, features 얕은 병합, 좌표/영업시간은 있을 때만 갱신
 * - 혼밥 시그널 발견 시 is_solo_friendly=true 휴리스틱
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
  "영통구",
];
const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동"];

// 카테고리(여러 개 가능) — 기본은 '음식점'
const CATEGORY_KEYWORDS = ["음식점"]; 
const CATEGORY_SYNONYMS = {
  음식점: [
    "맛집",
    "식당",
    "레스토랑",
    "밥집",
    // 세부 카테고리(원하는 만큼 추가)
    "한식", "중식", "일식", "양식", "분식", "고깃집",
    "회", "초밥", "라멘", "우동", "덮밥",
    "파스타", "스테이크", "버거", "치킨", "피자",
    "곱창", "막창", "삼겹살", "전골", "국밥", "해장"
  ],
};

// 수식어(의도/분위기/편의/식사상황)
const INTENT_MODIFIERS = [
  "인기", "추천", "베스트", "핫플", "신상", "숨은 맛집", "로컬",
];
const MOOD_MODIFIERS = [
  "가성비 좋은", "분위기 좋은", "깔끔한", "넓은", "웨이팅 긴", "웨이팅 없는",
];
const SOLO_MODIFIERS = [
  "혼밥", "1인", "바좌석", "1인석", "혼자 가기 좋은",
];
const GROUP_MODIFIERS = [
  "회식", "단체석", "모임", "가족모임", "룸", "프라이빗",
];
const DIET_MODIFIERS = [
  "비건", "채식", "할랄", "글루텐프리", "저염",
];
const SERVICE_MODIFIERS = [
  "예약", "배달", "포장", "주차", "야식", "24시간", "브레이크타임",
];

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
const MAX_PAGES_PER_QUERY = 5; // 1,31,61,...

// 전체 수집 상한(안전장치)
const MAX_QUERIES_PER_CATEGORY = 120;
const MAX_ITEMS_PER_CATEGORY = 300;

// 딜레이(ms)
const BASE_DELAY_MS = 140;

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
// 음식점용 키워드(키워드 태깅용)
const MOOD_LEX = {
  solo:       [/혼밥/, /1인/, /바좌석/, /혼자\s?가기\s?좋/],
  group:      [/단체석/, /단체\s?가능/, /회식/, /모임/, /가족모임/, /룸/, /프라이빗/],
  clean:      [/깔끔/, /청결/, /위생/],
  value:      [/가성비/, /가격\s?대비/, /합리적/, /저렴/, /싼편/],
  spicy:      [/매콤/, /매운맛/, /맵찔이/, /불맛/],
  queue:      [/웨이팅/, /대기줄/, /줄\s?길/, /대기\s?많/],
  late:       [/야식/, /24\s?시간/, /새벽/],
};

const FEATURE_LEX = {
  delivery:  [/배달/, /딜리버리/, /요기요/, /배민/, /쿠팡이츠/],
  takeout:   [/포장/, /테이크아웃/],
  parking:   [/주차/, /발렛/, /주차장/, /주차\s?가능/],
  reserve:   [/예약/, /reser?vation/i, /네이버\s?예약/],
  kids:      [/아이\s?동반/, /유아\s?의자/, /키즈/, /아기\s?의자/],
  room:      [/룸/, /프라이빗/, /개별\s?룸/, /별실/],
  alcohol:   [/술집/, /주류/, /맥주/, /사케/, /와인/, /소주/],
  vegan:     [/비건/, /채식/, /plant-?based/i],
  halal:     [/할랄/],
  glutenfree:[/글루텐\s?프리/],
};

// 키워드 태깅
function countHits(regexList, t) { let c = 0; for (const r of regexList) if (r.test(t)) c++; return c; }
function inferKeywords(text) {
  const t = normalizeText(text);
  const scores = {
    혼밥:       countHits(MOOD_LEX.solo, t),
    단체모임:   countHits(MOOD_LEX.group, t),
    깔끔함:     countHits(MOOD_LEX.clean, t),
    가성비:     countHits(MOOD_LEX.value, t),
    매운맛:     countHits(MOOD_LEX.spicy, t),
    웨이팅많음: countHits(MOOD_LEX.queue, t),
    야식가능:   countHits(MOOD_LEX.late, t),
  };
  return Object.entries(scores)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

// 기능/편의 태깅
function inferFeatures(text) {
  const t = normalizeText(text);
  const feats = {
    delivery:   countHits(FEATURE_LEX.delivery, t)   >= 1 || undefined,
    takeout:    countHits(FEATURE_LEX.takeout, t)    >= 1 || undefined,
    parking:    countHits(FEATURE_LEX.parking, t)    >= 1 || undefined,
    reserve:    countHits(FEATURE_LEX.reserve, t)    >= 1 || undefined,
    kids:       countHits(FEATURE_LEX.kids, t)       >= 1 || undefined,
    room:       countHits(FEATURE_LEX.room, t)       >= 1 || undefined,
    alcohol:    countHits(FEATURE_LEX.alcohol, t)    >= 1 || undefined,
    vegan:      countHits(FEATURE_LEX.vegan, t)      >= 1 || undefined,
    halal:      countHits(FEATURE_LEX.halal, t)      >= 1 || undefined,
    glutenfree: countHits(FEATURE_LEX.glutenfree, t) >= 1 || undefined,
  };
  if (countHits(MOOD_LEX.queue, t) >= 1) feats.queue = 1;
  if (countHits(MOOD_LEX.late, t)  >= 1) feats.late  = 1;
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

// (2) 블로그 강력 수집 (음식점 문맥에 맞춘 쿼리)
async function fetchBlogSnippetsStrong({ name, region, category }) {
  const variants = [
    `${name} ${region} 후기 리뷰 ${category||""}`,
    `${name} ${region} 메뉴 가격 ${category||""}`,
    `${name} ${region} 웨이팅 대기 ${category||""}`,
    `${name} ${region} 혼밥 1인 ${category||""}`,
    `${name} ${region} 예약 포장 배달 ${category||""}`,
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
  const qPrimary  = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
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
    const webFallback = await fetchWebSnippets(`${name} ${REGION_CANON} ${catLabel||""} 메뉴 가격 후기 웨이팅 예약 포장 배달`);
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;
  const baseText = normalizeText(baseTextRaw);

  // 추론
  let inferredKeywords = inferKeywords(baseText);
  const inferredFeatures = inferFeatures(baseText);

  // 혼밥/1인 신호가 강하면 키워드에 보강
  const hasSoloSignal = inferredKeywords.includes("혼밥") || inferredFeatures.room === false; // room=false는 의미 없음, guard만
  if (hasSoloSignal && !inferredKeywords.includes("혼밥")) inferredKeywords.push("혼밥");

  // 키워드 합집합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...inferredKeywords]));

  // features 얕은 병합 + 디버그 스니펫
  const mergedFeaturesWithDebug = {
    ...(existing?.features || {}),
    ...inferredFeatures,
    delivery:   (existing?.features?.delivery   || inferredFeatures.delivery)   || undefined,
    takeout:    (existing?.features?.takeout    || inferredFeatures.takeout)    || undefined,
    parking:    (existing?.features?.parking    || inferredFeatures.parking)    || undefined,
    reserve:    (existing?.features?.reserve    || inferredFeatures.reserve)    || undefined,
    kids:       (existing?.features?.kids       || inferredFeatures.kids)       || undefined,
    room:       (existing?.features?.room       || inferredFeatures.room)       || undefined,
    alcohol:    (existing?.features?.alcohol    || inferredFeatures.alcohol)    || undefined,
    vegan:      (existing?.features?.vegan      || inferredFeatures.vegan)      || undefined,
    halal:      (existing?.features?.halal      || inferredFeatures.halal)      || undefined,
    glutenfree: (existing?.features?.glutenfree || inferredFeatures.glutenfree) || undefined,
    queue:      (existing?.features?.queue      || inferredFeatures.queue)      || undefined,
    late:       (existing?.features?.late       || inferredFeatures.late)       || undefined,
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

  // 혼밥 신호 기반 is_solo_friendly 휴리스틱
  const soloHeuristic =
    /혼밥|1인|바좌석|혼자\s?가기\s?좋/.test(baseText) ||
    !!inferredFeatures.late; // 늦게까지 영업하는 곳은 혼밥도 용이한 경우가 많음(약한 신호)

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
    // 혼밥 신호 있으면 true로 갱신 (기존 true는 유지)
    is_solo_friendly: existing?.is_solo_friendly || soloHeuristic || true, 
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: catLabel,
    is_solo_friendly: soloHeuristic || true, // 기본적으로 true, 신호 있으면 더 확신
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
  const modifiers = [
    ...INTENT_MODIFIERS,
    ...MOOD_MODIFIERS,
    ...SOLO_MODIFIERS,
    ...GROUP_MODIFIERS,
    ...DIET_MODIFIERS,
    ...SERVICE_MODIFIERS,
  ];

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
          .replace("{subarea}", region) // subarea도 regionCombos로 일관 처리
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
  return list.slice(0, MAX_QUERIES_PER_CATEGORY);
}

// =================== 실행 루프 ===================
async function runCategory(cat) {
  const queries = composeQueriesForCategory(cat);
  console.log(`\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`);

  let upserts = 0;
  const seenSig = new Set();

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
