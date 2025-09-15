// src/controllers/reviews.controller.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { getPagination, getOrder } from '../utils/pagination.js';

/**
 * GET /reviews
 * 필터: locationId | logbookId | userId
 * 정렬: created_at (기본), updated_at
 */
export async function list(req, res, next) {
  try {
    const q = req.query ?? {};
    const { page, limit, skip } = getPagination(q);
    const orderBy = getOrder(q, ['created_at', 'updated_at']);

    const where = {};
    if (q.locationId) where.location_id = +q.locationId;
    if (q.logbookId)  where.logbook_id  = +q.logbookId;
    if (q.userId)     where.user_id     = +q.userId;

    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          review_id: true,
          user_id: true,
          location_id: true,
          logbook_id: true,
          rating: true,
          content: true,      // Json: string[]
          created_at: true,
          updated_at: true,
          user: {
            select: { user_id: true, username: true }
          },
          location: {
            select: { location_id: true, location_name: true, category: true }
          }
        }
      }),
      prisma.review.count({ where })
    ]);

    res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /reviews/:reviewId
 */
export async function detail(req, res, next) {
  try {
    const reviewId = +req.params.reviewId;
    const r = await prisma.review.findUnique({
      where: { review_id: reviewId },
      select: {
        review_id: true,
        user_id: true,
        location_id: true,
        logbook_id: true,
        rating: true,
        content: true,
        created_at: true,
        updated_at: true,
        user: { select: { user_id: true, username: true } },
        location: { select: { location_id: true, location_name: true, category: true } },
        logbook: { select: { logbook_id: true, entry_title: true, created_at: true } }
      }
    });
    if (!r) throw new ApiError(404, 'Review not found');
    res.json(r);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /reviews
 * 수동 작성(옵션) — 자동 생성은 reviews.service.js에서 처리됨
 * body: { location_id, logbook_id, rating, content(string|string[]) }
 * 제약: (logbook_id, location_id) 유니크
 */
export async function create(req, res, next) {
  try {
    const userId = req.user?.user_id;
    if (!userId) throw new ApiError(401, 'Unauthorized');

    const { location_id, logbook_id, rating, content } = req.body ?? {};

    if (!location_id || !logbook_id) {
      throw new ApiError(400, 'location_id and logbook_id are required');
    }
    if (typeof rating !== 'number') {
      throw new ApiError(400, 'rating must be a number');
    }

    // content: string | string[] 허용 → string[] 로 normalize
    let contentJson = content;
    if (typeof contentJson === 'string') contentJson = [contentJson];
    if (!Array.isArray(contentJson)) contentJson = [];

    // (logbook_id, location_id) 유니크 보장 → 중복 존재 시 409 반환
    try {
      const r = await prisma.review.create({
        data: {
          user_id: userId,
          location_id: Number(location_id),
          logbook_id: Number(logbook_id),
          rating: Number(rating),
          content: contentJson,
        },
        select: {
          review_id: true,
          user_id: true,
          location_id: true,
          logbook_id: true,
          rating: true,
          content: true,
          created_at: true,
          updated_at: true
        }
      });
      res.status(201).json(r);
    } catch (e) {
      if (e.code === 'P2002') {
        // @@unique([logbook_id, location_id])
        throw new ApiError(409, 'Review for this logbook & location already exists');
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /reviews/:reviewId
 * 작성자만 수정 가능
 * body: { rating?, content?(string|string[]) }
 */
export async function update(req, res, next) {
  try {
    const userId = req.user?.user_id;
    if (!userId) throw new ApiError(401, 'Unauthorized');

    const reviewId = +req.params.reviewId;
    const found = await prisma.review.findUnique({
      where: { review_id: reviewId },
      select: { review_id: true, user_id: true }
    });
    if (!found) throw new ApiError(404, 'Review not found');
    if (found.user_id !== userId) throw new ApiError(403, 'Forbidden');

    const { rating, content } = req.body ?? {};
    const data = {};

    if (rating !== undefined) {
      if (typeof rating !== 'number') throw new ApiError(400, 'rating must be a number');
      data.rating = Number(rating);
    }
    if (content !== undefined) {
      let arr = content;
      if (typeof arr === 'string') arr = [arr];
      if (!Array.isArray(arr)) throw new ApiError(400, 'content must be string or string[]');
      data.content = arr;
    }

    const updated = await prisma.review.update({
      where: { review_id: reviewId },
      data,
      select: {
        review_id: true,
        user_id: true,
        location_id: true,
        logbook_id: true,
        rating: true,
        content: true,
        created_at: true,
        updated_at: true
      }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /reviews/:reviewId
 * 작성자만 삭제 가능
 */
export async function remove(req, res, next) {
  try {
    const userId = req.user?.user_id;
    if (!userId) throw new ApiError(401, 'Unauthorized');

    const reviewId = +req.params.reviewId;
    const found = await prisma.review.findUnique({
      where: { review_id: reviewId },
      select: { review_id: true, user_id: true }
    });
    if (!found) throw new ApiError(404, 'Review not found');
    if (found.user_id !== userId) throw new ApiError(403, 'Forbidden');

    await prisma.review.delete({ where: { review_id: reviewId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
