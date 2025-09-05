// crawl_locations_enhanced_variants_with_geo_wide_overwrite.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 광역 바리에이션 × 덮어쓰기 모드
 * - 지역(별칭/동/역/랜드마크/인접구/영문) × 카테고리 동의어 × 수식어 × 꼬리표 조합
 * - 네이버 지역검색 → 블로그/웹 스니펫 보강 → 제한형 태그 추론 → Google 좌표/영업시간
 * - 기존 레코드도 모두 upsert 갱신(스킵 없음)
 * - features_flat: ["사람많은","한적한","넓은","아늑한","조용한","활기찬","밝은","어두운"]만
 * - keywords: ["사진찍기 좋은","콘센트 많은"]만
 */

const prisma = new PrismaClient();

/* =================== 고정/튜닝 =================== */
const REGION_CANON = "경기도 수원시 영통구";

// 페이징/상한
const DISPLAY = 30;                 // 네이버 지역검색 페이지 크기(1~30)
const MAX_PAGES_PER_QUERY = 5;      // 쿼리당 페이지 수
const MAX_QUERIES_PER_CATEGORY = 400; // 생성 쿼리 상한(바리에이션 많아 상향)
const MAX_ITEMS_PER_CATEGORY = 650; // upsert 상한
const BASE_DELAY_MS = 140;

// opening_hours가 없을 때 features로 폴백 저장할지
const USE_FEATURES_FALLBACK = false;

/* =================== 외부 URL/ENV =================== */
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
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (좌표/영업시간 확보하려면 필요)");
}

const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  Accept: "application/json",
};

/* =================== 바리에이션 원천(확장) =================== */
const REGION_ALIASES = [
  "경기도 수원시 영통구", "수원시 영통구", "수원 영통구", "영통구",
  "경기 수원 영통구", "경기 영통구",
  "Suwon Yeongtong-gu", "Yeongtong-gu", "Yeongtong Suwon", "Yeongtong",
];

const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동", "이의동", "광교"];
const STATIONS = ["영통역", "망포역", "매탄권선역", "광교중앙역", "청명역", "광교중앙(아주대)역"];
const LANDMARKS = ["아주대학교", "경희대 국제캠퍼스", "광교호수공원", "수원컨벤션센터", "광교엘포트몰", "롯데백화점 수원"];
const NEIGHBOR_REGIONS = [
  "수원시 팔달구", "수원시 장안구", "수원시 권선구", "용인시 수지구", "용인시 기흥구",
  "Suwon Paldal-gu", "Suwon Jangan-gu", "Suwon Gwonseon-gu", "Yongin Suji-gu", "Yongin Giheung-gu",
];

// 카테고리(카페 고정 + 동의어)
const CATEGORY_KEYWORDS = ["카페"];
const CATEGORY_SYNONYMS = {
  카페: [
    "카페", "커피", "브런치 카페", "디저트 카페", "스터디 카페", "로스터리", "테이크아웃 카페",
    "cafe", "coffee", "brunch cafe", "dessert cafe", "study cafe", "roastery",
  ],
};

// 수식어/꼬리표
const MOD_INTENT = ["인기", "추천", "베스트", "핫플", "신상", "숨은 명소", "로컬"];
const MOD_MOOD   = ["분위기 좋은", "감성", "아늑한", "조용한", "힙한", "채광 좋은", "뷰 좋은", "한적한", "사람 많음"];
const MOD_STUDY  = ["카공", "스터디", "팀플", "노트북", "콘센트 많음", "와이파이", "좌석 여유"];
const MOD_POLICY = ["노키즈", "반려동물 동반", "데이트", "혼자 가기 좋은"];
const MOD_TIME   = ["야간", "늦게까지", "24시", "주말", "평일", "브런치", "아침", "심야"];
const MOD_NEARBY = ["근처", "가까운", "주변", "역세권", "호수공원 근처"];
const MOD_HASH   = ["#카공", "#감성카페", "#뷰맛집", "#노키즈", "#스터디카페", "#로스터리", "#인스타감성"];

const SUFFIXES = ["후기", "리뷰", "블로그", "인스타", "네이버", "가성비", "조용한", "자리 여유", "웨이팅"];

const QUERY_TEMPLATES = [
  "{region} {category}",
  "{region} {modifier} {category}",
  "{region} {category} {suffix}",
  "{region} {modifier} {category} {suffix}",
  "{sub} {category}",
  "{sub} {modifier} {category}",
  "{sub} {category} {suffix}",
  "{landmark} {category}",
  "{landmark} {modifier} {category}",
  "{station} {category}",
  "{station} {modifier} {category}",
  "{region} {nearby} {category}",
  "{sub} {nearby} {category}",
  "{neighbor} {nearby} {category}",
  "{region} {category} {time}",
  "{sub} {category} {time}",
  "{neighbor} {category} {time}",
  // 리뷰류
  "{region} {category} 후기",
  "{region} {category} 리뷰",
  "{region} {category} 블로그",
  "{region} {modifier} {category} 후기",
  "{sub} {category} 후기",
  "{station} {category} 후기",
];

/* =================== 유틸 =================== */
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

/* =================== 제한형 태그 룰 =================== */
const ALLOWED_MOOD_FEATURES = [
  "사람많은", "한적한", "넓은", "아늑한", "조용한", "활기찬", "밝은", "어두운",
];
const ALLOWED_KEYWORDS = ["사진찍기 좋은", "콘센트 많은"];

const MOOD_RULES = {
  사람많은: [/사람\s*많/, /붐비/, /북적/, /바글/, /혼잡/, /웨이팅/, /줄\s*길/],
  한적한: [/한적/, /한산/, /널널/, /조용조용/, /사람\s*없/, /여유로/],
  넓은: [/넓/, /좌석\s*많/, /자리\s*여유/, /공간\s*넉넉/, /층고\s*높/],
  아늑한: [/아늑/, /포근/, /따뜻한\s*분위기/, /코지/, /감성\s*인테리어/],
  조용한: [/조용/, /소음\s*낮/, /시끄럽지\s*않/, /차분/, /고요/, /잔잔/],
  활기찬: [/활기/, /에너지/, /신나는/, /북적/, /생기/],
  밝은: [/밝/, /채광\s*좋/, /햇살\s*좋/, /창가/, /환해/],
  어두운: [/어둡/, /무드등/, /은은한\s*조명/, /저조도/],
};

const KEYWORD_RULES = {
  "사진찍기 좋은": [/사진\s*찍기\s*좋/, /포토\s*존/, /인스타\s*감성/, /감성\s*샷/, /사진\s*맛집/, /포토\s*스팟/],
  "콘센트 많은":   [/콘센트\s*많/, /플러그/, /멀티탭/, /충전\s*가능/, /전원\s*가능/],
};

function matchAny(rules, text){ for(const r of rules) if(r.test(text)) return true; return false; }

function inferMoodTags(textRaw) {
  const t = normalizeText(textRaw);
  const found = [];
  for (const tag of ALLOWED_MOOD_FEATURES) {
    const rules = MOOD_RULES[tag] || [];
    if (matchAny(rules, t)) found.push(tag);
  }
  if (found.includes("조용한") && found.includes("사람많은")) {
    const crowdStrong = matchAny([/웨이팅/, /줄\s*길/, /북적/, /붐비/], t);
    return crowdStrong ? found.filter(x => x !== "조용한") : found.filter(x => x !== "사람많은");
  }
  return Array.from(new Set(found));
}
function inferKeywordTags(textRaw) {
  const t = normalizeText(textRaw);
  const out = [];
  for (const tag of ALLOWED_KEYWORDS) {
    const rules = KEYWORD_RULES[tag] || [];
    if (matchAny(rules, t)) out.push(tag);
  }
  return Array.from(new Set(out));
}

/* =================== 외부 호출 =================== */
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

/* =================== 업서트(덮어쓰기) =================== */
async function upsertLocation(item, catLabel) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // 보강 텍스트
  let extraText = await fetchBlogSnippetsStrong({ name, region: REGION_CANON, category: catLabel });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(`${name} ${REGION_CANON} ${catLabel||""} 후기 리뷰 카공 조용 콘센트 와이파이 포토존 사진맛집`);
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }
  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;

  // 제한형 태그 추론
  const moodTags    = inferMoodTags(baseTextRaw);
  const keywordTags = inferKeywordTags(baseTextRaw);

  // 기존 값과 허용 집합으로 병합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...keywordTags].filter(k => ALLOWED_KEYWORDS.includes(k))));

  const prevFeaturesFlat = Array.isArray(existing?.features_flat) ? existing.features_flat : [];
  const mergedMoodFlat = Array.from(new Set([...prevFeaturesFlat, ...moodTags].filter(f => ALLOWED_MOOD_FEATURES.includes(f))));

  // Google 좌표/영업시간
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) { console.warn("[google:text] error", e?.message || e); }

  let opening_hours = null;
  try {
    if (coords.place_id) opening_hours = await fetchPlaceOpeningHours(coords.place_id);
    console.log(`[google:hours] ${name} → ${opening_hours ? "ok" : "none"}`);
  } catch (e) { console.warn("[google:details] error", e?.message || e); }

  const featuresJson = { moods: mergedMoodFlat, _debugSnippet: baseTextRaw.slice(0, 200) };
  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...featuresJson, openingHours: opening_hours }
    : featuresJson;

  const updatePayload = {
    location_name: name,
    address,
    latitude:  (coords.lat ?? existing?.latitude ?? null),
    longitude: (coords.lng ?? existing?.longitude ?? null),
    category: "카페",
    description: desc || null,
    keywords: { set: mergedKeywords },
    features: featuresFinal,
    features_flat: { set: mergedMoodFlat },
    ...(opening_hours !== null ? { opening_hours } : {}),
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: "카페",
    is_solo_friendly: true,
    description: desc || null,
    keywords: mergedKeywords,
    features: featuresFinal,
    features_flat: mergedMoodFlat,
    ...(opening_hours !== null ? { opening_hours } : {}),
    dedupe_signature,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const loc = await prisma.location.upsert({
    where: { dedupe_signature },
    update: updatePayload,
    create: createPayload,
  });

  console.log(
    `[upsert] ${name} (${address || "no-addr"}) → id=${loc.location_id}` +
    ` | lat=${loc.latitude ?? "null"}, lng=${loc.longitude ?? "null"}` +
    ` | moods=[${mergedMoodFlat.join(", ")}] | keywords=[${mergedKeywords.join(", ")}]` +
    (opening_hours ? " | hours✅" : " | hours✖")
  );
  return loc;
}

/* =================== 쿼리 컴포지션(광역) =================== */
function uniqPush(arr, val){ if(val && !arr.includes(val)) arr.push(val); }
function composeQueriesForCategory(cat){
  const catSyns = CATEGORY_SYNONYMS[cat] || [cat];
  const modifiers = [...MOD_INTENT, ...MOD_MOOD, ...MOD_STUDY, ...MOD_POLICY, ...MOD_TIME, ...MOD_NEARBY, ...MOD_HASH];

  const regions = [];
  for (const r of REGION_ALIASES) uniqPush(regions, r);
  for (const r of REGION_ALIASES) for (const s of SUBAREAS) uniqPush(regions, `${r} ${s}`);
  for (const s of SUBAREAS) uniqPush(regions, s);
  for (const st of STATIONS) uniqPush(regions, st);
  for (const lm of LANDMARKS) uniqPush(regions, lm);
  for (const n of NEIGHBOR_REGIONS) uniqPush(regions, n);

  const queries = new Set();

  for (const category of catSyns) {
    for (const region of regions) {
      for (const tmpl of QUERY_TEMPLATES) {
        // base
        const base = tmpl
          .replaceAll("{region}", region)
          .replaceAll("{sub}", region)
          .replaceAll("{station}", region)
          .replaceAll("{landmark}", region)
          .replaceAll("{neighbor}", region)
          .replaceAll("{category}", category)
          .replaceAll("{nearby}", "")
          .replaceAll("{time}", "")
          .replaceAll("{modifier}", "")
          .replaceAll("{suffix}", "");
        queries.add(base.trim());

        // with modifiers/suffix/time/nearby
        for (const m of modifiers) {
          const suf = SUFFIXES[queries.size % SUFFIXES.length] || "";
          const qMod = tmpl
            .replaceAll("{region}", region)
            .replaceAll("{sub}", region)
            .replaceAll("{station}", region)
            .replaceAll("{landmark}", region)
            .replaceAll("{neighbor}", region)
            .replaceAll("{category}", category)
            .replaceAll("{modifier}", m)
            .replaceAll("{nearby}", m)
            .replaceAll("{time}", m)
            .replaceAll("{suffix}", suf);
          queries.add(qMod.trim());
        }

        // suffix-only
        for (const suf of SUFFIXES) {
          const qSuf = tmpl
            .replaceAll("{region}", region)
            .replaceAll("{sub}", region)
            .replaceAll("{station}", region)
            .replaceAll("{landmark}", region)
            .replaceAll("{neighbor}", region)
            .replaceAll("{category}", category)
            .replaceAll("{modifier}", "")
            .replaceAll("{nearby}", "")
            .replaceAll("{time}", "")
            .replaceAll("{suffix}", suf);
          queries.add(qSuf.trim());
        }
      }
    }
  }

  const list = Array.from(queries).filter(q => q.replace(/\s+/g,"").length >= 2);
  return list.slice(0, MAX_QUERIES_PER_CATEGORY);
}

/* =================== 실행 루프 =================== */
async function runCategory(cat){
  const queries = composeQueriesForCategory(cat);
  console.log(`\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`);

  let upserts = 0;
  const seenSig = new Set(); // 실행 중 중복 방지

  for (const q of queries) {
    for (let page=0; page<MAX_PAGES_PER_QUERY; page++){
      const start = 1 + page*DISPLAY;
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

  console.log(`[DONE] ${REGION_CANON} × ${cat} → inserted/updated ≈ ${upserts} (overwrite)`);
}

/* =================== main =================== */
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
