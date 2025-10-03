import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { getPagination, getOrder } from '../utils/pagination.js';
import { createReviewsFromLogbook } from './reviews.service.js';

export async function listPublic(q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at']);
  const where = { is_public: true };
  if (q.userId) where.user_id = +q.userId;
  if (q.locationId) where.location_id = +q.locationId;
  if (q.journeyId) where.journey_id = +q.journeyId;

  const [items, total] = await Promise.all([
    prisma.logbookEntry.findMany({
      where, orderBy, skip, take: limit,
      select: {
        logbook_id: true, user_id: true, journey_id: true, location_id: true,
        entry_title: true, created_at: true, image_urls: true,
        likes: true, scraps: true
      }
    }),
    prisma.logbookEntry.count({ where })
  ]);
  return { page, limit, total, items };
}

export async function createEntry(user_id, data) {
  const { places, ...logbookData } = data;

  // places → Int[] (숫자만, 중복 제거)
  const locationIds = Array.from(
    new Set(
      (Array.isArray(places) ? places : [])
        .map(p => Number(p?.locationId))
        .filter(Number.isInteger)
    )
  );

  const newLogbook = await prisma.logbookEntry.create({
    data: {
      ...logbookData,
      user_id,
      ...(locationIds.length ? { location_ids: { set: locationIds } } : {})
    },
  });

  // 본문이 있고 places가 있으면 리뷰 자동 생성(비동기)
  if (Array.isArray(places) && places.length && newLogbook.entry_content) {
    createReviewsFromLogbook(newLogbook, places);
  }
  return newLogbook;
}


export async function getEntry(logbook_id) {
  const e = await prisma.logbookEntry.findUnique({
    where: { logbook_id },
    include: { likes: true, scraps: true }
  });
  if (!e) throw new ApiError(404, 'Not found');
  return e;
}

export async function updateEntry(user_id, logbook_id, data) {
  const e = await prisma.logbookEntry.findUnique({ where: { logbook_id } });
  if (!e) throw new ApiError(404, 'Not found');
  if (e.user_id !== user_id) throw new ApiError(403, 'Forbidden');

  return prisma.logbookEntry.update({
    where: { logbook_id },
    data
  });
}

export async function deleteEntry(user_id, logbook_id) {
  const e = await prisma.logbookEntry.findUnique({ where: { logbook_id } });
  if (!e) throw new ApiError(404, 'Not found');
  if (e.user_id !== user_id) throw new ApiError(403, 'Forbidden');
  await prisma.logbookEntry.delete({ where: { logbook_id } });
  return { ok: true };
}

export async function toggleLike(user_id, logbook_id) {
  const existing = await prisma.like.findUnique({
    where: { logbook_id_user_id: { logbook_id, user_id } }
  });
  if (existing) {
    await prisma.like.delete({ where: { like_id: existing.like_id } });
    return { liked: false };
  }
  await prisma.like.create({ data: { logbook_id, user_id } });
  return { liked: true };
}

export async function toggleScrap(user_id, logbook_id) {
  const existing = await prisma.scrap.findUnique({
    where: { logbook_id_user_id: { logbook_id, user_id } }
  });
  if (existing) {
    await prisma.scrap.delete({ where: { scrap_id: existing.scrap_id } });
    return { scrapped: false };
  }
  await prisma.scrap.create({ data: { logbook_id, user_id } });
  return { scrapped: true };
}

export async function listMine(user_id, q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at','updated_at']);

  const where = { user_id };
  if (q.locationId) where.location_id = +q.locationId;
  if (q.journeyId) where.journey_id = +q.journeyId;

  const [items, total] = await Promise.all([
    prisma.logbookEntry.findMany({
      where,
      orderBy,
      skip, take: limit,
      select: {
        logbook_id: true, user_id: true, journey_id: true, location_id: true,
        entry_title: true, entry_content: true, is_public: true,
        created_at: true, updated_at: true, image_urls: true,
        likes: true, scraps: true
      }
    }),
    prisma.logbookEntry.count({ where })
  ]);

  return { page, limit, total, items };
}