// crawl_restaurants_enhanced_variants_with_geo_wide.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * 음식점(영통권) 크롤러 확장판 - 좌표만 사용 / description 제외
 * - 키워드: "1인석"만 저장 (오마카세 전면 제외)
 * - 지역 바리에이션/수식어/해시태그 확장, Naver Local 페이지네이션 + 스니펫 보강
 * - Google TextSearch → { place_id, lat, lng }만 사용
 * - description / opening_hours / types / price_level 전부 저장하지 않음
 */

const prisma = new PrismaClient();

// =================== 정책/확장 파라미터 ===================
const REGION_CANON = "경기도 수원시 영통구";

// 지역 별칭/세부
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

// 카테고리: 음식점 (동의어/세부)
const CATEGORY_KEYWORDS = ["음식점"];
const CATEGORY_SYNONYMS = {
  음식점: [
    "음식점", "식당", "맛집",
    "한식", "분식", "중식", "일식", "양식",
    "라멘", "우동", "초밥", "스시", "덮밥",
    "파스타", "피자", "고깃집", "삼겹살", "한우",
    "국밥", "설렁탕", "곰탕", "순대국", "냉면",
    "탕", "전골", "샤브샤브", "쭈꾸미", "해물", "회",
    "족발", "보쌈", "찜닭", "칼국수", "스테이크", "버거", "치킨",
    // 오마카세류는 후처리로 제외
  ],
};

// 수식어 풀 (확장)
const INTENT_MODIFIERS = [
  "인기", "추천", "베스트", "핫플", "로컬", "숨은 맛집",
  "신상", "오픈", "리뉴얼", "재오픈", "줄서는", "줄안서는", "웨이팅없는",
];
const MOOD_MODIFIERS = [
  "분위기 좋은", "감성", "아늑한", "조용한", "힙한", "채광 좋은", "뷰 좋은", "넓은",
];
const DINING_MODIFIERS = [
  "예약", "웨이팅", "가성비", "가심비", "코스요리",
  "런치", "디너", "바 테이블", "카운터석", "1인석",
  "포장", "배달", "주차", "야식", "브레이크타임", "라스트오더",
];
const FAMILY_POLICY = ["노키즈", "반려동물 동반", "데이트", "혼자 가기 좋은", "단체석", "룸", "프라이빗"];

// 템플릿 확장
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
  "{region} 신상 {category}",
  "{region} 오픈 {category}",
  "{region} 리뉴얼 {category}",
  "{region} 웨이팅없는 {category}",
  "{region} #{category}",
  "{region} #{modifier} #{category}",
];

// ===== 상한/콤보 제어 =====
const DISPLAY = 30;
const MAX_PAGES_PER_QUERY = 4;
const MAX_QUERIES_PER_CATEGORY = 180;
const MAX_ITEMS_PER_CATEGORY   = 400;
const BASE_DELAY_MS = 140;

const USE_COMBO_2 = true;
const USE_COMBO_3 = true;
const MAX_3_COMBOS = 400;

const USE_FEATURES_FALLBACK = false; // (영업시간 사용 안 하므로 의미 없음)

// =================== API URL/ENV ===================
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
const NAVER_BLOG_URL        = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_WEB_URL         = "https://openapi.naver.com/v1/search/webkr.json";
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

// 쿼리 정규화/중복 억제
const STOPWORDS = new Set(["에서", "근처", "근방", "주변", "인근", "부근", "역근처", "역", "맛"]);
function normalizeQuery(q = "") {
  return q
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+#/g, " #")
    .replace(/#{2,}/g, "#")
    .replace(/\s{2,}/g, " ");
}
function dedupeTokens(q) {
  const toks = q.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let t of toks) {
    if (/^#/.test(t)) t = t.toLowerCase();
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

function kCombinations(arr, k) {
  const res = [];
  (function bt(start, path) {
    if (path.length === k) { res.push(path.slice()); return; }
    for (let i = start; i < arr.length; i++) { path.push(arr[i]); bt(i + 1, path); path.pop(); }
  })(0, []);
  return res;
}

// =================== 허용 리스트 & 룰 ===================
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

// 1인석 판별
const ONESEAT_STRONG = [/1\s*인\s*석/, /일인석/, /카운터\s*석/, /바\s*(테이블|석)/];
const ONESEAT_WEAK = [/혼밥/, /혼자\s*(먹|가|가기\s*좋)/, /(자리|좌석)\s*여유/];
const ONESEAT_NEG = [/1\s*인\s*(분|세트|메뉴)/];

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

// Google: TextSearch → place_id, lat, lng (ONLY)
async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const qPrimary = address ? `${name} ${address}` : `${name} ${REGION_CANON}`;
  const qFallback = `${name} ${REGION_CANON}`;
  const tryQuery = async (q) => {
    const params = { query: q, key: GOOGLE_MAPS_API_KEY, language: "ko" };
    const { data } = await withRetry(() => axios.get(GOOGLE_PLACES_TEXT, { params, timeout: 8000 }));
    const res = data?.results?.[0];
    if (!res) return null;
    return { place_id: res.place_id ?? null, lat: res.geometry?.location?.lat ?? null, lng: res.geometry?.location?.lng ?? null };
  };
  let found = await tryQuery(qPrimary);
  if (!found) found = await tryQuery(qFallback);
  return found;
}

// =================== 업서트 ===================
async function upsertLocation(item, catLabel) {
  // 오마카세 방어
  if (/오마카세/i.test(item.title) || /오마카세/i.test(item.description || "")) {
    console.log(`[skip-omakase] ${stripHtml(item.title)}`);
    return null;
  }

  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || ""); // 추론용 텍스트로만 사용 (DB 저장 X)
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

  // Google 좌표만
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → pid=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) { console.warn("[google:text] error", e?.message || e); }

  // ====== 추론 ======
  const moodTags = inferMoodTags(baseTextRaw);
  const keywordTags = inferKeywordTagsStrict({ textRaw: baseTextRaw }); // 1인석만

  // 병합(허용 집합 필터)
  const prevKeywords = Array.isArray(existing?.keywords) ? existing.keywords : [];
  const mergedKeywords = Array.from(new Set([...prevKeywords, ...keywordTags].filter(k => ALLOWED_KEYWORDS.includes(k))));
  const prevFeaturesFlat = Array.isArray(existing?.features_flat) ? existing.features_flat : [];
  const mergedMoodFlat = Array.from(new Set([...prevFeaturesFlat, ...moodTags].filter(f => ALLOWED_MOOD_FEATURES.includes(f))));

  // features JSON
  const featuresJson = {
    moods: mergedMoodFlat,
    _debugSnippet: baseTextRaw.slice(0, 200),
  };

  // 업서트 (description/영업시간 등 제외)
  const updatePayload = {
    location_name: name,
    address,
    latitude:  (coords.lat ?? existing?.latitude ?? null),
    longitude: (coords.lng ?? existing?.longitude ?? null),
    category: "음식점",
    // description: 제외 (기존 값 유지)
    keywords: { set: mergedKeywords }, // ["1인석"]만
    features: featuresJson,
    features_flat: { set: mergedMoodFlat },
    ...(coords.place_id ? { google_place_id: coords.place_id } : {}),
    updated_at: new Date(),
  };
  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category: "음식점",
    is_solo_friendly: true,
    // description: 제외 (NULL/기본값)
    keywords: mergedKeywords,
    features: featuresJson,
    features_flat: mergedMoodFlat,
    ...(coords.place_id ? { google_place_id: coords.place_id } : {}),
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
    ` | moods=[${mergedMoodFlat.join(", ")}]` +
    ` | keywords=[${mergedKeywords.join(", ")}]`
  );
  return loc;
}

// =================== 바리에이션 생성 (확장판) ===================
function composeRegionCombos() {
  const base = new Set();
  const push = (s) => base.add(canon(s));

  // 단일
  [...REGION_ALIASES, ...SUBAREAS, ...STATIONS, ...LANDMARKS].forEach(push);

  // alias × (동|역|랜드마크)
  for (const a of REGION_ALIASES) {
    for (const b of [...SUBAREAS, ...STATIONS, ...LANDMARKS]) {
      push(`${a} ${b}`);
      if (base.size > 2000) break;
    }
  }

  // 인접 구 교차 + 대표 포인트 결합
  for (const adj of ADJACENT_DISTRICTS) {
    push(`${adj} 인근`);
    for (const b of [...STATIONS, ...LANDMARKS]) {
      push(`${adj} ${b}`);
      if (base.size > 3000) break;
    }
  }

  // 관용 표현
  const vicinity = ["근처", "주변", "인근", "부근", "역세권", "역 근처", "로데오"];
  for (const r of [...base]) {
    for (const v of vicinity) {
      push(`${r} ${v}`);
      if (base.size > 5000) break;
    }
  }

  return Array.from(base);
}
function composeModifierCombos() {
  const pool = [
    ...INTENT_MODIFIERS, ...MOOD_MODIFIERS, ...DINING_MODIFIERS, ...FAMILY_POLICY,
  ].map(canon);
  const uniq = Array.from(new Set(pool));
  const out = new Set();

  // 단일
  uniq.forEach(m => out.add(m));

  // 2콤보
  if (USE_COMBO_2) {
    for (const c of kCombinations(uniq, 2)) {
      out.add(canon(c.join(" ")));
      if (out.size > 1200) break;
    }
  }

  // 3콤보
  if (USE_COMBO_3) {
    let cnt = 0;
    for (const c of kCombinations(uniq, 3)) {
      out.add(canon(c.join(" ")));
      if (++cnt >= MAX_3_COMBOS) break;
    }
  }
  return Array.from(out);
}
function composeCategoryVariants(cat) {
  const syns = CATEGORY_SYNONYMS[cat] || [cat];
  const set = new Set();

  // 단일 + 해시태그
  syns.forEach(s => { set.add(canon(s)); set.add(canon(`#${s}`)); });

  // 2콤보(해시태그 병행)
  for (const comb of kCombinations(syns, 2)) {
    const j = canon(comb.join(" "));
    set.add(j);
    set.add(canon(`#${comb[0]} #${comb[1]}`));
  }

  // 3콤보 일부
  if (syns.length >= 3) {
    for (const comb of kCombinations(syns, 3).slice(0, 120)) {
      set.add(canon(comb.join(" ")));
    }
  }
  return Array.from(set);
}

const CAP = { q: MAX_QUERIES_PER_CATEGORY };

function composeQueriesForCategory(cat) {
  console.time("compose");

  const regionCombos = composeRegionCombos();
  const modifiers    = composeModifierCombos();
  const catVariants  = composeCategoryVariants(cat);

  const queries = new Set();

  outer:
  for (const region of regionCombos) {
    for (const category of catVariants) {
      const categoryPlain = category.replace(/^#/, "");

      for (const tmpl of QUERY_TEMPLATES) {
        // 0) 수식어 없이
        queries.add(canon(
          tmpl.replace("{region}", region).replace("{category}", categoryPlain).replace("{modifier}", "")
        ));
        if (queries.size >= CAP.q) break outer;

        // 1) 해시태그 카테고리 직접 결합
        if (/#/.test(category)) {
          queries.add(canon(`${region} ${category}`));
          if (queries.size >= CAP.q) break outer;
        }

        // 2) 수식어 적용
        for (const m of modifiers) {
          queries.add(canon(
            tmpl.replace("{region}", region).replace("{category}", categoryPlain).replace("{modifier}", m)
          ));
          if (queries.size >= CAP.q) break outer;

          // 해시태그 확장
          if (!/#/.test(category)) {
            const hashMod = `#${m.replace(/\s+/g, "")}`;
            const hashCat = `#${categoryPlain.replace(/\s+/g, "")}`;
            queries.add(canon(`${region} ${hashMod} ${hashCat}`));
            if (queries.size >= CAP.q) break outer;
          }
        }
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

        // 오마카세 방어
        if (/오마카세/i.test(it.title) || /오마카세/i.test(it.description || "")) {
          console.log(`[skip-omakase] ${stripHtml(it.title)}`);
          continue;
        }

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
    // 워밍업 핑: 키/네트워크 즉시 확인
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
