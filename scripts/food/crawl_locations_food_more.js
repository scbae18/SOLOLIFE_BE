import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";


console.log("[boot]", { node: process.version, cwd: process.cwd(), hasEnv: !!process.env.NAVER_OPENAPI_CLIENT_ID, hasPrisma: !!process.env.DATABASE_URL });
const DRY_RUN = process.env.DRY_RUN === "1";
if (DRY_RUN) { const q = composeQueriesForCategory((CATEGORY_KEYWORDS && CATEGORY_KEYWORDS[0]) || "음식점"); console.log("[dry-run] queries=", q.length, q.slice(0, 50)); process.exit(0); }

/**
 * 최대 바리에이션(중복 억제 강화) 음식점 수집기
 * - 지역: 영통구 + 동 + 역 + 인접 랜드마크 + 별칭
 * - 카테고리: 음식점(맛집/식당/레스토랑/밥집) + 세부 요리(라멘/국밥/파스타...)
 * - 템플릿: 기본/후기/리뷰/블로그/메뉴/가격/웨이팅/예약/포장/배달/야식/브런치...
 * - 수식어: (1) 단일 (2) 2-콤보 (3) 3-콤보 조합
 * - 해시태그/검색 관용표현/의도 키워드 적극 포함
 * - 중복 억제: 정규화·불용어 제거·연속 중복 토큰 제거·Set
 * - 나머지 (네이버/구글/API/업서트) 로직은 그대로 강화판을 유지
 */

// =================== 설정 ===================
const prisma = new PrismaClient();

const REGION_CANON = "경기도 수원시 영통구";

// (1) 지역 바리에이션
const REGION_ALIASES = [
  "경기도 수원시 영통구", "수원시 영통구", "수원 영통구", "영통구",
];
const SUBAREAS = ["영통동", "망포동", "매탄동", "원천동"];
const STATIONS = ["영통역", "망포역", "청명역", "매탄권선역"];
const LANDMARKS = [
  "경희대학교 국제캠퍼스", "광교호수공원", "영통롯데마트", "망포홈플러스", "갤러리아광교"
];

// (2) 카테고리/동의어/세부요리
const CATEGORY_KEYWORDS = ["음식점"];
const CATEGORY_SYNONYMS = {
  음식점: [
    "맛집", "식당", "레스토랑", "밥집",
    // 세부 종류(원하는 만큼 확장)
    "한식", "중식", "일식", "양식", "분식",
    "라멘", "우동", "초밥", "덮밥", "한우", "삼겹살",
    "국밥", "설렁탕", "곰탕", "순대국", "냉면",
    "파스타", "스테이크", "피자", "버거", "치킨",
    "곱창", "막창", "전골", "샤브샤브", "쭈꾸미",
    "해물", "회", "족발", "보쌈", "찜닭", "칼국수",
  ],
};

// (3) 수식어 버킷
const INTENT_MODIFIERS = [
  "인기", "추천", "베스트", "핫플", "로컬", "줄서는", "줄안서는"
];
const MOOD_MODIFIERS = [
  "가성비 좋은", "분위기 좋은", "깔끔한", "넓은"
];
const SOLO_MODIFIERS = ["혼밥", "1인", "바좌석", "혼자 가기 좋은"];
const GROUP_MODIFIERS = ["회식", "단체석", "모임", "가족모임", "룸", "프라이빗"];
const DIET_MODIFIERS = ["비건", "채식", "할랄", "글루텐프리", "저염"];
const SERVICE_MODIFIERS = ["예약", "배달", "포장", "주차", "야식", "브레이크타임"];
const TIME_MODIFIERS = ["아침", "점심", "런치", "브런치", "저녁", "디너", "야식"];
const PRICE_MODIFIERS = ["저렴한", "가성비", "합리적", "고급", "코스"];

// (4) 템플릿 (지역/세부지역/역/랜드마크 지원)
const QUERY_TEMPLATES = [
  "{region} {category}",
  "{region} {modifier} {category}",
  "{region} {category} 메뉴",
  "{region} {category} 가격",
  "{region} {category} 후기",
  "{region} {category} 리뷰",
  "{region} {category} 블로그",
  "{region} {modifier} {category} 후기",
  "{region} {modifier} {category} 리뷰",
  "{region} {modifier} {category} 블로그",
  "{region} {category} 웨이팅",
  "{region} {category} 예약",
  "{region} {category} 포장",
  "{region} {category} 배달",
  "{region} {category} 야식",
  "{region} {category} 브런치",
  "{region} {category} 점심",
  "{region} {category} 저녁",
  // 해시태그/관용
  "{region} #{category}",
  "{region} #{modifier} #{category}",
];

// 네이버 지역검색 파라미터
const DISPLAY = 30;
const MAX_PAGES_PER_QUERY = 6; // 페이지 더 넓힘

// 상한
const MAX_QUERIES_PER_CATEGORY = 240; // 이전 120 → 240으로 확대
const MAX_ITEMS_PER_CATEGORY = 500;   // 업서트 상한 완만히 상향

// 딜레이
const BASE_DELAY_MS = 140;

// opening_hours 컬럼 폴백
const USE_FEATURES_FALLBACK = false;

// =================== 외부 API URL ===================
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL        = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL         = "https://openapi.naver.com/v1/search/webkr.json";
const GOOGLE_PLACES_TEXT    = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

// =================== env ===================
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
function normalizeQuery(q = "") {
  return q
    // 해시태그 사이 공백/중복 처리, 특수문자 정리
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+#/g, " #")
    .replace(/#{2,}/g, "#")
    .replace(/\s{2,}/g, " ");
}

/** 토큰 단위 중복 제거 + 불용어 제거 */
const STOPWORDS = new Set(["에서", "근처", "근방", "주변", "인근", "부근", "역근처", "역", "맛"]);
function dedupeTokens(q) {
  const toks = q.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let t of toks) {
    if (/^#/.test(t)) t = t.toLowerCase(); // 해시태그는 소문자
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  // 연속 중복 방지(예: "맛집 맛집")
  return out.filter((t, i) => i === 0 || t !== out[i - 1]).join(" ");
}

function canon(q) { return dedupeTokens(normalizeQuery(q)); }

function uniquePush(arr, value) { const v = canon(value); if (v && !arr.includes(v)) arr.push(v); }

/** 배열에서 k-콤비네이션(순서 무시) 생성 */
function kCombinations(arr, k) {
  const res = [];
  (function backtrack(start, path) {
    if (path.length === k) { res.push(path.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]); backtrack(i + 1, path); path.pop();
    }
  })(0, []);
  return res;
}

// =================== 룰(키워드/피처 추론) — (이전 버전과 동일 아이디어)
// … (여기서는 길이 줄이려고 핵심만 요약. 기존 너가 쓰던 inferKeywords/inferFeatures 그대로 넣어도 동작)
// 필요하면 내가 만든 음식점 LEX 그대로 붙여줄게. ↓ 간단 버전만 포함
const MOOD_LEX = {
  solo: [/혼밥/, /1인/, /바좌석/, /혼자\s?가기\s?좋/],
  group: [/단체석/, /회식/, /모임/, /가족모임/, /룸/],
  clean: [/깔끔/, /청결/, /위생/],
  value: [/가성비/, /합리적/, /저렴/],
  spicy: [/매콤/, /매운맛/],
  queue: [/웨이팅/, /대기줄/],
  late: [/야식/, /24\s?시간/, /새벽/],
};
const FEATURE_LEX = {
  delivery: [/배달/, /요기요/, /배민/],
  takeout: [/포장/, /테이크아웃/],
  parking: [/주차/, /발렛/, /주차장/],
  reserve: [/예약/, /네이버\s?예약/],
  kids: [/아이\s?동반/, /유아\s?의자/],
  room: [/룸/, /프라이빗/, /별실/],
  alcohol: [/술집/, /맥주/, /사케/, /와인/],
  vegan: [/비건/, /채식/],
  halal: [/할랄/],
  glutenfree: [/글루텐\s?프리/],
};
function countHits(regexList, t) { let c = 0; for (const r of regexList) if (r.test(t)) c++; return c; }
function normalizeText(s = "") {
  return s.replace(/<[^>]*>/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function inferKeywords(text) {
  const t = normalizeText(text);
  const scores = {
    혼밥: countHits(MOOD_LEX.solo, t),
    단체모임: countHits(MOOD_LEX.group, t),
    깔끔함: countHits(MOOD_LEX.clean, t),
    가성비: countHits(MOOD_LEX.value, t),
    매운맛: countHits(MOOD_LEX.spicy, t),
    웨이팅많음: countHits(MOOD_LEX.queue, t),
    야식가능: countHits(MOOD_LEX.late, t),
  };
  return Object.entries(scores).filter(([, v]) => v >= 1).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
}
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

// =================== 외부 API 호출 (이전 로직과 동일)
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
    } catch {}
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

// =================== 업서트 (이전과 동일 컨셉, 혼밥 휴리스틱 유지)
async function upsertLocation(item, catLabel) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = crypto.createHash("sha256")
    .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
    .digest("hex").slice(0, 32);

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  let extraText = await fetchBlogSnippetsStrong({ name, region: REGION_CANON, category: catLabel });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(`${name} ${REGION_CANON} ${catLabel||""} 메뉴 가격 후기 웨이팅 예약 포장 배달`);
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;
  const baseText = normalizeText(baseTextRaw);

  const inferredKeywords = inferKeywords(baseText);
  const inferredFeatures = inferFeatures(baseText);

  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...inferredKeywords]));

  const featuresFinal = {
    ...(existing?.features || {}),
    ...inferredFeatures,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };

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

  const soloHeuristic = /혼밥|1인|바좌석|혼자\s?가기\s?좋/.test(baseText);

  const updatePayload = {
    location_name: name,
    address,
    latitude:  (coords.lat ?? existing?.latitude ?? null),
    longitude: (coords.lng ?? existing?.longitude ?? null),
    category: catLabel,
    description: desc || null,
    keywords: { set: mergedKeywords },
    features: featuresFinal,
    is_solo_friendly: existing?.is_solo_friendly || soloHeuristic || true,
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: catLabel,
    is_solo_friendly: soloHeuristic || true,
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

// =================== 바리에이션 생성 (하이라이트!) ===================
function composeRegionCombos() {
  const base = new Set();
  const push = (s) => base.add(canon(s));

  // 단일 지역
  [...REGION_ALIASES, ...SUBAREAS, ...STATIONS, ...LANDMARKS].forEach(r => push(r));

  // alias + subarea/역/랜드마크 결합
  for (const a of REGION_ALIASES) {
    for (const b of [...SUBAREAS, ...STATIONS, ...LANDMARKS]) {
      push(`${a} ${b}`);
    }
  }

  // “근처/주변/인근/부근/역 근처” 관용 표현
  const vicinity = ["근처", "주변", "인근", "부근", "역 근처"];
  for (const r of [...base]) {
    for (const v of vicinity) push(`${r} ${v}`);
  }

  return Array.from(base);
}

function composeModifierCombos() {
  const pool = [
    ...INTENT_MODIFIERS,
    ...MOOD_MODIFIERS,
    ...SOLO_MODIFIERS,
    ...GROUP_MODIFIERS,
    ...DIET_MODIFIERS,
    ...SERVICE_MODIFIERS,
    ...TIME_MODIFIERS,
    ...PRICE_MODIFIERS,
  ];

  const uniq = Array.from(new Set(pool.map(canon)));
  const result = new Set();

  // 단일
  uniq.forEach(m => result.add(m));

  // 2-콤보 (순서 무시)
  for (const comb of kCombinations(uniq, 2)) {
    result.add(canon(comb.join(" ")));
  }

  // 3-콤보 (개수 급증 → 상한 제한)
  const three = kCombinations(uniq, 3);
  // 상한: 앞쪽 200개만 사용 (원하면 늘려도 됨)
  three.slice(0, 200).forEach(c => result.add(canon(c.join(" "))));

  return Array.from(result);
}

function composeCategoryVariants(cat) {
  const syns = CATEGORY_SYNONYMS[cat] || [cat];
  const set = new Set();

  // 단일
  syns.forEach(s => set.add(canon(s)));

  // 이중 결합(예: 라멘 맛집, 국밥 맛집)
  for (const comb of kCombinations(syns, 2)) {
    set.add(canon(comb.join(" ")));
    // 해시태그 버전
    set.add(canon(`#${comb[0]} #${comb[1]}`));
  }

  // 해시태그 단일
  syns.forEach(s => set.add(canon(`#${s}`)));

  return Array.from(set);
}

function composeQueriesForCategory(cat) {
  const regionCombos = composeRegionCombos();
  const modifiers = composeModifierCombos();
  const catVariants = composeCategoryVariants(cat);

  const queries = new Set();

  // 템플릿 × 지역 × (카테고리 변형) × (수식어 ∈ {없음 + 단일/2-콤보/3-콤보})
  for (const region of regionCombos) {
    for (const category of catVariants) {
      for (const tmpl of QUERY_TEMPLATES) {
        // 수식어 없이 1세트
        const baseQ = canon(
          tmpl.replace("{region}", region)
              .replace("{category}", category.replace(/^#/, "")) // 본문에는 해시태그 제거
              .replace("{modifier}", "")
        );
        queries.add(baseQ);

        // 해시태그 카테고리 템플릿
        if (/#/.test(category)) {
          const hashQ = canon(`${region} ${category}`);
          queries.add(hashQ);
        }

        // 수식어 결합 (단일/콤보)
        for (const m of modifiers) {
          const q = canon(
            tmpl.replace("{region}", region)
                .replace("{category}", category.replace(/^#/, ""))
                .replace("{modifier}", m)
          );
          queries.add(q);

          // 해시태그 확장(간단 버전)
          if (!/#/.test(category)) {
            const hashQ2 = canon(`${region} #${m.replace(/\s+/g, "")} #${category.replace(/\s+/g, "")}`);
            queries.add(hashQ2);
          }
        }
      }
    }
  }

  // 최종 리스트 상한 컷 + 안정적 셔플(의미상 무작위)
  const list = Array.from(queries);
  // 간단 셔플
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 9301 + 49297) % 1 + 1) % 1 * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
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
        const sig = crypto.createHash("sha256")
          .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
          .digest("hex").slice(0, 32);
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
