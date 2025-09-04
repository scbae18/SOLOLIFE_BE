// crawl_locations_smoke_test.js
import "dotenv/config";
import axios from "axios";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * ✅ 목적: 위경도/영업시간 저장이 실제로 되는지 빠르게 확인
 * - 수집량 최소화: 쿼리 1개, 상위 5개만 시도
 * - Google TextSearch → {place_id, lat, lng}
 * - Google Details → opening_hours
 * - Prisma upsert: latitude/longitude/opening_hours 채우기
 */

const prisma = new PrismaClient();

// ======== 설정 최소화 ========
const REGION = "경기도 수원시 영통구";
const CATEGORY = "카페";
const DISPLAY = 5;           // 상위 5개만
const BASE_DELAY_MS = 150;   // 호출 간 딜레이
const USE_FEATURES_FALLBACK = false; // opening_hours를 features에 넣는 임시폴백 사용할지

// ======== 외부 API ========
const NAVER_LOCAL_URL       = "https://openapi.naver.com/v1/search/local.json";
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
  console.warn("[env] GOOGLE_MAPS_API_KEY 누락 → 위경도/영업시간 수집 불가");
}

const localHeaders = {
  "X-Naver-Client-Id": NAVER_OPENAPI_CLIENT_ID,
  "X-Naver-Client-Secret": NAVER_OPENAPI_CLIENT_SECRET,
  "Accept": "application/json",
};

// ======== 유틸 ========
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, tries = 3, delay = 300) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      console.warn("[retry]", i + 1, e.response?.status || e.message);
      last = e; await sleep(delay * (i + 1));
    }
  }
  throw last;
}
const stripHtml = (s = "") => s.replace(/<[^>]*>/g, " ").trim();

const makeDedupeSig = ({ name, address }) =>
  crypto.createHash("sha256")
    .update(`${(name || "").toLowerCase()}|${(address || "").toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);

// ======== 네이버 지역검색(후보) ========
async function fetchLocalTop(region, category) {
  const query = `${region} ${category}`;
  const { data } = await withRetry(() =>
    axios.get(NAVER_LOCAL_URL, {
      headers: localHeaders,
      params: { query, display: DISPLAY, start: 1, sort: "random" },
      timeout: 8000,
    })
  );
  const items = data?.items ?? [];
  console.log(`[naver] query="${query}" → ${items.length} hits`);
  return items;
}

// ======== 구글: TextSearch → place_id+좌표 ========
async function searchPlaceByText(name, address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const query = address ? `${name} ${address}` : `${name} ${REGION}`;
  const params = { query, key: GOOGLE_MAPS_API_KEY, language: "ko" };
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_TEXT, { params, timeout: 8000 })
  );
  const res = data?.results?.[0];
  if (!res) return null;
  const lat = res.geometry?.location?.lat ?? null;
  const lng = res.geometry?.location?.lng ?? null;
  return { place_id: res.place_id ?? null, lat, lng };
}

// ======== 구글: Details → opening_hours ========
async function fetchPlaceOpeningHours(place_id) {
  if (!place_id || !GOOGLE_MAPS_API_KEY) return null;
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_DETAILS, {
      params: {
        place_id,
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

// ======== 업서트 ========
async function upsertLocationMinimal(item, category) {
  const name = stripHtml(item.title);
  const address = item.roadAddress || item.address || null;
  const desc = stripHtml(item.description || "");
  const dedupe_signature = makeDedupeSig({ name, address });

  const existing = await prisma.location.findUnique({ where: { dedupe_signature } });

  // Google에서 좌표 + place_id
  let coords = { place_id: null, lat: null, lng: null };
  try {
    const found = await searchPlaceByText(name, address);
    if (found) coords = found;
    console.log(`[google:text] ${name} → place_id=${coords.place_id || "none"}, lat=${coords.lat}, lng=${coords.lng}`);
  } catch (e) {
    console.warn("[google:text] error", e?.message || e);
  }

  // opening_hours
  let opening_hours = null;
  try {
    if (coords.place_id) {
      opening_hours = await fetchPlaceOpeningHours(coords.place_id);
    }
    console.log(`[google:hours] ${name} → ${opening_hours ? "ok" : "none"}`);
  } catch (e) {
    console.warn("[google:details] error", e?.message || e);
  }

  // 최소 필드만 반영 (기존 값 보존, 새 값 있으면 갱신)
  const updatePayload = {
    location_name: name,
    address,
    latitude:  coords.lat ?? existing?.latitude ?? null,
    longitude: coords.lng ?? existing?.longitude ?? null,
    category,
    description: desc || null,
    updated_at: new Date(),
  };

  const createPayload = {
    location_name: name,
    address,
    latitude:  coords.lat,
    longitude: coords.lng,
    category,
    is_solo_friendly: true,
    description: desc || null,
    keywords: [],      // 스모크 테스트에선 비워둠(원하면 룰 추가)
    features: {},      // 스모크 테스트에선 비워둠
    dedupe_signature,
    created_at: new Date(),
    updated_at: new Date(),
  };

  if (!USE_FEATURES_FALLBACK) {
    updatePayload.opening_hours = opening_hours;
    createPayload.opening_hours = opening_hours;
  } else if (opening_hours) {
    // features에 임시로 넣고 싶다면 아래 주석 해제
    // updatePayload.features = { ...(existing?.features || {}), openingHours: opening_hours };
    // createPayload.features = { openingHours: opening_hours };
  }

  const loc = await prisma.location.upsert({
    where: { dedupe_signature },
    update: updatePayload,
    create: createPayload,
  });

  console.log(
    `[upsert] id=${loc.location_id} | ${name} | lat=${loc.latitude} lng=${loc.longitude} | hours=${opening_hours ? "✅" : "✖"}`
  );

  return loc;
}

// ======== 메인(상위 몇 개만) ========
async function runSmoke() {
  const items = await fetchLocalTop(REGION, CATEGORY);
  let count = 0;
  for (const it of items) {
    await upsertLocationMinimal(it, CATEGORY);
    count++;
    await sleep(BASE_DELAY_MS);
  }
  console.log(`[DONE] processed=${count}`);
}

(async () => {
  try {
    await runSmoke();
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
