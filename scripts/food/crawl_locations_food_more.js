// crawl_restaurants_wide_coverage.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * 음식점(영통권) 크롤러 - 최대 커버리지 버전 (+무료 이미지 3장 저장)
 * - 지역 × 카테고리(동의어)만 사용하여 가장 넓게 탐색
 * - 수식어/해시태그 콤보 제거
 * - Google TextSearch는 { place_id, lat, lng }만 사용(좌표용, 선택)
 * - description/opening_hours/price/rating은 저장하지 않음
 * - 사진은 **Naver Image Search만** 사용 → LocationPhoto position 1~3 upsert
 */

const prisma = new PrismaClient();

// =================== 지역 설정 ===================
const REGION_CANON = "경기도 수원시 영통구";
const REGION_ALIASES = [
  "경기도 수원시 영통구", "수원시 영통구", "수원 영통구", "영통구",
];
const SUBAREAS = [
  "영통동", "망포동", "매탄동", "원천동",
  "이의동", "하동", "상현동", "우만동", "권선동", "매교동",
];
const STATIONS = [
  "영통역", "망포역", "청명역", "매탄권선역",
  "광교중앙역", "광교역",
];
const LANDMARKS = [
  "경희대학교 국제캠퍼스", "광교호수공원", "영통롯데마트",
  "망포홈플러스", "갤러리아광교", "수원컨벤션센터",
  "광교아울렛", "광교로데오", "영통로데오", "영통사거리",
];
const ADJACENT_DISTRICTS = [
  "수원시 장안구", "수원시 팔달구", "수원시 권선구", "용인시 수지구", "용인시 기흥구",
];

// =================== 카테고리(동의어) ===================
const CATEGORY_KEYWORDS = ["음식점"];
const CATEGORY_SYNONYMS = {
  음식점: [
    // 넓은 상위 개념
    "맛집", "음식점", "식당", "레스토랑", "밥집",
    // 한식/면/밥
    "한식", "국밥", "설렁탕", "곰탕", "순대국", "냉면", "칼국수", "비빔밥",
    // 분식/면류
    "분식", "라멘", "우동", "소바", "쫄면", "짜장면", "짬뽕",
    // 중식/일식/양식
    "중식", "중국집", "일식", "스시", "초밥", "덮밥", "돈카츠", "규카츠",
    "양식", "파스타", "피자", "스테이크", "버거",
    // 고기/해물
    "고깃집", "삼겹살", "한우", "생선구이", "해물", "회", "전골", "샤브샤브",
    "쭈꾸미", "족발", "보쌈", "찜닭",
    // 치킨/분점류
    "치킨", "호프", "술집", "포차", "이자카야", "막걸리",
    // 베이커리/카페(겸업 식사처 확대용)
    "베이커리", "빵집", "브런치", "카페",
  ],
};

// =================== 쿼리 템플릿 (심플 & 넓게) ===================
const QUERY_TEMPLATES = [
  "{region} {category}",
  "{region} {category} 맛집",
  "{region} {category} 식당",
];

// ===== 상한/페이지/속도 =====
const DISPLAY = 30;                    // Naver Local: 페이지당 최대 30
const MAX_PAGES_PER_QUERY = 10;        // 쿼리당 최대 300건
const MAX_QUERIES_PER_CATEGORY = 500;  // 카테고리당 쿼리 500개
const MAX_ITEMS_PER_CATEGORY   = 2000; // 실제 upsert 최대치
const BASE_DELAY_MS = 220;             // RPS 완화(429 방지)

// =================== API URL/ENV ===================
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL        = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL         = "https://openapi.naver.com/v1/search/webkr.json";
const NAVER_IMAGE_URL       = "https://openapi.naver.com/v1/search/image"; // ✅ 무료 이미지 검색
const GOOGLE_PLACES_TEXT    = "https://maps.googleapis.com/maps/api/place/textsearch/json";

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
    try { return await fn(); }
    catch (e) {
      console.error("[HTTP ERROR try", i+1, "]", e?.response?.status, e?.message);
      last = e; await sleep(delay * (i + 1));
    }
  }
  throw last;
}
const stripHtml = (s = "") => s.replace(/<[^>]*>/g, " ").trim();

function normalizeText(s = "") {
  return s.replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function toDecimalString6(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null;
  return Number(v).toFixed(6);
}

// URL/이미지 유틸
function hostnameOf(url="") {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function looksLikeThumbnail(url="") {
  const u = url.toLowerCase();
  return (
    u.includes("thumb") || u.includes("thumbnail") ||
    u.includes("small") || u.includes("min") ||
    u.endsWith(".gif")
  );
}
function isStaticImage(url="") {
  const u = url.toLowerCase();
  return u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp");
}

// 쿼리 정규화/중복 억제
const STOPWORDS = new Set(["에서", "근처", "근방", "주변", "인근", "부근", "역근처", "역", "맛"]);
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
    seen.add(t); out.push(t);
  }
  return out.filter((t, i) => i === 0 || t !== out[i - 1]).join(" ");
}
const canon = (q) => dedupeTokens(normalizeQuery(q));

const makeDedupeSig = ({ name, address }) =>
  crypto.createHash("sha256")
    .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
    .digest("hex").slice(0, 32);

// =================== 허용 태그/규칙 (키워드/무드 저장은 유지) ===================
const ALLOWED_MOOD_FEATURES = [
  "사람많은", "한적한", "넓은", "아늑한", "조용한", "활기찬", "밝은", "어두운",
];
const ALLOWED_KEYWORDS = ["1인석"];

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

const ONESEAT_STRONG = [/1\s*인\s*석/, /일인석/, /카운터\s*석/, /바\s*(테이블|석)/];
const ONESEAT_WEAK   = [/혼밥/, /혼자\s*(먹|가|가기\s*좋)/, /(자리|좌석)\s*여유/];
const ONESEAT_NEG    = [/1\s*인\s*(분|세트|메뉴)/];

const matchAny = (rules, text) => rules.some((r) => r.test(text));
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

// =================== 캐시 ===================
const SNIPPET_CACHE = new Map();
const GOOGLE_TEXT_CACHE = new Map();
const IMAGE_CACHE = new Map(); // q -> [{link,title}...]

// =================== 외부 API ===================
async function fetchLocal(query, start = 1) {
  const fn = () => axios.get(NAVER_LOCAL_URL, {
    headers: localHeaders,
    params: { query, display: DISPLAY, start, sort: "random" },
    timeout: 8000,
    validateStatus: s => (s >= 200 && s < 300) || s === 429
  });
  const { data } = await withRetry(async () => {
    const res = await fn();
    if (res.status === 429) throw new Error("NAVER_RATE_LIMIT");
    return res;
  }, 5, 600);
  return data.items || [];
}
async function fetchBlogSnippetsStrong({ name, region, category }) {
  const key = `BLOG:${name}|${region}|${category||""}`;
  if (SNIPPET_CACHE.has(key)) return SNIPPET_CACHE.get(key);
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
      await sleep(60);
    } catch {}
  }
  merged = merged.trim();
  SNIPPET_CACHE.set(key, merged);
  return merged;
}
async function fetchWebSnippets(query, display=20) {
  const key = `WEB:${query}|${display}`;
  if (SNIPPET_CACHE.has(key)) return SNIPPET_CACHE.get(key);
  const { data } = await withRetry(() =>
    axios.get(NAVER_WEB_URL, { headers: localHeaders, params: { query, display: Math.min(display, 30) }, timeout: 8000 })
  );
  const items = data?.items || [];
  const merged = items.map(it => normalizeText(`${it.title} ${it.description}`)).join(" ");
  SNIPPET_CACHE.set(key, merged);
  return merged;
}

// ✅ Naver Image Search만 사용 — 최대 3장 선별
async function fetchNaverImages(query, want = 3) {
  const key = `IMG:${query}`;
  if (IMAGE_CACHE.has(key)) return IMAGE_CACHE.get(key);

  const params = {
    query,
    display: Math.max(10, want * 5),
    start: 1,
    sort: "sim",
  };

  const { data } = await withRetry(() =>
    axios.get(NAVER_IMAGE_URL, { headers: localHeaders, params, timeout: 8000 })
  );

  const items = Array.isArray(data?.items) ? data.items : [];
  const uniqByHost = new Map(); // host -> {link,title}

  for (const it of items) {
    const link = it?.link || it?.thumbnail || it?.image || "";
    if (!link) continue;
    if (!isStaticImage(link)) continue;
    if (looksLikeThumbnail(link)) continue;

    const host = hostnameOf(link);
    if (!host) continue;

    if (!uniqByHost.has(host)) {
      uniqByHost.set(host, {
        link,
        title: (it.title || it.description || "").replace(/<[^>]*>/g, "").trim(),
      });
    }
    if (uniqByHost.size >= want * 3) break;
  }

  const selected = Array.from(uniqByHost.values()).slice(0, want);
  IMAGE_CACHE.set(key, selected);
  return selected;
}

// Google: TextSearch → place_id, lat, lng (ONLY) + 메모/백오프
async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const qPrimary = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
  const qFallback = `${name} ${REGION_CANON}`;
  const keys = [qPrimary, qFallback];

  for (const q of keys) {
    if (GOOGLE_TEXT_CACHE.has(q)) return GOOGLE_TEXT_CACHE.get(q);
    try {
      const params = { query: q, key: GOOGLE_MAPS_API_KEY, language: "ko" };
      const { data } = await withRetry(async () => {
        const res = await axios.get(GOOGLE_PLACES_TEXT, { params, timeout: 8000 });
        if (res?.data?.status === "OVER_QUERY_LIMIT") {
          throw new Error("OVER_QUERY_LIMIT");
        }
        return res;
      }, 4, 800);

      const r = data?.results?.[0];
      const found = r
        ? { place_id: r.place_id ?? null, lat: r.geometry?.location?.lat ?? null, lng: r.geometry?.location?.lng ?? null }
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

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // 텍스트 보강(무드/키워드 추론용)
  let extraText = await fetchBlogSnippetsStrong({ name, region: REGION_CANON, category: catLabel });
  if (!extraText || extraText.length < 50) {
    const webFallback = await fetchWebSnippets(
      `${name} ${REGION_CANON} ${catLabel||""} 후기 리뷰 1인석 혼밥 카운터석 분위기 조용 웨이팅`
    );
    extraText = `${extraText||""} ${webFallback||""}`.trim();
  }
  const baseTextRaw = `${name} ${desc} ${extraText||""} ${catLabel||""}`;

  // Google 좌표
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) { console.warn("[google:text] error", e?.message || e); }

  // 태깅
  const moodTags = inferMoodTags(baseTextRaw);
  const keywordTags = inferKeywordTagsStrict({ textRaw: baseTextRaw }); // "1인석"만

  // 병합
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...keywordTags].filter(k => ALLOWED_KEYWORDS.includes(k))));
  const prevFeaturesFlat = Array.isArray(existing?.features_flat) ? existing.features_flat : [];
  const mergedMoodFlat = Array.from(new Set([...prevFeaturesFlat, ...moodTags].filter(f => ALLOWED_MOOD_FEATURES.includes(f))));

  const featuresJson = {
    moods: mergedMoodFlat,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };

  const latStr = coords.lat != null ? toDecimalString6(coords.lat) : (existing?.latitude ? String(existing.latitude) : null);
  const lngStr = coords.lng != null ? toDecimalString6(coords.lng) : (existing?.longitude ? String(existing.longitude) : null);

  const updatePayload = {
    location_name: name,
    address,
    latitude:  latStr,
    longitude: lngStr,
    category: "음식점",
    keywords: { set: mergedKeywords || [] },
    features: featuresJson,
    features_flat: { set: mergedMoodFlat || [] },
    ...(coords.place_id ? { google_place_id: coords.place_id } : {}),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  latStr,
    longitude: lngStr,
    category: "음식점",
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
    `[upsert] ${name} (${address || "no-addr"}) → id=${loc.location_id}` +
    ` | lat=${loc.latitude ?? "null"}, lng=${loc.longitude ?? "null"}` +
    ` | moods=[${mergedMoodFlat.join(", ")}]` +
    ` | keywords=[${mergedKeywords.join(", ")}]`
  );

  // ✅ 무료 이미지 3장 채우기
  await ensureThreePhotos({ locationId: loc.location_id, name, address });

  return loc;
}

// ✅ LocationPhoto 3장 보장 로직 (position 1~3 upsert)
async function ensureThreePhotos({ locationId, name, address }) {
  try {
    const existing = await prisma.locationPhoto.findMany({
      where: { location_id: locationId },
      orderBy: { position: "asc" },
    });

    if (existing.length >= 3) return;

    const query = `${name} ${REGION_CANON} 음식점`;
    const candidates = await fetchNaverImages(query, 3);

    const havePos = new Set(existing.map(p => p.position));
    const needPositions = [1,2,3].filter(p => !havePos.has(p));
    let idx = 0;

    for (const pos of needPositions) {
      if (idx >= candidates.length) break;
      const c = candidates[idx++];
      const host = hostnameOf(c.link);

      await prisma.locationPhoto.upsert({
        where: { location_id_position: { location_id: locationId, position: pos } },
        update: {
          remote_url: c.link,
          attributions: [`source:${host}`, c.title ? `title:${c.title}` : `title:`],
          photo_reference: `NAVER_IMAGE:${host}`,
        },
        create: {
          location_id: locationId,
          position: pos,
          remote_url: c.link,
          attributions: [`source:${host}`, c.title ? `title:${c.title}` : `title:`],
          photo_reference: `NAVER_IMAGE:${host}`,
        },
      });

      console.log(`[photo] loc=${locationId} pos=${pos} -> ${c.link} (${host})`);
      await sleep(80);
    }
  } catch (e) {
    console.warn("[ensureThreePhotos] error", e?.message || e);
  }
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
  syns.forEach(s => set.add(canon(s))); // 해시태그/수식어 없음
  return Array.from(set);
}

const CAP = { q: MAX_QUERIES_PER_CATEGORY };

function composeQueriesForCategory(cat) {
  console.time("compose");

  const regionCombos = composeRegionCombos();
  const catVariants  = composeCategoryVariants(cat);

  const queries = new Set();

  outer:
  for (const region of regionCombos) {
    for (const category of catVariants) {
      const categoryPlain = category;
      for (const tmpl of QUERY_TEMPLATES) {
        queries.add(canon(
          tmpl.replace("{region}", region).replace("{category}", categoryPlain)
        ));
        if (queries.size >= CAP.q) break outer;
      }
    }
  }

  const list = Array.from(queries);
  // 가벼운 셔플
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor((Math.sin(i * 9301 + 49297) % 1 + 1) % 1 * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }

  console.timeEnd("compose");
  return list.slice(0, MAX_QUERIES_PER_CATEGORY);
}

// =================== 실행 루프 ===================
async function runCategory(cat) {
  const queries = composeQueriesForCategory(cat);
  console.log(`\n=== RUN: ${REGION_CANON} × ${cat} | queries=${queries.length} (cap=${MAX_QUERIES_PER_CATEGORY}) ===`);

  let upserts = 0;
  const seenSig = new Set();

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    console.log(`[fetch] (${qi+1}/${queries.length}) q="${q}"`);

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
      const start = 1 + page * DISPLAY;
      console.log(`[fetch] page=${page+1}/${MAX_PAGES_PER_QUERY}, start=${start}`);
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
    console.log("[warmup] naver local ping...");
    try {
      const ping = await axios.get(NAVER_LOCAL_URL, {
        headers: localHeaders,
        params: { query: "영통 맛집", display: 1, start: 1 },
        timeout: 5000,
      });
      console.log("[warmup] ok. items:", Array.isArray(ping.data?.items) ? ping.data.items.length : 0);
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
