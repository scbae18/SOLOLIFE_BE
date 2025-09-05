// crawl_restaurants_enhanced_variants_with_geo.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 음식점 버전 (키워드 = "1인석"만, 오마카세 전면 제거)
 * - 지역(영통구) × 카테고리 동의어 × 수식어 × 템플릿 조합
 * - Naver Local 페이지네이션(start+=DISPLAY)
 * - 블로그/웹문서 스니펫으로 텍스트 보강 → 분위기/키워드 추론
 * - Google TextSearch → { place_id, lat, lng }
 * - Google Details → opening_hours + types (+ price_level)
 * - keywords: ["1인석"]만 저장
 * - moods: 카페 버전과 동일한 허용 집합
 */

const prisma = new PrismaClient();

// =================== 고정 정책 ===================
const REGION_CANON = "경기도 수원시 영통구";
const REGION_ALIASES = [
  "경기도 수원시 영통구",
  "수원시 영통구",
  "수원 영통구",
  "영통구",
];
const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동"];

// 카테고리: 음식점
const CATEGORY_KEYWORDS = ["음식점"];
const CATEGORY_SYNONYMS = {
  음식점: [
    "음식점", "식당", "맛집",
    "한식", "분식", "중식", "일식", "양식",
    "라멘", "초밥", "스시", "파스타", "피자", "고깃집", "쉐프코스",
  ],
};

// 수식어
const INTENT_MODIFIERS = ["인기", "추천", "베스트", "핫플", "신상", "숨은 명소", "로컬"];
const MOOD_MODIFIERS = ["분위기 좋은", "감성", "아늑한", "조용한", "힙한", "채광 좋은", "뷰 좋은"];
const DINING_MODIFIERS = ["예약", "웨이팅", "가성비", "가심비", "코스요리", "런치", "디너", "바 테이블", "카운터석", "1인석"];
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
const MAX_PAGES_PER_QUERY = 5;
const MAX_QUERIES_PER_CATEGORY = 120;
const MAX_ITEMS_PER_CATEGORY = 300;
const BASE_DELAY_MS = 140;

// opening_hours가 없으면 features.openingHours 폴백 사용 여부
const USE_FEATURES_FALLBACK = false;

// =================== API URL/ENV ===================
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL        = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL         = "https://openapi.naver.com/v1/search/webkr.json";
const GOOGLE_PLACES_TEXT    = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

const {
  NAVER_OPENAPI_CLIENT_ID,
  NAVER_OPENAPI_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY,
} = process.env;

if (!NAVER_OPENAPI_CLIENT_ID || !NAVER_OPENAPI_CLIENT_SECRET) {
  throw new Error("NAVER_OPENAPI_CLIENT_ID / NAVER_OPENAPI_CLIENT_SECRET 누락");
}
if (!GOOGLE_MAPS_API_KEY) {
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (좌표/영업시간/types 채우려면 필요)");
}

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
    catch (e) { last = e; await sleep(delay * (i + 1)); }
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

// =================== 허용 리스트 & 룰 ===================
// Mood(분위기): 카페 버전과 동일
const ALLOWED_MOOD_FEATURES = [
  "사람많은", "한적한", "넓은", "아늑한", "조용한", "활기찬", "밝은", "어두운",
];

// Keyword: "1인석"만
const ALLOWED_KEYWORDS = ["1인석"];

// 분위기 매핑 룰
const MOOD_RULES = {
  사람많은: [/사람\s*많/, /붐비/, /북적/, /바글/, /혼잡/, /웨이팅/, /줄\s*길/],
  한적한: [/한적/, /한산/, /널널/, /조용조용/, /사람\s*없/, /여유로/],
  넓은: [/넓/, /좌석\s*많/, /자리\s*여유/, /공간\s*넉넉/, /층고\s*높/],
  아늑한: [/아늑/, /포근/, /따뜻한\s*분위기/, /코지/, /감성\s*인테리어/],
  조용한: [/조용/, /소음\s*낮/, /시끄럽지\s*않/, /차분/, /고요/, /잔잔/],
  활기찬: [/활기/, /에너지/, /신나는/, /생기/, /북적/],
  밝은: [/밝/, /채광\s*좋/, /햇살\s*좋/, /창가/, /환해/],
  어두운: [/어둡/, /무드등/, /은은한\s*조명/, /저조도/],
};

// ===== 1인석(엄격) 키워드 판별기 =====
const ONESEAT_STRONG = [
  /1\s*인\s*석/, /일인석/, /카운터\s*석/, /바\s*(테이블|석)/,
];
const ONESEAT_WEAK = [
  /혼밥/, /혼자\s*(먹|가|가기\s*좋)/, /(자리|좌석)\s*여유/,
];
const ONESEAT_NEG = [
  /1\s*인\s*(분|세트|메뉴)/, // 좌석이 아니라 메뉴/세트는 제외
];

function matchAny(rules, text) {
  for (const r of rules) if (r.test(text)) return true;
  return false;
}

function inferMoodTags(textRaw) {
  const t = normalizeText(textRaw);
  const found = [];
  for (const tag of ALLOWED_MOOD_FEATURES) {
    const rules = MOOD_RULES[tag] || [];
    if (matchAny(rules, t)) found.push(tag);
  }
  if (found.includes("조용한") && found.includes("사람많은")) {
    const crowdStrong = matchAny([/웨이팅/, /줄\s*길/, /북적/, /붐비/], t);
    return crowdStrong ? found.filter((x) => x !== "조용한") : found.filter((x) => x !== "사람많은");
  }
  return Array.from(new Set(found));
}

function isOneSeat(text) {
  const t = normalizeText(text || "");
  if (ONESEAT_NEG.some((r) => r.test(t))) return false;
  let score = 0;
  if (ONESEAT_STRONG.some((r) => r.test(t))) score += 2;
  const weakHits = ONESEAT_WEAK.reduce((acc, r) => acc + (r.test(t) ? 1 : 0), 0);
  if (weakHits >= 2) score += 1;
  return score >= 2;
}

function inferKeywordTagsStrict({ textRaw }) {
  const out = [];
  if (isOneSeat(textRaw)) out.push("1인석");
  return Array.from(new Set(out));
}

// =================== 외부 API ===================
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

async function fetchBlogSnippetsStrong({ name, region, category }) {
  const variants = [
    `${name} ${region} 후기 리뷰 ${category||""}`,
    `${name} ${region} 1인석 혼밥 카운터석 ${category||""}`,
    `${name} ${region} 분위기 인테리어 ${category||""}`,
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
    } catch { /* ignore */ }
  }
  return merged.trim();
}

async function fetchWebSnippets(query, display=20) {
  const { data } = await withRetry(() =>
    axios.get(NAVER_WEB_URL, { headers: localHeaders, params: { query, display: Math.min(display, 30) }, timeout: 8000 })
  );
  const items = data?.items || [];
  return items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
}

async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
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

async function fetchPlaceDetails(placeId) {
  if (!placeId || !GOOGLE_MAPS_API_KEY) return null;
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_DETAILS, {
      params: {
        place_id: placeId,
        key: GOOGLE_MAPS_API_KEY,
        fields: "opening_hours,types,price_level",
        language: "ko",
      },
      timeout: 8000,
    })
  );
  const r = data?.result || {};
  const oh = r.opening_hours || null;
  return {
    opening_hours: oh
      ? { open_now: oh.open_now ?? null, weekday_text: oh.weekday_text ?? null, periods: oh.periods ?? null }
      : null,
    types: Array.isArray(r.types) ? r.types : [],
    price_level: typeof r.price_level === "number" ? r.price_level : null,
  };
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
    const webFallback = await fetchWebSnippets(
      `${name} ${REGION_CANON} ${catLabel||""} 후기 리뷰 1인석 혼밥 카운터석 분위기 조용 웨이팅`
    );
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;

  // Google 좌표 + place_id
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) {
    console.warn("[google:text] error", e?.message || e);
  }

  // Place 세부정보(영업시간 + types)
  let opening_hours = null;
  let place_types = [];
  try {
    if (coords.place_id) {
      const details = await fetchPlaceDetails(coords.place_id);
      opening_hours = details?.opening_hours || null;
      place_types = details?.types || [];
    }
    console.log(`[google:details] ${name} → hours=${opening_hours ? "ok" : "none"}, types=${place_types.join(",") || "none"}`);
  } catch (e) {
    console.warn("[google:details] error", e?.message || e);
  }

  // ====== 추론 ======
  const moodTags = inferMoodTags(baseTextRaw);
  const keywordTags = inferKeywordTagsStrict({ textRaw: baseTextRaw }); // 1인석만

  // 기존 값과 병합(허용 집합으로 필터)
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(
    new Set([...prevKeywords, ...keywordTags].filter(k => ALLOWED_KEYWORDS.includes(k)))
  );
  const prevFeaturesFlat = Array.isArray(existing?.features_flat) ? existing.features_flat : [];
  const mergedMoodFlat = Array.from(
    new Set([...prevFeaturesFlat, ...moodTags].filter(f => ALLOWED_MOOD_FEATURES.includes(f)))
  );

  // features JSON
  const featuresJson = {
    moods: mergedMoodFlat,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };
  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...featuresJson, openingHours: opening_hours }
    : featuresJson;

  // 업데이트/생성 페이로드
  const updatePayload = {
    location_name: name,
    address,
    latitude:  (coords.lat ?? existing?.latitude ?? null),
    longitude: (coords.lng ?? existing?.longitude ?? null),
    category: "음식점",
    description: desc || null,
    keywords: { set: mergedKeywords }, // ["1인석"]만
    features: featuresFinal,
    features_flat: { set: mergedMoodFlat },
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: "음식점",
    is_solo_friendly: true,
    description: desc || null,
    keywords: mergedKeywords,
    features: featuresFinal,
    features_flat: mergedMoodFlat,
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
    ` | moods=[${mergedMoodFlat.join(", ")}]` +
    ` | keywords=[${mergedKeywords.join(", ")}]` +
    (opening_hours ? " | hours✅" : " | hours✖")
  );
  return loc;
}

// =================== 바리에이션 생성 ===================
function uniquePush(arr, value) { if (value && !arr.includes(value)) arr.push(value); }
function composeQueriesForCategory(cat) {
  const catSyns = CATEGORY_SYNONYMS[cat] || [cat];
  const modifiers = [...INTENT_MODIFIERS, ...MOOD_MODIFIERS, ...DINING_MODIFIERS, ...FAMILY_POLICY];
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
          .replace("{subarea}", region)
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
      const start = 1 + page * DISPLAY;
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
      await runCategory(cat); // "음식점" 하나지만 구조 유지
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
