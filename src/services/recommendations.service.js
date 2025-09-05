import { prisma } from '../lib/prisma.js';

/** ================== 유틸 (기존) ================== */
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

async function pickRandomByCategory(category) {
  const rows = await prisma.$queryRaw`
    SELECT
      "location_id", "location_name", "address", "latitude", "longitude",
      "category", "is_solo_friendly", "description",
      "rating_avg", "rating_count", "price_level",
      "keywords", "features", "features_flat", "opening_hours",
      "dedupe_signature", "created_at", "updated_at"
    FROM "Location"
    WHERE "category" = ${category}
    ORDER BY random()
    LIMIT 1
  `;
  return rows?.[0] ? [rows[0]] : [];
}


/** ================== 1) 단일 추천(분기 로직 추가) ================== */
/**
 * 입력: { category: string, keywords?: string[], moods?: string[] }
 * 동작:
 *  - keywords만 있으면: category AND keywords(hasEvery)
 *  - moods만 있으면:    category AND features_flat(hasEvery)
 *  - 둘 다 있으면:      category AND keywords(hasEvery) AND features_flat(hasEvery)
 *  - 둘 다 없으면:      전역 랜덤 1개
 *  - 위 필터에서 후보 0개면: 메시지와 함께 전역 랜덤 1개
 */
export async function recommendOne({ category, keywords = [], moods = [] }) {
  const hasK = Array.isArray(keywords) && keywords.length > 0;
  const hasM = Array.isArray(moods) && moods.length > 0;

  // 3) 둘 다 없음 → "해당 카테고리 내" 랜덤 1개
  if (!hasK && !hasM) {
    const items = await pickRandomByCategory(category);
    return {
      items,
      message: items.length
        ? '키워드/무드 입력이 없어 해당 카테고리 내에서 랜덤으로 추천합니다.'
        : '해당 카테고리에 장소가 없어 추천할 수 없습니다.',
      strategy: 'fallback_random_in_category_v1'
    };
  }

  // where 동적 구성 (카테고리 고정)
  const whereAnd = [{ category }];
  if (hasK) whereAnd.push({ keywords: { hasEvery: keywords } });
  if (hasM) whereAnd.push({ features_flat: { hasEvery: moods } });

  const candidates = await prisma.location.findMany({
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
      features_flat: true
    },
    take: 300
  });

  // 매칭 0개 → "해당 카테고리 내" 랜덤 1개로 대체
  if (!candidates.length) {
    const items = await pickRandomByCategory(category);
    return {
      items,
      message: items.length
        ? '조건에 맞는 장소가 없어 해당 카테고리 내에서 랜덤으로 추천합니다.'
        : '해당 카테고리에 장소가 없어 추천할 수 없습니다.',
      strategy: 'no_match_fallback_random_in_category_v1'
    };
  }

  // 가중 랜덤 1개 선택 (기존 동일)
  const weights = candidates.map(c => Math.max(0.1, scoreOf(c)));
  const picked = weightedPick(candidates, weights);

  return {
    items: [picked],
    strategy: hasK && hasM
      ? 'category_keywords_moods_and_v2'
      : (hasK ? 'category_keywords_only_v2' : 'category_moods_only_v2')
  };
}

/** ================== 2) 루트 이어 추천 / 3) 프리뷰 (변경 없음) ================== */
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

  // 점수 + 거리 가중(기존)
  const lastPoint = null; // (기존 로직 유지하려면 여기서 last/center 계산 포함)
  const centerForScore = lastPoint || center || null;
  const scoreWithDistance = (it) => {
    const base = scoreOf(it);
    if (!centerForScore || it.latitude == null || it.longitude == null) return base;
    const dist = haversineKm(centerForScore, { lat: Number(it.latitude), lng: Number(it.longitude) });
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
      const hav = (P, Q) => haversineKm(P, Q);
      return hav(L, A) - hav(L, B);
    });
    path.push(pool.shift());
  }

  let total = 0;
  for (let i=0;i<path.length-1;i++) {
    const A = coord.get(path[i]);
    const B = coord.get(path[i+1]);
    if (A && B) total += haversineKm(A, B);
  }
  const eta_min = Math.round((total / 5) * 60);

  return {
    route: path.map((id, i) => ({ location_id: id, sequence_number: i + 1 })),
    metrics: { total_distance_km: Number(total.toFixed(2)), eta_min }
  };
}
