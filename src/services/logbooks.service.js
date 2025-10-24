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
  // places 정규화 (기존과 동일)
  const { places = [], ...logbookData } = data;
  const normPlaces = Array.isArray(places)
    ? places
        .map((p) => ({
          locationId: Number(p?.locationId ?? p?.location_id),
          rating: p?.rating != null ? Number(p.rating) : null,
        }))
        .filter((p) => Number.isInteger(p.locationId))
    : [];
  if ('location_id' in logbookData) delete logbookData.location_id;
  const locationIds = [...new Set(normPlaces.map((p) => p.locationId))];

  // 1. 로그북 생성 (기존과 동일)
  const newLogbook = await prisma.logbookEntry.create({
    data: {
      ...logbookData,
      user_id,
      ...(locationIds.length ? { location_ids: locationIds } : {}),
    },
  });

  // --- ⭐️ 2. 장소 평균 평점 업데이트 로직 추가 ---
  // 로그북 생성이 성공한 후에 각 장소의 평점을 업데이트합니다.
  if (normPlaces.length > 0) {
    // Promise.all 대신 for...of 루프 사용
    for (const place of normPlaces) {
      if (place.rating !== null) {
        // await를 사용하여 각 업데이트가 끝날 때까지 기다립니다.
        await updateLocationAverageRating(place.locationId, place.rating);
      }
    }
  }
  // --- 평점 업데이트 로직 끝 ---

  // 3. 리뷰 자동 생성 호출 (기존과 동일, 비동기)
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

/**
 * 특정 장소의 평균 평점과 카운트를 업데이트합니다.
 * @param {number} locationId - 업데이트할 장소의 ID
 * @param {number} newRating - 새로 추가된 별점 (1~5)
 */
async function updateLocationAverageRating(locationId, newRating) {
  // 별점이 null이거나 숫자가 아니거나 범위를 벗어나면 무시
  const ratingValue = Number(newRating);
  if (newRating == null || !Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    console.warn(`Invalid rating value (${newRating}) for location ${locationId}. Skipping update.`);
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. 현재 장소 정보 가져오기 (잠금)
      const location = await tx.location.findUnique({
        where: { location_id: locationId },
        select: { rating_avg: true, rating_count: true },
      });
      if (!location) return; // 장소가 없으면 중단

      // 2. 새 평균 계산
      const currentAvg = Number(location.rating_avg ?? 0);
      const currentCount = location.rating_count ?? 0;
      const newCount = currentCount + 1;
      const newAvg = parseFloat(((currentAvg * currentCount + ratingValue) / newCount).toFixed(2));

      // 3. DB 업데이트
      await tx.location.update({
        where: { location_id: locationId },
        data: { rating_avg: newAvg, rating_count: newCount },
      });
    });
    // console.log(`Updated rating for location ${locationId}: avg=${newAvg}, count=${newCount}`); // 성공 로그 (필요시 주석 해제)
  } catch (error) {
    console.error(`Failed to update rating for location ${locationId}:`, error);
  }
}
