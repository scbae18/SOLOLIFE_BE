import { prisma } from '../lib/prisma.js';
import { getPagination, getOrder } from '../utils/pagination.js';

export async function listLocations(q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at','updated_at','rating_avg','rating_count']);

  const where = {};
  if (q.category) where.category = q.category;
  if (q.price_level) where.price_level = +q.price_level;
  if (q.keyword) where.keywords = { has: q.keyword }; // exact keyword
  // bounding box (centerLat, centerLng, delta)
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
        price_level: true, keywords: true, updated_at: true
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
      journeys: false,
      logbookEntries: { select: { logbook_id: true }, take: 3 }
    }
  });
}

// 운영/수집용
export function createLocation(data) {
  return prisma.location.create({ data });
}
