// src/services/recommendations.service.js
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

/** ================== 유틸 ================== */
const toArray = (v) => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
};
const safeNum = (v, d = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function haversineKm(a, b) {
  const toRad = x => x * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function scoreOf(item) {
  const rating = Number(item.rating_avg ?? 0);
  const rc = item.rating_count ?? 0;
  const freshnessDays = (Date.now() - new Date(item.updated_at ?? item.created_at ?? Date.now()).getTime()) / 86400000;
  return rating * 2 + Math.min(rc, 200) / 50 - Math.min(freshnessDays, 30) * 0.05;
}
function weightedPick(items, weights) {
  const sum = weights.reduce((a,b)=>a+b,0) || 1;
  let r = Math.random() * sum;
  for (let i=0;i<items.length;i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length-1];
}

/** 위경도 바운딩박스 계산 (숫자 반환) */
function buildGeoBox(center, radiusKm = 3) {
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') return null;
  const lat = center.lat;
  const lng = center.lng;
  const dLat = radiusKm / 111; // 위도 1도 ≈ 111km
  const cos = Math.cos(lat * Math.PI / 180) || 1e-6;
  const dLng = radiusKm / (111 * cos);
  return {
    minLat: Number((lat - dLat).toFixed(6)),
    maxLat: Number((lat + dLat).toFixed(6)),
    minLng: Number((lng - dLng).toFixed(6)),
    maxLng: Number((lng + dLng).toFixed(6)),
  };
}

/** 후보들 중 center 반경내로 정밀 필터 */
function filterWithinRadius(items, center, radiusKm = 3) {
  if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') return items ?? [];
  return (items ?? []).filter(it => {
    if (it.latitude == null || it.longitude == null) return false;
    const p = { lat: Number(it.latitude), lng: Number(it.longitude) };
    return haversineKm(center, p) <= radiusKm + 1e-6;
  });
}

/** Google Places Photo URL 생성 (photo_reference → 실제 URL) */
function buildGooglePhotoUrl(ref) {
  if (!ref) return null;
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
}

/** ================== 공통: 사진 주입 (절대 크래시 금지) ================== */
async function attachPhotosToItems(items) {
  try {
    if (!items?.length) return items ?? [];
    const ids = [...new Set(items.map(x => Number(x.location_id)).filter(Boolean))];
    if (!ids.length) return items;

    // 1) LocationPhoto에서 최대 3장 수집 (remote_url 우선, 없으면 photo_reference로 URL 생성)
    const photos = await prisma.locationPhoto.findMany({
      where: { location_id: { in: ids } },
      select: {
        location_id: true,
        position: true,
        remote_url: true,
        photo_reference: true,
        // attributions: true, // 필요 시 노출용으로 사용 가능
      },
      orderBy: [{ location_id: 'asc' }, { position: 'asc' }]
    });

    const grouped = new Map();
    for (const p of photos) {
      const url = p.remote_url || buildGooglePhotoUrl(p.photo_reference);
      if (!url) continue;
      const arr = grouped.get(p.location_id) ?? [];
      if (arr.length < 3) arr.push(url);
      grouped.set(p.location_id, arr);
    }

    // 2) item별로 최대 3장, 그리고 "1장 이상이면 3장으로 패딩"
    let result = items.map(it => {
      const key = Number(it.location_id);
      let ph = (grouped.get(key) ?? []).slice(0, 3);

      if (ph.length > 0 && ph.length < 3) {
        const last = ph[ph.length - 1];
        while (ph.length < 3) ph.push(last);
      }
      return { ...it, photos: ph };
    });

    // 3) 완전 무사진(0장)인 항목에 대해 Location.fallback_photo_url 보조 적용 (+패딩)
    const needFallbackIds = result.filter(r => (r.photos?.length ?? 0) === 0).map(r => Number(r.location_id));
    if (needFallbackIds.length) {
      const locs = await prisma.location.findMany({
        where: { location_id: { in: needFallbackIds } },
        select: { location_id: true, fallback_photo_url: true }
      });
      const fbMap = new Map(locs.map(l => [l.location_id, l.fallback_photo_url].filter(Boolean)));

      result = result.map(r => {
        if ((r.photos?.length ?? 0) > 0) return r;
        const fb = fbMap.get(Number(r.location_id));
        let ph = fb ? [fb] : [];
        if (ph.length > 0 && ph.length < 3) {
          const last = ph[ph.length - 1];
          while (ph.length < 3) ph.push(last);
        }
        return { ...r, photos: ph };
      });
    }

    return result;
  } catch {
    // 최후의 방어: 사진 없이 반환
    return items.map(it => ({ ...it, photos: [] }));
  }
}

// 카테고리에서 랜덤 N개 (fallback용) — center가 있으면 반경 내에서만
async function pickRandomInCategoryN(category, n = 3, center, radiusKm = 3) {
  if (!category) return [];
  const box = center ? buildGeoBox(center, radiusKm) : null;

  const whereBoxSql = box
    ? Prisma.sql` AND "latitude" BETWEEN ${box.minLat} AND ${box.maxLat} AND "longitude" BETWEEN ${box.minLng} AND ${box.maxLng} `
    : Prisma.sql``;

  const limitN = Math.max(1, Number(n) * 5);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      "location_id", "location_name", "address", "latitude", "longitude",
      "category", "is_solo_friendly", "description",
      "rating_avg", "rating_count", "price_level",
      "keywords", "features", "features_flat", "opening_hours",
      "dedupe_signature", "created_at", "updated_at"
    FROM "Location"
    WHERE "category" = ${category}
    ${whereBoxSql}
    ORDER BY random()
    LIMIT ${limitN}
  `);

  const items = filterWithinRadius(rows ?? [], center, radiusKm).slice(0, n);
  return attachPhotosToItems(items);
}

/** ================== 1) 장소 추천(3개 후보) ================== */
/**
 * 입력: { category: string, keywords?: string[]|string, moods?: string[]|string, center?: {lat,lng}, radius_km?: number }
 */
export async function recommendOne({ category, keywords = [], moods = [], center, radius_km = 3 }) {
  // 입력 정규화
  const kw = toArray(keywords);
  const md = toArray(moods);
  const hasK = kw.length > 0;
  const hasM = md.length > 0;

  const cLat = safeNum(center?.lat);
  const cLng = safeNum(center?.lng);
  const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng);
  const radKm = Number.isFinite(radius_km) ? radius_km : 3;

  const box = hasCenter ? buildGeoBox({ lat: cLat, lng: cLng }, radKm) : null;

  // 키워드/무드가 없으면: 카테고리 유지 + 랜덤 추천
  if (!hasK && !hasM) {
    const items = await pickRandomInCategoryN(category, 3, hasCenter ? { lat: cLat, lng: cLng } : undefined, radKm);
    return {
      items,
      message: items.length
        ? (hasCenter ? `반경 ${radKm}km 내에서 '${category}' 카테고리 랜덤 3개를 추천합니다.` : `'${category}' 카테고리에서 랜덤 3개를 추천합니다.`)
        : (hasCenter ? `반경 ${radKm}km 내에 '${category}' 카테고리 추천 후보가 없습니다.` : `'${category}' 카테고리에 추천 가능한 장소가 없습니다.`),
      strategy: hasCenter ? 'fallback_random_in_category_within_radius_v1' : 'fallback_random_in_category_v2'
    };
  }

  const whereAnd = [{ category }];
  if (hasK) whereAnd.push({ keywords: { hasEvery: kw } });
  if (hasM) whereAnd.push({ features_flat: { hasEvery: md } });
  if (box) {
    // Decimal 컬럼과 비교 — 숫자 사용
    whereAnd.push({
      latitude:  { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng }
    });
  }

  const rawCandidates = await prisma.location.findMany({
    where: { AND: whereAnd },
    select: {
      location_id: true,
      location_name: true,
      category: true,
      latitude: true,
      longitude: true,
      rating_avg: true,
      rating_count: true,
      updated_at: true,
      created_at: true,
      price_level: true,
      keywords: true,
      features: true,
      features_flat: true,
      address: true,
      opening_hours: true
    },
    take: 300
  });

  const centerObj = hasCenter ? { lat: cLat, lng: cLng } : undefined;
  const candidates = filterWithinRadius(rawCandidates, centerObj, radKm);

  if (!candidates.length) {
    const items = await pickRandomInCategoryN(category, 3, centerObj, radKm);
    return {
      items,
      message: items.length
        ? (hasCenter ? `조건에 맞는 장소가 없어 반경 ${radKm}km 내에서 '${category}' 카테고리 랜덤 3개를 추천합니다.` : `조건에 맞는 장소가 없어 '${category}' 카테고리에서 랜덤 3개를 추천합니다.`)
        : (hasCenter ? `반경 ${radKm}km 내에 '${category}' 카테고리 추천 후보가 없습니다.` : `'${category}' 카테고리에 추천 가능한 장소가 없습니다.`),
      strategy: hasCenter ? 'no_match_fallback_random_in_category_within_radius_v1' : 'no_match_fallback_random_in_category_v2'
    };
  }

  // 점수 가중 비복원 추출 3개
  const bag = [...candidates];
  const picks = [];
  const toPick = Math.min(3, bag.length);
  for (let i = 0; i < toPick; i++) {
    const weights = bag.map(c => Math.max(0.1, scoreOf(c)));
    const chosen = weightedPick(bag, weights);
    picks.push(chosen);
    const idx = bag.findIndex(x => x.location_id === chosen.location_id);
    if (idx >= 0) bag.splice(idx, 1);
  }

  const itemsWithPhotos = await attachPhotosToItems(picks);
  return {
    items: itemsWithPhotos,
    strategy:
      (hasK && hasM ? 'category_keywords_moods_and_v3' : hasK ? 'category_keywords_only_v3' : 'category_moods_only_v3')
      + (hasCenter ? '_within_radius' : '')
  };
}

/** ================== 4) 무드 기반 2개(서로 다른 카테고리 보장 시도) ================== */
export async function recommendTwoByMoodsDistinctCategory({
  moods,
  excludeLocationIds = [],
  excludeCategories = [],
  region,
  center,
  radius_km = 3
}) {
  const moodArray = toArray(moods);
  if (!moodArray.length) {
    return { items: [], meta: { reason: 'moods는 최소 1개 이상 필요합니다.' } };
  }

  const cLat = safeNum(center?.lat);
  const cLng = safeNum(center?.lng);
  const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng);
  const radKm = Number.isFinite(radius_km) ? radius_km : 3;
  const box = hasCenter ? buildGeoBox({ lat: cLat, lng: cLng }, radKm) : null;

  const baseWhere = {
    is_solo_friendly: true,
    AND: [
      { OR: [{ keywords: { hasSome: moodArray } }, { features_flat: { hasSome: moodArray } }] },
      ...(box ? [{
        latitude:  { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng }
      }] : [])
    ],
    NOT: [
      ...(excludeLocationIds?.length ? [{ location_id: { in: excludeLocationIds } }] : []),
      ...(excludeCategories?.length ? [{ category: { in: excludeCategories } }] : [])
    ],
    ...(region ? { OR: [{ address: { contains: region } }, { location_name: { contains: region } }] } : {})
  };

  const rawPool = await prisma.location.findMany({
    where: baseWhere,
    select: {
      location_id: true, location_name: true, address: true,
      latitude: true, longitude: true, category: true,
      is_solo_friendly: true, description: true,
      rating_avg: true, rating_count: true, price_level: true,
      keywords: true, features: true, features_flat: true,
      opening_hours: true, created_at: true, updated_at: true
    },
    take: 300,
    orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }, { updated_at: 'desc' }]
  });

  const pool = filterWithinRadius(rawPool, hasCenter ? { lat: cLat, lng: cLng } : undefined, radKm);
  if (!pool.length) {
    return {
      items: [],
      meta: {
        reason: hasCenter ? `반경 ${radKm}km 내 조건 일치 결과 없음` : '조건에 맞는 장소가 없습니다.',
        moods: moodArray,
        excludeLocationIds,
        excludeCategories
      }
    };
  }

  const weights1 = pool.map(c => Math.max(0.1, scoreOf(c)));
  const first = weightedPick(pool, weights1);

  const pool2 = pool.filter(it =>
    it.location_id !== first.location_id &&
    (it.category ?? '') !== (first.category ?? '')
  );

  let second = null;
  if (pool2.length) {
    const weights2 = pool2.map(c => Math.max(0.1, scoreOf(c)));
    second = weightedPick(pool2, weights2);
  } else {
    second = await prisma.location.findFirst({
      where: {
        ...baseWhere,
        NOT: [
          ...(excludeLocationIds?.length ? [{ location_id: { in: excludeLocationIds } }] : []),
          ...(excludeCategories?.length ? [{ category: { in: excludeCategories } }] : []),
          { location_id: first.location_id },
          { category: first.category ?? '' }
        ]
      },
      select: {
        location_id: true, location_name: true, address: true,
        latitude: true, longitude: true, category: true,
        is_solo_friendly: true, description: true,
        rating_avg: true, rating_count: true, price_level: true,
        keywords: true, features: true, features_flat: true,
        opening_hours: true, created_at: true, updated_at: true
      },
      orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }, { updated_at: 'desc' }]
    });

    if (second && !filterWithinRadius([second], hasCenter ? { lat: cLat, lng: cLng } : undefined, radKm).length) {
      second = null;
    }
  }

  const items = [first, second].filter(Boolean);
  const itemsWithPhotos = await attachPhotosToItems(items);

  return {
    items: itemsWithPhotos,
    meta: {
      moods: moodArray,
      excludeLocationIds,
      excludeCategories,
      distinctCategory: itemsWithPhotos.length === 2 ? itemsWithPhotos[0].category !== itemsWithPhotos[1].category : false,
      relaxedSecond: !!(second && !pool2.length),
      within_radius_km: hasCenter ? radKm : null
    }
  };
}

/** ================== 5) 카테고리만으로 교체 후보 1개 ================== */
export async function suggestReplacementByCategoryOne({
  category,
  excludeLocationIds = [],
  region,
  center,
  radius_km = 3
}) {
  if (!category) {
    return { items: [], meta: { reason: 'category is required' } };
  }

  const cLat = safeNum(center?.lat);
  const cLng = safeNum(center?.lng);
  const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng);
  const radKm = Number.isFinite(radius_km) ? radius_km : 3;
  const box = hasCenter ? buildGeoBox({ lat: cLat, lng: cLng }, radKm) : null;

  const where = {
    category,
    is_solo_friendly: true,
    ...(excludeLocationIds?.length ? { location_id: { notIn: excludeLocationIds } } : {}),
    ...(region ? { OR: [{ address: { contains: region } }, { location_name: { contains: region } }] } : {}),
    ...(box ? {
      AND: [
        { latitude:  { gte: box.minLat, lte: box.maxLat } },
        { longitude: { gte: box.minLng, lte: box.maxLng } },
      ]
    } : {})
  };

  const rawPool = await prisma.location.findMany({
    where,
    select: {
      location_id: true, location_name: true, address: true,
      latitude: true, longitude: true, category: true,
      is_solo_friendly: true, description: true,
      rating_avg: true, rating_count: true, price_level: true,
      keywords: true, features: true, features_flat: true,
      opening_hours: true, created_at: true, updated_at: true
    },
    take: 80,
    orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }, { updated_at: 'desc' }]
  });

  const pool = filterWithinRadius(rawPool, hasCenter ? { lat: cLat, lng: cLng } : undefined, radKm);
  if (!pool.length) {
    return { items: [], meta: { category, excludeLocationIds, region: region ?? null, reason: hasCenter ? `반경 ${radKm}km 내 후보 없음` : 'no candidates' } };
  }

  const weights = pool.map(c => Math.max(0.1, scoreOf(c)));
  const picked = weightedPick(pool, weights);

  const [withPhotos] = await attachPhotosToItems([picked]);

  return {
    items: [withPhotos],
    meta: { category, excludeLocationIds, region: region ?? null, within_radius_km: hasCenter ? radKm : null }
  };
}

/** ================== 2) 루트 이어 추천(범용) ================== */
export async function recommendNext({
  currentRoute = [],
  wantTypes = [],
  count = 2,
  center,
  delta = 0.02
}) {
  const exclude = new Set(currentRoute.map(Number));
  const where = {};

  const want = toArray(wantTypes);
  if (want.length) where.category = want.length === 1 ? want[0] : { in: want };

  const cLat = safeNum(center?.lat);
  const cLng = safeNum(center?.lng);
  const d = safeNum(delta, 0.02);

  if (Number.isFinite(cLat) && Number.isFinite(cLng) && Number.isFinite(d)) {
    where.AND = [
      { latitude:  { gte: Number((cLat - d).toFixed(6)), lte: Number((cLat + d).toFixed(6)) } },
      { longitude: { gte: Number((cLng - d).toFixed(6)), lte: Number((cLng + d).toFixed(6)) } },
    ];
  }

  const candidates = await prisma.location.findMany({
    where,
    select: {
      location_id: true, location_name: true, category: true,
      latitude: true, longitude: true, rating_avg: true, rating_count: true,
      updated_at: true, created_at: true, keywords: true, features: true,
      address: true
    },
    take: 300
  });

  const filtered = candidates.filter(c => !exclude.has(Number(c.location_id)));
  if (!filtered.length) {
    return { items: [], ordering_hint: currentRoute.map(String), strategy: 'route_next_v1' };
  }

  const centerForScore = (Number.isFinite(cLat) && Number.isFinite(cLng)) ? { lat: cLat, lng: cLng } : null;
  const scoreWithDistance = (it) => {
    const base = scoreOf(it);
    if (!centerForScore || it.latitude == null || it.longitude == null) return base;
    const dist = haversineKm(centerForScore, { lat: Number(it.latitude), lng: Number(it.longitude) });
    return base - Math.min(dist, 10) * 0.3;
  };

  const picks = [];
  const pool = [...filtered];
  const wantCount = Math.max(1, Math.min(Number(count) || 2, pool.length));
  for (let i=0; i<wantCount; i++) {
    const weights = pool.map(p => Math.max(0.1, scoreWithDistance(p)));
    const chosen = weightedPick(pool, weights);
    picks.push(chosen);
    const idx = pool.findIndex(p => p.location_id === chosen.location_id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  const picksWithPhotos = await attachPhotosToItems(picks);

  const items = picksWithPhotos.map(chosen => ({
    location_id: chosen.location_id,
    type: chosen.category,
    location_name: chosen.location_name,
    score: scoreWithDistance(chosen),
    photos: chosen.photos
  }));

  const ordering_hint = [...currentRoute.map(String), ...items.map(p => String(p.location_id))];
  return { items, ordering_hint, strategy: 'route_next_v1' };
}

/** ================== 3) 루트 프리뷰 (변경 없음 자리) ================== */
export async function previewRoute({ selected = [], append = [], startId }) {
  // 기존 구현 그대로 사용
  return { selected, append, startId, meta: { note: 'previewRoute는 기존 구현 유지' } };
}

// 파일 내 기존 import/유틸 재사용 (haversineKm, buildGeoBox, filterWithinRadius, scoreOf, attachPhotosToItems 등 있음)

export async function recommendThreeDistinctCategoriesWithinRadius({
  center,
  radius_km = 3,
  excludeLocationIds = [],
  excludeCategories = [],
  takePool = 400     // 풀 사이즈
}) {
  const cLat = Number(center?.lat);
  const cLng = Number(center?.lng);
  const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng);
  const radKm = Number.isFinite(Number(radius_km)) ? Number(radius_km) : 3;

  const box = hasCenter ? buildGeoBox({ lat: cLat, lng: cLng }, radKm) : null;

  const where = {
    ...(excludeLocationIds?.length ? { location_id: { notIn: excludeLocationIds } } : {}),
    ...(excludeCategories?.length ? { category: { notIn: excludeCategories } } : {}),
    ...(box ? {
      AND: [
        { latitude:  { gte: box.minLat, lte: box.maxLat } },
        { longitude: { gte: box.minLng, lte: box.maxLng } }
      ]
    } : {})
  };

  // 1) 후보 풀 조회
  const rawPool = await prisma.location.findMany({
    where,
    select: {
      location_id: true, location_name: true, address: true,
      latitude: true, longitude: true, category: true,
      is_solo_friendly: true, description: true,
      rating_avg: true, rating_count: true, price_level: true,
      keywords: true, features: true, features_flat: true,
      opening_hours: true, created_at: true, updated_at: true
    },
    take: takePool,
    orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }, { updated_at: 'desc' }]
  });

  const pool = filterWithinRadius(rawPool, hasCenter ? { lat: cLat, lng: cLng } : undefined, radKm);

  if (!pool.length) {
    return {
      items: [],
      meta: {
        reason: hasCenter ? `반경 ${radKm}km 내 후보가 없습니다.` : 'center가 없거나 조건에 맞는 후보가 없습니다.',
        within_radius_km: hasCenter ? radKm : null
      }
    };
  }

  // 2) 카테고리별로 그룹핑 후 카테고리 3개 뽑기
  const byCat = new Map();
  for (const it of pool) {
    const k = it.category ?? '기타';
    const arr = byCat.get(k) ?? [];
    arr.push(it);
    byCat.set(k, arr);
  }

  // 카테고리 셔플 (간단 무작위)
  const cats = Array.from(byCat.keys());
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }

  const picked = [];
  for (const cat of cats) {
    if (picked.length >= 3) break;
    const arr = byCat.get(cat) ?? [];
    if (!arr.length) continue;
    // 평점/리뷰/신선도 가중 랜덤
    const weights = arr.map(a => Math.max(0.1, scoreOf(a)));
    // 가끔 완전 랜덤 느낌을 주려면 가중치에 소량의 노이즈를 섞을 수도 있음
    const sum = weights.reduce((a,b)=>a+b,0) || 1;
    let r = Math.random() * sum;
    let chosen = arr[0];
    for (let i=0;i<arr.length;i++) {
      r -= weights[i];
      if (r <= 0) { chosen = arr[i]; break; }
    }
    picked.push(chosen);
  }

  // 3) 부족하면 그대로 반환(요구사항: 서로 다른 카테고리이므로 중복 채우기 안 함)
  const itemsWithPhotos = await attachPhotosToItems(picked);

  return {
    items: itemsWithPhotos,
    meta: {
      distinct_categories: itemsWithPhotos.map(x => x.category ?? '기타'),
      distinct_count: itemsWithPhotos.length,
      within_radius_km: hasCenter ? radKm : null,
      note: itemsWithPhotos.length < 3 ? '반경 내 서로 다른 카테고리가 3개 미만' : undefined
    }
  };
}
