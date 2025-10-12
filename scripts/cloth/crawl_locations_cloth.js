// crawl_clothes_wide_coverage.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 옷(영통권) 크롤러 - 최대 커버리지 버전
 * - 지역 × 카테고리(동의어)만 사용하여 광범위 탐색
 * - feature(무드 태그) 로직은 그대로 유지
 * - category는 "옷"으로 저장
 * - keywords는 ["빈티지"]만 저장(규칙 기반 추론)
 * - Google TextSearch로 { place_id, lat, lng }만 사용 (가능 시)
 * - description/opening_hours/price/rating/photo는 저장하지 않음
 */

const prisma = new PrismaClient();

// =================== 지역 설정 ===================
const REGION_CANON = "경기도 수원시 영통구";
const REGION_ALIASES = [
  "경기도 수원시 영통구",
  "수원시 영통구",
  "수원 영통구",
  "영통구",
];

const SUBAREAS = [
  "영통동",
  "망포동",
  "매탄동",
  "원천동",
  "이의동",
  "하동",
  "상현동",
  "우만동",
  "권선동",
  "매교동",
];

const STATIONS = ["영통역", "망포역", "청명역", "매탄권선역", "광교중앙역", "광교역"];

const LANDMARKS = [
  "경희대학교 국제캠퍼스",
  "광교호수공원",
  "영통롯데마트",
  "망포홈플러스",
  "갤러리아광교",
  "수원컨벤션센터",
  "광교아울렛",
  "광교로데오",
  "영통로데오",
  "영통사거리",
];

const ADJACENT_DISTRICTS = [
  "수원시 장안구",
  "수원시 팔달구",
  "수원시 권선구",
  "용인시 수지구",
  "용인시 기흥구",
];

// =================== 카테고리(동의어) ===================
const CATEGORY_KEYWORDS = ["옷"]; // 메인 카테고리 키워드
const CATEGORY_SYNONYMS = {
  옷: [
    // 상위/일반
    "옷",
    "의류",
    "패션",
    "의상",
    "의복",
    "쇼핑",
    // 타입/형태
    "의류매장",
    "옷가게",
    "편집샵",
    "셀렉샵",
    "부티크",
    "편집숍",
    "스트리트",
    "캐주얼",
    "빈티지샵",
    "구제샵",
    "디자이너샵",
    "편집 스토어",
    // 성별/카테고리 분화
    "남성의류",
    "여성의류",
    "유니섹스",
    "데님샵",
    // 쇼핑 맥락(커버리지 확대용)
    "패션 매장",
    "패션 쇼핑",
    "옷 쇼핑",
    "패션 편집샵",
  ],
};

// =================== 쿼리 템플릿 (의류에 맞춤) ===================
const QUERY_TEMPLATES = [
  "{region} {category}",
  "{region} {category} 쇼핑",
  "{region} {category} 추천",
];

// ===== 상한/페이지/속도 =====
const DISPLAY = 30; // Naver Local: 페이지당 최대 30
const MAX_PAGES_PER_QUERY = 10; // 쿼리당 최대 300건
const MAX_QUERIES_PER_CATEGORY = 500; // 카테고리당 쿼리 500개
const MAX_ITEMS_PER_CATEGORY = 2000; // 실제 upsert 최대치
const BASE_DELAY_MS = 220; // RPS 완화

// =================== API URL/ENV ===================
const NAVER_LOCAL_URL = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL = "https://openapi.naver.com/v1/search/webkr.json";
const GOOGLE_PLACES_TEXT =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";

const {
  NAVER_OPENAPI_CLIENT_ID,
  NAVER_OPENAPI_CLIENT_SECRET,
  GOOGLE_MAPS_API_KEY,
} = process.env;

if (!NAVER_OPENAPI_CLIENT_ID || !NAVER_OPENAPI_CLIENT_SECRET) {
  throw new Error("NAVER_OPENAPI_CLIENT_ID / NAVER_OPENAPI_CLIENT_SECRET 누락");
}
if (!GOOGLE_MAPS_API_KEY) {
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 (좌표 채우려면 필요)");
}

const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  Accept: "application/json",
};

// =================== 유틸/정규화 ===================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 3, delay = 400) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      console.error("[HTTP ERROR try", i + 1, "]", e?.response?.status, e?.message);
      last = e;
      await sleep(delay * (i + 1));
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

function toDecimalString6(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  return Number(v).toFixed(6);
}

// 쿼리 정규화/중복 억제
const STOPWORDS = new Set([
  "에서",
  "근처",
  "근방",
  "주변",
  "인근",
  "부근",
  "역근처",
  "역",
  "맛", // 의류에도 영향 없지만 보수적으로 제거
]);

function normalizeQuery(q = "") {
  return q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s{2,}/g, " ");
}

function dedupeTokens(q) {
  const toks = q.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let t of toks) {
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.filter((t, i) => i === 0 || t !== out[i - 1]).join(" ");
}

const canon = (q) => dedupeTokens(normalizeQuery(q));

const makeDedupeSig = ({ name, address }) =>
  crypto
    .createHash("sha256")
    .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);

// =================== feature(무드) 규칙 (그대로 유지) ===================
const ALLOWED_MOOD_FEATURES = [
  "사람많은",
  "한적한",
  "넓은",
  "아늑한",
  "조용한",
  "활기찬",
  "밝은",
  "어두운",
];

// 키워드: "빈티지" 한 가지
const ALLOWED_KEYWORDS = ["빈티지"];

// 무드 규칙
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

// ====== 의류 키워드 추론 규칙 (빈티지) ======
const VINTAGE_STRONG = [
  /빈티지/,
  /구제/,
  /레트로/,
  /아메카지/,
  /밀리터리\s*빈티지/,
  /워크웨어/,
  /러기드/,
  /래그드/, // 흔한 표기 변형
  /데드스탁/,
  /dead\s*stock/i,
  /thrift/i,
  /thrifting/i,
  /second\s*hand/i,
  /pre[\s-]*owned/i,
];

const VINTAGE_WEAK = [
  /리셀/,
  /아카이브/,
  /올드/,
  /리워크/,
  /리메이크/,
  /빈티지무드/,
  /old\s*school/i,
  /retro/i,
];

// 1) 무드 태그 추론
const matchAny = (rules, text) => rules.some((r) => r.test(text));

function inferMoodTags(textRaw) {
  const t = normalizeText(textRaw);
  const found = [];
  for (const tag of ALLOWED_MOOD_FEATURES) {
    const rules = MOOD_RULES[tag] || [];
    if (matchAny(rules, t)) found.push(tag);
  }
  // 상충 조정
  if (found.includes("조용한") && found.includes("사람많은")) {
    const crowdStrong = matchAny(
      [/웨이팅/, /줄\s*길/, /북적/, /붐비/],
      t
    );
    return crowdStrong
      ? found.filter((x) => x !== "조용한")
      : found.filter((x) => x !== "사람많은");
  }
  return Array.from(new Set(found));
}

// 2) 키워드(빈티지) 추론 (점수 기반)
function inferFashionKeywordTags({ textRaw }) {
  const t = normalizeText(textRaw || "");
  let score = 0;

  if (VINTAGE_STRONG.some((r) => r.test(t))) score += 2;

  const weakHits = VINTAGE_WEAK.reduce((acc, r) => acc + (r.test(t) ? 1 : 0), 0);
  if (weakHits >= 2) score += 1;

  const out = [];
  if (score >= 2) out.push("빈티지");

  return Array.from(new Set(out));
}

// =================== 캐시 ===================
const SNIPPET_CACHE = new Map();
const GOOGLE_TEXT_CACHE = new Map();

// =================== 외부 API ===================
async function fetchLocal(query, start = 1) {
  const fn = () =>
    axios.get(NAVER_LOCAL_URL, {
      headers: localHeaders,
      params: { query, display: DISPLAY, start, sort: "random" },
      timeout: 8000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 429,
    });

  const { data } = await withRetry(
    async () => {
      const res = await fn();
      if (res.status === 429) throw new Error("NAVER_RATE_LIMIT");
      return res;
    },
    5,
    600
  );

  return data.items || [];
}

async function fetchBlogSnippetsStrong({ name, region, category }) {
  const key = `BLOG:${name}|${region}|${category || ""}`;
  if (SNIPPET_CACHE.has(key)) return SNIPPET_CACHE.get(key);

  const variants = [
    `${name} ${region} 후기 리뷰 ${category || ""}`,
    `${name} ${region} 분위기 옷 의류 패션 ${category || ""}`,
    `${name} ${region} 빈티지 구제 레트로 ${category || ""}`,
    `${name} ${region} ${category || ""}`,
  ];

  let merged = "";
  for (const q of variants) {
    try {
      const { data } = await withRetry(
        () =>
          axios.get(NAVER_BLOG_URL, {
            headers: localHeaders,
            params: { query: q, display: 20 },
            timeout: 8000,
          }),
        3,
        400
      );
      const items = data?.items || [];
      merged +=
        " " +
        items
          .map((it) => normalizeText(`${it.title} ${it.description}`))
          .join(" ");
      await sleep(60);
    } catch {}
  }

  merged = merged.trim();
  SNIPPET_CACHE.set(key, merged);
  return merged;
}

async function fetchWebSnippets(query, display = 20) {
  const key = `WEB:${query}|${display}`;
  if (SNIPPET_CACHE.has(key)) return SNIPPET_CACHE.get(key);

  const { data } = await withRetry(
    () =>
      axios.get(NAVER_WEB_URL, {
        headers: localHeaders,
        params: { query, display: Math.min(display, 30) },
        timeout: 8000,
      }),
    3,
    400
  );

  const items = data?.items || [];
  const merged = items
    .map((it) => normalizeText(`${it.title} ${it.description}`))
    .join(" ");
  SNIPPET_CACHE.set(key, merged);
  return merged;
}

// Google: TextSearch → place_id, lat, lng (ONLY)
async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const qPrimary = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
  const qFallback = `${name} ${REGION_CANON}`;
  const keys = [qPrimary, qFallback];

  for (const q of keys) {
    if (GOOGLE_TEXT_CACHE.has(q)) return GOOGLE_TEXT_CACHE.get(q);
    try {
      const params = { query: q, key: GOOGLE_MAPS_API_KEY, language: "ko" };
      const { data } = await withRetry(
        async () => {
          const res = await axios.get(GOOGLE_PLACES_TEXT, {
            params,
            timeout: 8000,
          });
          if (res?.data?.status === "OVER_QUERY_LIMIT") {
            throw new Error("OVER_QUERY_LIMIT");
          }
          return res;
        },
        4,
        800
      );

      const r = data?.results?.[0];
      const found = r
        ? {
            place_id: r.place_id ?? null,
            lat: r.geometry?.location?.lat ?? null,
            lng: r.geometry?.location?.lng ?? null,
          }
        : null;

      GOOGLE_TEXT_CACHE.set(q, found);
      if (found) return found;
    } catch (e) {
      if (String(e?.message).includes("OVER_QUERY_LIMIT")) {
        console.warn("[google:text] quota hit; backing off more");
        await sleep(2000);
        continue;
      }
      console.warn("[google:text] error", e?.message || e);
    }
  }

  return null;
}

// =================== 업서트 ===================
async function upsertLocation(item, catLabel) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  const existing = await prisma.location.findUnique({
    where: { dedupe_signature },
  });

  // 텍스트 보강(무드/키워드 추론용)
  let extraText = await fetchBlogSnippetsStrong({
    name,
    region: REGION_CANON,
    category: catLabel,
  });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(
      `${name} ${REGION_CANON} ${catLabel || ""} 후기 리뷰 빈티지 구제 레트로`
    );
    extraText = `${extraText || ""} ${webFallback || ""}`.trim();
  }

  const baseTextRaw = `${name} ${desc} ${extraText || ""} ${catLabel || ""}`;

  // Google 좌표
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(
      `[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${
        coords.lat
      }, lng=${coords.lng}`
    );
  } catch (e) {
    console.warn("[google:text] error", e?.message || e);
  }

  // 태깅
  const moodTags = inferMoodTags(baseTextRaw);
  const keywordTags = inferFashionKeywordTags({ textRaw: baseTextRaw });

  // 병합(허용 집합 필터)
  const prevKeywords = Array.isArray(existing?.keywords)
    ? existing.keywords
    : [];
  const mergedKeywords = Array.from(
    new Set(
      [...prevKeywords, ...keywordTags].filter((k) =>
        ALLOWED_KEYWORDS.includes(k)
      )
    )
  );

  const prevFeaturesFlat = Array.isArray(existing?.features_flat)
    ? existing.features_flat
    : [];
  const mergedMoodFlat = Array.from(
    new Set(
      [...prevFeaturesFlat, ...moodTags].filter((f) =>
        ALLOWED_MOOD_FEATURES.includes(f)
      )
    )
  );

  const featuresJson = {
    moods: mergedMoodFlat,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };

  const latStr =
    coords.lat != null
      ? toDecimalString6(coords.lat)
      : existing?.latitude
      ? String(existing.latitude)
      : null;
  const lngStr =
    coords.lng != null
      ? toDecimalString6(coords.lng)
      : existing?.longitude
      ? String(existing.longitude)
      : null;

  const updatePayload = {
    location_name: name,
    address,
    latitude: latStr,
    longitude: lngStr,
    category: "옷",
    keywords: { set: mergedKeywords || [] },
    features: featuresJson,
    features_flat: { set: mergedMoodFlat || [] },
    ...(coords.place_id ? { google_place_id: coords.place_id } : {}),
  };

  const createPayload = {
    location_name: name,
    address,
    latitude: latStr,
    longitude: lngStr,
    category: "옷",
    is_solo_friendly: true,
    keywords: mergedKeywords || [],
    features: featuresJson,
    features_flat: mergedMoodFlat || [],
    ...(coords.place_id ? { google_place_id: coords.place_id } : {}),
    dedupe_signature,
  };

  const loc = await prisma.location.upsert({
    where: { dedupe_signature },
    update: updatePayload,
    create: createPayload,
  });

  console.log(
    `[upsert] ${name} (${address || "no-addr"}) → id=${loc.location_id}\n` +
      ` | lat=${loc.latitude ?? "null"}, lng=${loc.longitude ?? "null"}\n` +
      ` | moods=[${mergedMoodFlat.join(", ")}]\n` +
      ` | keywords=[${mergedKeywords.join(", ")}]`
  );

  return loc;
}

// =================== 쿼리 조합 (넓게) ===================
function composeRegionCombos() {
  const base = new Set();
  const push = (s) => base.add(canon(s));

  // 단일 지역 토큰
  [...REGION_ALIASES, ...SUBAREAS, ...STATIONS, ...LANDMARKS].forEach(push);

  // alias × (동/역/랜드마크)
  for (const a of REGION_ALIASES) {
    for (const b of [...SUBAREAS, ...STATIONS, ...LANDMARKS]) {
      push(`${a} ${b}`);
      if (base.size > 4000) break;
    }
  }

  // 인접 구 교차
  for (const adj of ADJACENT_DISTRICTS) {
    push(`${adj}`);
    for (const b of [...STATIONS, ...LANDMARKS]) {
      push(`${adj} ${b}`);
      if (base.size > 6000) break;
    }
  }

  return Array.from(base);
}

function composeCategoryVariants(cat) {
  const syns = CATEGORY_SYNONYMS[cat] || [cat];
  const set = new Set();
  syns.forEach((s) => set.add(canon(s))); // 해시태그/수식어 없음
  return Array.from(set);
}

const CAP = { q: MAX_QUERIES_PER_CATEGORY };

function composeQueriesForCategory(cat) {
  console.time("compose");
  const regionCombos = composeRegionCombos();
  const catVariants = composeCategoryVariants(cat);

  const queries = new Set();

  outer: for (const region of regionCombos) {
    for (const category of catVariants) {
      for (const tmpl of QUERY_TEMPLATES) {
        queries.add(
          canon(
            tmpl.replace("{region}", region).replace("{category}", category)
          )
        );
        if (queries.size >= CAP.q) break outer;
      }
    }
  }

  const list = Array.from(queries);

  // 가벼운 셔플(의사 난수)
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(
      (((Math.sin(i * 9301 + 49297) % 1) + 1) % 1) * (i + 1)
    );
    [list[i], list[j]] = [list[j], list[i]];
  }

  console.timeEnd("compose");
  return list.slice(0, MAX_QUERIES_PER_CATEGORY);
}

// =================== 실행 루프 ===================
async function runCategory(cat) {
  const queries = composeQueriesForCategory(cat);
  console.log(
    `\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`
  );

  let upserts = 0;
  const seenSig = new Set();

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    console.log(`[fetch] (${qi + 1}/${queries.length}) q="${q}"`);

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      const start = 1 + page * DISPLAY;
      console.log(`[fetch] page=${page + 1}/${MAX_PAGES_PER_QUERY}, start=${start}`);

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

  console.log(
    `[DONE] ${REGION_CANON} × ${cat} → inserted/updated ≈ ${upserts} (unique)`
  );
}

// =================== main ===================
(async () => {
  try {
    console.log("[warmup] naver local ping...");
    try {
      const ping = await axios.get(NAVER_LOCAL_URL, {
        headers: localHeaders,
        params: { query: "영통 옷", display: 1, start: 1 },
        timeout: 5000,
      });
      console.log(
        "[warmup] ok. items:",
        Array.isArray(ping.data?.items) ? ping.data.items.length : 0
      );
    } catch (e) {
      console.error("[warmup] fail:", e?.response?.status, e?.message);
    }

    for (const cat of CATEGORY_KEYWORDS) {
      console.log(`[main] start category: ${cat}`);
      await runCategory(cat);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
