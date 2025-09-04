import { prisma } from '../lib/prisma.js';

/** ================== 유틸 ================== */
function haversineKm(a, b) {
  const toRad = x => x * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function scoreOf(item, center) {
  const rating = Number(item.rating_avg ?? 0);
  const rc = item.rating_count ?? 0;
  const freshnessDays = (Date.now() - new Date(item.updated_at ?? item.created_at ?? Date.now()).getTime()) / 86400000;
  // 거리 점수는 /locations 단순 추천에서는 영향 주지 않음(요청이 category+keyword만이므로)
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

/** ================== 1) category + keyword 단일 추천 ================== */
/**
 * 입력: { category: string, keyword: string }
 * 동작: Location.category == category AND Location.keywords HAS keyword
 * 후보에서 평점/리뷰/최근성 가중 랜덤으로 1개 선택
 */
export async function recommendOne({ category, keyword }) {
  if (!category || !keyword) return { items: [], strategy: 'simple_category_keyword_v1' };

  const candidates = await prisma.location.findMany({
    where: {
      AND: [
        { category: category },
        { keywords: { has: keyword } }
      ]
    },
    select: {
      location_id: true, location_name: true, category: true,
      latitude: true, longitude: true, rating_avg: true, rating_count: true,
      updated_at: true, created_at: true, price_level: true,
      keywords: true, features: true
    },
    take: 200
  });

  if (!candidates.length) return { items: [], strategy: 'simple_category_keyword_v1' };

  const weights = candidates.map(c => Math.max(0.1, scoreOf(c, null)));
  const picked = weightedPick(candidates, weights);
  return { items: [picked], strategy: 'simple_category_keyword_v1' };
}

/** ================== 2) 루트 이어 추천(N개) ================== */
/**
 * 입력: {
 *   currentRoute: number[],     // 이미 선택된 location_id 목록
 *   wantTypes?: string[],       // 원하는 카테고리 목록(없으면 전체)
 *   count?: number,             // 기본 2
 *   center?: {lat,lng}, delta?: number // (선택) 중심/범위
 * }
 * 동작: 현재 루트 제외, 카테고리 필터(있다면), (선택) bbox로 후보 구성 → 마지막 지점/센터 기준 점수 → 가중 랜덤 N개
 */
export async function recommendNext({
  currentRoute = [],
  wantTypes = [],
  count = 2,
  center,
  delta = 0.02
}) {
  const exclude = new Set(currentRoute.map(Number));
  const where = {};

  if (wantTypes?.length) {
    where.category = wantTypes.length === 1 ? wantTypes[0] : { in: wantTypes };
  }
  if (center && delta) {
    const d = Number(delta);
    const { lat, lng } = center;
    where.AND = [
      { latitude:  { gte: (lat - d).toFixed(6), lte: (lat + d).toFixed(6) } },
      { longitude: { gte: (lng - d).toFixed(6), lte: (lng + d).toFixed(6) } },
    ];
  }

  const candidates = await prisma.location.findMany({
    where,
    select: {
      location_id: true, location_name: true, category: true,
      latitude: true, longitude: true, rating_avg: true, rating_count: true,
      updated_at: true, created_at: true, keywords: true, features: true
    },
    take: 300
  });

  const filtered = candidates.filter(c => !exclude.has(Number(c.location_id)));
  if (!filtered.length) return { items: [], ordering_hint: currentRoute.map(String), strategy: 'route_next_v1' };

  // 현재 루트 마지막 지점 좌표 → 없으면 center → 없으면 null
  let lastPoint = null;
  if (currentRoute.length) {
    const last = await prisma.location.findUnique({
      where: { location_id: Number(currentRoute[currentRoute.length-1]) },
      select: { latitude: true, longitude: true }
    });
    if (last?.latitude != null && last?.longitude != null) {
      lastPoint = { lat: Number(last.latitude), lng: Number(last.longitude) };
    }
  }
  const centerForScore = lastPoint || center || null;

  const scoreWithDistance = (it) => {
    const base = scoreOf(it, null);
    if (!centerForScore || it.latitude == null || it.longitude == null) return base;
    const dist = haversineKm(centerForScore, { lat: Number(it.latitude), lng: Number(it.longitude) });
    // 가까울수록 가점(+), 멀수록 감점(-)
    return base - Math.min(dist, 10) * 0.3;
  };

  const picks = [];
  const pool = [...filtered];
  for (let i=0; i<Math.min(count, pool.length); i++) {
    const weights = pool.map(p => Math.max(0.1, scoreWithDistance(p)));
    const chosen = weightedPick(pool, weights);
    picks.push({
      location_id: chosen.location_id,
      type: chosen.category,
      score: scoreWithDistance(chosen)
    });
    const idx = pool.findIndex(p => p.location_id === chosen.location_id);
    if (idx >= 0) pool.splice(idx, 1);
  }

  const ordering_hint = [...currentRoute.map(String), ...picks.map(p => String(p.location_id))];
  return { items: picks, ordering_hint, strategy: 'route_next_v1' };
}

/** ================== 3) 루트 프리뷰(순서/거리/ETA) ================== */
export async function previewRoute({ selected = [], append = [], startId }) {
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

  const start = startId ? Number(startId) : ids[0];
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

  let total = 0;
  for (let i=0;i<path.length-1;i++) {
    const A = coord.get(path[i]);
    const B = coord.get(path[i+1]);
    if (A && B) total += haversineKm(A, B);
  }
  const eta_min = Math.round((total / 5) * 60); // 보행 5km/h 가정

  return {
    route: path.map((id, i) => ({ location_id: id, sequence_number: i + 1 })),
    metrics: { total_distance_km: Number(total.toFixed(2)), eta_min }
  };
}
