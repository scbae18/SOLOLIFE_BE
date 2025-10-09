import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { getPagination, getOrder } from '../utils/pagination.js';
import { createReviewsFromLogbook } from './reviews.service.js';

/**
 * 공개 로그북 목록
 * - location_ids(Int[]) 스키마 기준으로 필터링/선택
 */
export async function listPublic(q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at']);

  const where = { is_public: true };
  if (q.userId) where.user_id = +q.userId;
  if (q.locationId) where.location_ids = { has: +q.locationId };
  if (q.journeyId) where.journey_id = +q.journeyId;

  const [items, total] = await Promise.all([
    prisma.logbookEntry.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        logbook_id: true,
        user_id: true,
        journey_id: true,
        location_ids: true, // ← 배열 스키마
        entry_title: true,
        created_at: true,
        image_urls: true,
        likes: true,
        scraps: true,
      },
    }),
    prisma.logbookEntry.count({ where }),
  ]);

  return { page, limit, total, items };
}

/**
 * 로그북 생성
 * - places[*].locationId | places[*].location_id 둘 다 허용
 * - 저장은 location_ids(Int[])로만
 * - 루트 level에 location_id가 들어오면 무시
 */
export async function createEntry(user_id, data) {
  // places 정규화
  const { places = [], ...logbookData } = data;
  const normPlaces = Array.isArray(places)
    ? places
        .map((p) => ({
          locationId: Number(p?.locationId ?? p?.location_id),
          rating: p?.rating != null ? Number(p.rating) : null,
        }))
        .filter((p) => Number.isInteger(p.locationId))
    : [];

  // 레거시 단일 location_id 필드가 들어오면 제거
  if ('location_id' in logbookData) delete logbookData.location_id;

  // 중복 제거된 location_ids
  const locationIds = [...new Set(normPlaces.map((p) => p.locationId))];

  const newLogbook = await prisma.logbookEntry.create({
    data: {
      ...logbookData,
      user_id,
      ...(locationIds.length ? { location_ids: locationIds } : {}),
    },
  });

  // 본문이 있고 places가 있으면 리뷰 자동 생성(비동기)
  if (normPlaces.length && newLogbook.entry_content) {
    createReviewsFromLogbook(newLogbook, normPlaces);
  }

  return newLogbook;
}

/**
 * 단일 로그북 조회
 */
export async function getEntry(logbook_id) {
  const e = await prisma.logbookEntry.findUnique({
    where: { logbook_id },
    include: { likes: true, scraps: true },
  });
  if (!e) throw new ApiError(404, 'Not found');
  return e;
}

/**
 * 로그북 수정
 * - 레거시 location_id 방어
 * - (필요 시) places 업데이트 로직은 별도로 다룸
 */
export async function updateEntry(user_id, logbook_id, data) {
  const e = await prisma.logbookEntry.findUnique({ where: { logbook_id } });
  if (!e) throw new ApiError(404, 'Not found');
  if (e.user_id !== user_id) throw new ApiError(403, 'Forbidden');

  const cleaned = { ...data };
  if ('location_id' in cleaned) delete cleaned.location_id; // 배열 스키마와 충돌 방지

  return prisma.logbookEntry.update({
    where: { logbook_id },
    data: cleaned,
  });
}

/**
 * 로그북 삭제
 */
export async function deleteEntry(user_id, logbook_id) {
  const e = await prisma.logbookEntry.findUnique({ where: { logbook_id } });
  if (!e) throw new ApiError(404, 'Not found');
  if (e.user_id !== user_id) throw new ApiError(403, 'Forbidden');

  await prisma.logbookEntry.delete({ where: { logbook_id } });
  return { ok: true };
}

/**
 * 좋아요 토글
 */
export async function toggleLike(user_id, logbook_id) {
  const existing = await prisma.like.findUnique({
    where: { logbook_id_user_id: { logbook_id, user_id } },
  });
  if (existing) {
    await prisma.like.delete({ where: { like_id: existing.like_id } });
    return { liked: false };
  }
  await prisma.like.create({ data: { logbook_id, user_id } });
  return { liked: true };
}

/**
 * 스크랩 토글
 */
export async function toggleScrap(user_id, logbook_id) {
  const existing = await prisma.scrap.findUnique({
    where: { logbook_id_user_id: { logbook_id, user_id } },
  });
  if (existing) {
    await prisma.scrap.delete({ where: { scrap_id: existing.scrap_id } });
    return { scrapped: false };
  }
  await prisma.scrap.create({ data: { logbook_id, user_id } });
  return { scrapped: true };
}

/**
 * 내 로그북 목록
 * - location_ids(Int[]) 기준 필터
 */
export async function listMine(user_id, q) {
  const { page, limit, skip } = getPagination(q);
  const orderBy = getOrder(q, ['created_at', 'updated_at']);

  const where = { user_id };
  if (q.locationId) where.location_ids = { has: +q.locationId };
  if (q.journeyId) where.journey_id = +q.journeyId;

  const [items, total] = await Promise.all([
    prisma.logbookEntry.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        logbook_id: true,
        user_id: true,
        journey_id: true,
        location_ids: true, // ← 배열 스키마
        entry_title: true,
        entry_content: true,
        is_public: true,
        created_at: true,
        updated_at: true,
        image_urls: true,
        likes: true,
        scraps: true,
      },
    }),
    prisma.logbookEntry.count({ where }),
  ]);

  return { page, limit, total, items };
}
