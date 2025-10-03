// src/services/locations.service.js
import { prisma } from '../lib/prisma.js';
import { getPagination, getOrder } from '../utils/pagination.js';

/** 간단 CSV 파서 */
function parseCsv(value) {
  if (value == null) return [];
  return String(value)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export async function listLocations(q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at','updated_at','rating_avg','rating_count']);

  const where = {};

  // 1) 기본 필터
  if (q.category) where.category = q.category;

  // price_level: 단일/다중 모두 지원 (예: 1 또는 "1,2,3")
  if (q.price_level) {
    const arr = Array.isArray(q.price_level) ? q.price_level : parseCsv(q.price_level);
    if (arr.length === 1) where.price_level = +arr[0];
    if (arr.length > 1) where.price_level = { in: arr.map(n => +n) };
  }

  // 2) keywords: 단일 키워드(q.keyword) + 다중(q.keywords)
  // - 단일: exact match
  // - 다중: hasSome (교집합 존재)
  if (q.keyword) where.keywords = { has: q.keyword }; // backward compatibility (exact) 
  const kws = parseCsv(q.keywords);
  if (kws.length) where.keywords = { hasSome: kws };

  // 3) features: JSON 또는 평탄화 배열(features_flat) 둘 다 고려
  // - 스키마에 features_flat String[] 가 있다면 hasSome 사용
  // - 없다면 features(JSON)가 ["조용함","아늑함"] 형태라고 가정하고 array_contains 사용
  const fs = parseCsv(q.features);
  if (fs.length) {
    // 우선 features_flat 시도
    where.OR = [
      { features_flat: { hasSome: fs } },
      // JSON 배열 기준(예: features = ["조용함","아늑함"])
      { features: { array_contains: fs } }
      // 만약 features를 { atmosphere: [...] }처럼 저장했다면:
      // { features: { path: ['atmosphere'], array_contains: fs } }
    ];
  }

  // 4) bounding box (centerLat, centerLng, delta)
  if (q.centerLat && q.centerLng && q.delta) {
    const clat = parseFloat(q.centerLat), clng = parseFloat(q.centerLng), d = parseFloat(q.delta);
    where.AND = [
      { latitude:  { gte: (clat - d).toFixed(6), lte: (clat + d).toFixed(6) } },
      { longitude: { gte: (clng - d).toFixed(6), lte: (clng + d).toFixed(6) } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.location.findMany({
      where, orderBy, skip, take: limit,
      select: {
        location_id: true, location_name: true, category: true,
        latitude: true, longitude: true, rating_avg: true, rating_count: true,
        price_level: true, keywords: true, updated_at: true,
        features: true,        // 반환에 features 포함
        opening_hours: true    // 필요 시 UI에서 활용
      }
    }),
    prisma.location.count({ where })
  ]);

  return { page, limit, total, items };
}

export function getLocation(location_id) {
  return prisma.location.findUnique({
    where: { location_id },
    include: {
    }
  });
}

// 운영/수집용
export function createLocation(data) {
  return prisma.location.create({ data });
}
