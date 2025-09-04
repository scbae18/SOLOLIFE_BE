import { prisma } from '../lib/prisma.js';

/** ---------- 유틸 ---------- */
function toCsvArray(v) {
  if (v == null) return [];
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}
function haversineKm(a, b) {
  const toRad = x => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function scoreOf(item, center) {
  const rating = Number(item.rating_avg ?? 0);
  const rc = item.rating_count ?? 0;
  const freshnessDays = (Date.now() - new Date(item.updated_at ?? item.created_at ?? Date.now()).getTime()) / 86400000;
  const distanceKm = (center && item.latitude != null && item.longitude != null)
    ? haversineKm(center, { lat: Number(item.latitude), lng: Number(item.longitude) })
    : 0;

  // 간단한 가중치 (상황보고 조절)
  return (
    rating * 2 +
    Math.min(rc, 200) / 50 -              // 리뷰수 상한
    Math.min(distanceKm, 10) * 0.3 -      // 가까울수록 가점
    Math.min(freshnessDays, 30) * 0.05    // 최근 업데이트 가점
  );
}
function weightedPick(items, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * (sum || 1);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 공통 where 빌더 (category/keywords/features/price/bbox) */
function buildLocationWhere({
  category,
  keywords = [],
  features = [],
  priceLevels = [],
  center,
  delta
}) {
  const where = {};
  if (category) where.category = category;

  if (keywords.length) where.keywords = { hasSome: keywords };

  // features_flat(추천), 없으면 JSON array_contains fallback
  if (features.length) {
    where.OR = [
      { features_flat: { hasSome: features } },
      { features: { array_contains: features } }
      // 만약 features를 {atmosphere:[...]} 구조로 저장했다면:
      // { features: { path: ['atmosphere'], array_contains: features } }
    ];
  }

  if (priceLevels.length) where.price_level = { in: priceLevels.map(Number) };

  if (center && delta) {
    const { lat, lng } = center;
    const d = Number(delta);
    where.AND = [
      { latitude:  { gte: (lat - d).toFixed(6), lte: (lat + d).toFixed(6) } },
      { longitude: { gte: (lng - d).toFixed(6), lte: (lng + d).toFixed(6) } }
    ];
  }
  return where;
}

/** 1) 단일 추천 */
export async function recommendOne({ category, features = [], keywords = [], center, delta = 0.02, priceLevels = [] }) {
  const where = buildLocationWhere({ category, features, keywords, priceLevels, center, delta });

  const candidates = await prisma.location.findMany({
    where,
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
      features: true
    },
    take: 200
  });

  if (!candidates.length) {
    return { items: [], strategy: 'weighted_random_v1' };
  }

  const weights = candidates.map(c => Math.max(0.1, scoreOf(c, center)));
  const picked = weightedPick(candidates, weights);
  return { items: [picked], strategy: 'weighted_random_v1' };
}

/** 2) 이어붙일 추천 */
export async function recommendNext({
  currentRoute = [],
  wantTypes = [],
  features = [],
  keywords = [],
  count = 2,
  center,
  delta = 0.02
}) {
  // 현재 루트 제외
  const excludeIds = new Set(currentRoute.map(Number));

  const where = buildLocationWhere({
    category: wantTypes.length === 1 ? wantTypes[0] : undefined,
    features,
    keywords,
    priceLevels: [],
    center,
    delta
  });
  if (wantTypes.length > 1) {
    where.category = { in: wantTypes };
  }

  // 후보 가져오기
  const candidates = await prisma.location.findMany({
    where,
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
      keywords: true,
      features: true
    },
    take: 300
  });

  // 제외
  const filtered = candidates.filter(c => !excludeIds.has(Number(c.location_id)));
  if (!filtered.length) return { items: [], strategy: 'route_next_v1' };

  // 현재 루트 마지막 지점 기준 거리 가중 강화
  let lastPoint = null;
  if (currentRoute.length) {
    const last = await prisma.location.findUnique({
      where: { location_id: Number(currentRoute[currentRoute.length - 1]) },
      select: { latitude: true, longitude: true }
    });
    if (last?.latitude != null && last?.longitude != null) {
      lastPoint = { lat: Number(last.latitude), lng: Number(last.longitude) };
    }
  }
  const centerForScore = lastPoint || center || null;

  // 점수 계산 + 상위 후보 선택(가중 랜덤 반복)
  const picks = [];
  const pool = [...filtered];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const weights = pool.map(p => Math.max(0.1, scoreOf(p, centerForScore)));
    const chosen = weightedPick(pool, weights);
    picks.push({
      location_id: chosen.location_id,
      type: chosen.category,
      score: scoreOf(chosen, centerForScore)
    });
    // 중복방지 제거
    const idx = pool.findIndex(p => p.location_id === chosen.location_id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  // 간단 ordering hint: (현재 마지막 → 선택된 순서)
  const ordering_hint = [...currentRoute.map(String), ...picks.map(p => String(p.location_id))];

  return { items: picks, ordering_hint, strategy: 'route_next_v1' };
}

/** 3) 루트 프리뷰 (순서/거리 계산) */
export async function previewRoute({ selected = [], append = [], startId, center }) {
  const ids = [...new Set([...selected, ...append])].map(Number);
  if (!ids.length) return { route: [], metrics: { total_distance_km: 0, eta_min: 0 } };

  const locs = await prisma.location.findMany({
    where: { location_id: { in: ids } },
    select: { location_id: true, latitude: true, longitude: true }
  });
  const coord = new Map(
    locs
      .filter(l => l.latitude != null && l.longitude != null)
      .map(l => [Number(l.location_id), { lat: Number(l.latitude), lng: Number(l.longitude) }])
  );

  // 시작점
  let start = startId ? Number(startId) : ids[0];

  // 최근접 이웃으로 순서 정렬
  const pool = ids.filter(id => id !== start);
  const path = [start];
  while (pool.length) {
    const last = path[path.length - 1];
    pool.sort((a, b) => {
      const A = coord.get(a), B = coord.get(b), L = coord.get(last);
      if (!A || !B || !L) return 0;
      return haversineKm(L, A) - haversineKm(L, B);
    });
    path.push(pool.shift());
  }

  // 총 거리(km) 계산
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const A = coord.get(path[i]);
    const B = coord.get(path[i + 1]);
    if (A && B) total += haversineKm(A, B);
  }

  // 간단 ETA(분): 평균 5km/h 보행 가정
  const eta_min = Math.round((total / 5) * 60);

  return {
    route: path.map((id, i) => ({ location_id: id, sequence_number: i + 1 })),
    metrics: { total_distance_km: Number(total.toFixed(2)), eta_min }
  };
}
