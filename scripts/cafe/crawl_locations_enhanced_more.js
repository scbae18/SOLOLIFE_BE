// crawl_locations_enhanced_variants_with_geo_exclude_existing.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 강화판(확장):
 * - 바리에이션 폭증(지역 별칭/동/역/랜드마크/영문표기 × 카테고리 동의어(한/영) × 수식어 × 템플릿)
 * - 구글 TextSearch → {place_id, lat, lng}, Details → opening_hours
 * - keywords는 합집합, features는 얕은 병합
 * - ✅ 기존 레코드 스킵 옵션 (중복/이미 풍부한 레코드 제외)
 */

const prisma = new PrismaClient();

/* =================== 설정 =================== */
const REGION_CANON = "경기도 수원시 영통구";

// ✅ 기존 레코드 스킵 정책
const EXCLUDE_EXISTING_ALL = true;             // 같은 dedupe_signature가 있으면 무조건 스킵
const EXCLUDE_WHEN_HAS_ENRICHMENT = true;      // lat/lng 또는 opening_hours 이미 있으면 스킵

// 수집 상한/페이징
const DISPLAY = 30;
const MAX_PAGES_PER_QUERY = 5;
const MAX_QUERIES_PER_CATEGORY = 220;          // ⬆️ 바리에이션 늘려서 상향
const MAX_ITEMS_PER_CATEGORY = 500;            // ⬆️ 상향 (원하면 줄여도 OK)
const BASE_DELAY_MS = 140;

// opening_hours 컬럼 없을 때 features에 임시 저장할지
const USE_FEATURES_FALLBACK = false;

/* =================== 외부 URL/키 =================== */
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
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (좌표/영업시간 채우려면 필요)");
}

const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  Accept: "application/json",
};

/* =================== 바리에이션 원천 =================== */
// 지역/동/역/랜드마크/영문표기
const REGION_ALIASES = [
  "경기도 수원시 영통구", "수원시 영통구", "수원 영통구", "영통구",
  "경기 수원 영통구", "경기 영통구",
  "Suwon Yeongtong-gu", "Yeongtong-gu", "Yeongtong Suwon", "Yeongtong"
];
const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동"];
const STATIONS = ["영통역", "망포역", "매탄권선역", "광교중앙역", "청명역"];
const LANDMARKS = ["아주대학교", "경희대 국제캠퍼스", "광교호수공원", "수원컨벤션센터"];

// 카테고리
const CATEGORY_KEYWORDS = ["카페"];
const CATEGORY_SYNONYMS = {
  카페: [
    // 한글
    "카페", "커피", "브런치 카페", "디저트 카페", "스터디 카페", "로스터리", "테이크아웃 카페",
    // 영어(영문 검색 대비)
    "cafe", "coffee", "brunch cafe", "dessert cafe", "study cafe", "roastery"
  ]
};

// 수식어들
const MOD_INTENT = ["인기", "추천", "베스트", "핫플", "신상", "숨은 명소", "로컬"];
const MOD_MOOD   = ["분위기 좋은", "감성", "아늑한", "조용한", "힙한", "채광 좋은", "뷰 좋은"];
const MOD_STUDY  = ["카공", "스터디", "팀플", "노트북", "콘센트 많음", "와이파이", "좌석 여유"];
const MOD_POLICY = ["노키즈", "반려동물 동반", "데이트", "혼자 가기 좋은"];
const MOD_TIME   = ["야간", "늦게까지", "24시", "주말", "평일", "브런치"];
const MOD_NEARBY = ["근처", "가까운", "주변", "역세권"];
const MOD_HASH   = ["#카공", "#감성카페", "#뷰맛집", "#노키즈", "#스터디카페", "#로스터리"];

// 템플릿 (조합 다양화)
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
  "{region} {category} {time}",
  "{sub} {category} {time}",
  // 리뷰/블로그/인스타 느낌
  "{region} {category} 후기",
  "{region} {category} 리뷰",
  "{region} {category} 블로그",
  "{region} {modifier} {category} 후기",
  "{sub} {category} 후기",
  "{station} {category} 후기",
];

// 후기/키워드 꼬리표
const SUFFIXES = ["후기", "리뷰", "블로그", "인스타", "네이버", "가성비", "조용한", "자리 여유"];

/* =================== 유틸/룰 =================== */
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
  crypto.createHash("sha256").update(`${(name||"").toLowerCase()}|${(address||"").toLowerCase()}`).digest("hex").slice(0,32);

// 룰(요약)
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
function countHits(rs, t){let c=0; for(const r of rs) if(r.test(t)) c++; return c;}
function inferKeywords(text){
  const t = normalizeText(text);
  const scores={조용:countHits(MOOD_LEX.quiet,t),공부:countHits(MOOD_LEX.study,t),감성:countHits(MOOD_LEX.cozy,t),콘센트많음:countHits(MOOD_LEX.outlets,t),넓음:countHits(MOOD_LEX.spacious,t),웨이팅많음:countHits(MOOD_LEX.queue,t)};
  return Object.entries(scores).filter(([,v])=>v>=1).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
}
function inferFeatures(text){
  const t = normalizeText(text);
  const feats={
    wifi:countHits(FEATURE_LEX.wifi,t)>=1||undefined,
    power:countHits(FEATURE_LEX.power,t)>=1||undefined,
    pet:countHits(FEATURE_LEX.pet,t)>=1||undefined,
    parking:countHits(FEATURE_LEX.parking,t)>=1||undefined,
    restroom:countHits(FEATURE_LEX.restroom,t)>=1||undefined,
    kidfree:countHits(FEATURE_LEX.kidfree,t)>=1||undefined,
    rooftop:countHits(FEATURE_LEX.rooftop,t)>=1||undefined,
    view:countHits(FEATURE_LEX.view,t)>=1||undefined,
  };
  if (countHits(MOOD_LEX.quiet,t)>=1) feats.noise=1;
  return feats;
}

/* =================== 외부 호출 =================== */
async function fetchLocal(query, start=1){
  const { data } = await withRetry(()=>axios.get(NAVER_LOCAL_URL,{headers:localHeaders, params:{query,display:DISPLAY,start,sort:"random"}, timeout:8000}));
  return data.items||[];
}
async function fetchBlogSnippetsStrong({name,region,category}){
  const variants=[
    `${name} ${region} 후기 리뷰 ${category||""}`,
    `${name} ${region} 카공 콘센트 ${category||""}`,
    `${name} ${region} 분위기 인테리어 ${category||""}`,
    `${name} ${region} 조용 공부 ${category||""}`,
    `${name} ${region} ${category||""}`,
  ];
  let merged=""; for(const q of variants){ try{
    const {data}=await withRetry(()=>axios.get(NAVER_BLOG_URL,{headers:localHeaders, params:{query:q,display:20}, timeout:8000}));
    const items=data?.items||[]; merged+=" "+items.map(it=>normalizeText(`${it.title} ${it.description}`)).join(" "); await sleep(80);
  }catch{} }
  return merged.trim();
}
async function fetchWebSnippets(query, display=20){
  const {data}=await withRetry(()=>axios.get(NAVER_WEB_URL,{headers:localHeaders, params:{query,display:Math.min(display,30)}, timeout:8000}));
  const items=data?.items||[]; return items.map(it=>normalizeText(`${it.title} ${it.description}`)).join(" ");
}
async function searchPlaceByText(name,address){
  if(!GOOGLE_MAPS_API_KEY) return null;
  const qPrimary = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
  const qFallback = `${name} ${REGION_CANON}`;
  const tryQ = async (q)=>{
    const params={query:q,key:GOOGLE_MAPS_API_KEY,language:"ko"};
    const {data}=await withRetry(()=>axios.get(GOOGLE_PLACES_TEXT,{params,timeout:8000}));
    const r=data?.results?.[0]; if(!r) return null;
    return {place_id:r.place_id??null, lat:r.geometry?.location?.lat??null, lng:r.geometry?.location?.lng??null};
  };
  let found=await tryQ(qPrimary); if(!found) found=await tryQ(qFallback); return found;
}
async function fetchPlaceOpeningHours(placeId){
  if(!placeId||!GOOGLE_MAPS_API_KEY) return null;
  const {data}=await withRetry(()=>axios.get(GOOGLE_PLACES_DETAILS,{params:{place_id:placeId,key:GOOGLE_MAPS_API_KEY,fields:"opening_hours",language:"ko"}, timeout:8000}));
  const oh=data?.result?.opening_hours; if(!oh) return null;
  return {open_now:oh.open_now??null, weekday_text:oh.weekday_text??null, periods:oh.periods??null};
}

/* =================== 기존 레코드 스킵 로딩 =================== */
async function loadExistingSignatures() {
  if (!EXCLUDE_EXISTING_ALL && !EXCLUDE_WHEN_HAS_ENRICHMENT) return { all: new Set(), enriched: new Set() };

  const all = new Set();
  const enriched = new Set();

  const pageSize = 1000;
  let skip = 0;
  while (true) {
    const rows = await prisma.location.findMany({
      select: { dedupe_signature: true, latitude: true, longitude: true, opening_hours: true },
      skip, take: pageSize,
    });
    if (!rows.length) break;
    for (const r of rows) {
      if (r.dedupe_signature) all.add(r.dedupe_signature);
      const hasGeo = r.latitude != null && r.longitude != null;
      const hasHours = r.opening_hours != null;
      if (hasGeo || hasHours) enriched.add(r.dedupe_signature);
    }
    skip += rows.length;
  }
  console.log(`[existing] loaded signatures: all=${all.size}, enriched=${enriched.size}`);
  return { all, enriched };
}

/* =================== 업서트 =================== */
async function upsertLocation(item, catLabel, skipSets) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  // ✅ 스킵 정책 체크
  if (EXCLUDE_EXISTING_ALL && skipSets.all.has(dedupe_signature)) {
    console.log(`[skip-existing] ${name}`);
    return null;
  }
  if (EXCLUDE_WHEN_HAS_ENRICHMENT && skipSets.enriched.has(dedupe_signature)) {
    console.log(`[skip-enriched] ${name}`);
    return null;
  }

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

  // features 얕은 병합 + 디버그
  const mergedFeatures = {
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

  // 구글 좌표/영업시간
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

  const featuresFinal = USE_FEATURES_FALLBACK && opening_hours
    ? { ...mergedFeatures, openingHours: opening_hours }
    : mergedFeatures;

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
  if (!USE_FEATURES_FALLBACK) { updatePayload.opening_hours = opening_hours; createPayload.opening_hours = opening_hours; }

  const loc = await prisma.location.upsert({ where: { dedupe_signature }, update: updatePayload, create: createPayload });

  console.log(`[upsert] ${name} → id=${loc.location_id} | lat=${loc.latitude??"null"}, lng=${loc.longitude??"null"} ${(opening_hours?"| hours✅":"| hours✖")}`);
  return loc;
}

/* =================== 쿼리 컴포지션 =================== */
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

  const queries = new Set();

  for (const category of catSyns) {
    for (const region of regions) {
      for (const tmpl of QUERY_TEMPLATES) {
        // base
        const base = tmpl
          .replace("{region}", region)
          .replace("{sub}", region)
          .replace("{station}", region)
          .replace("{landmark}", region)
          .replace("{category}", category)
          .replace("{nearby}", "")
          .replace("{time}", "")
          .replace("{modifier}", "")
          .replace("{suffix}", "");
        queries.add(base.trim());

        // with modifier/time/nearby/suffix
        for (const m of modifiers) {
          const qMod = tmpl
            .replace("{region}", region)
            .replace("{sub}", region)
            .replace("{station}", region)
            .replace("{landmark}", region)
            .replace("{category}", category)
            .replace("{modifier}", m)
            .replace("{nearby}", MOD_NEARBY.includes(m) ? m : m) // 자리 채움
            .replace("{time}", MOD_TIME.includes(m) ? m : m)
            .replace("{suffix}", SUFFIXES[queries.size % SUFFIXES.length] || "");
          queries.add(qMod.trim());
        }

        // suffix 조합만
        for (const suf of SUFFIXES) {
          const qSuf = tmpl
            .replace("{region}", region)
            .replace("{sub}", region)
            .replace("{station}", region)
            .replace("{landmark}", region)
            .replace("{category}", category)
            .replace("{modifier}", "")
            .replace("{nearby}", "")
            .replace("{time}", "")
            .replace("{suffix}", suf);
          queries.add(qSuf.trim());
        }
      }
    }
  }

  const list = Array.from(queries).filter(q => q.replace(/\s+/g,"").length >= 2);
  return list.slice(0, MAX_QUERIES_PER_CATEGORY);
}

/* =================== 실행 루프 =================== */
async function runCategory(cat, skipSets){
  const queries = composeQueriesForCategory(cat);
  console.log(`\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`);

  let upserts = 0;
  const seenSig = new Set();

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

        const loc = await upsertLocation(it, cat, skipSets);
        if (loc) upserts++;
        await sleep(BASE_DELAY_MS);
      }
      if (upserts >= MAX_ITEMS_PER_CATEGORY) break;
    }
    if (upserts >= MAX_ITEMS_PER_CATEGORY) break;
  }

  console.log(`[DONE] ${REGION_CANON} × ${cat} → inserted/updated ≈ ${upserts} (unique, after exclude rules)`);
}

/* =================== main =================== */
(async () => {
  try {
    const skipSets = await loadExistingSignatures();
    for (const cat of CATEGORY_KEYWORDS) {
      await runCategory(cat, skipSets);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
