import { prisma } from '../lib/prisma.js';

export async function likeLocationById({ userId, locationId }) {
  await prisma.locationLike.upsert({
    where: { user_id_location_id: { user_id: userId, location_id: locationId } },
    update: {},
    create: { user_id: userId, location_id: locationId }
  });
  return { liked: true };
}

export async function unlikeLocationById({ userId, locationId }) {
  await prisma.locationLike.delete({
    where: { user_id_location_id: { user_id: userId, location_id: locationId } }
  }).catch(() => {});
  return { liked: false };
}

export async function toggleLikeLocation({ userId, locationId }) {
  const existing = await prisma.locationLike.findUnique({
    where: { user_id_location_id: { user_id: userId, location_id: locationId } }
  });
  if (existing) return unlikeLocationById({ userId, locationId });
  return likeLocationById({ userId, locationId });
}

export async function listMyLikedLocations({ userId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.locationLike.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip, take: limit,
      include: { location: true }
    }),
    prisma.locationLike.count({ where: { user_id: userId } })
  ]);
  return {
    page, limit, total,
    items: rows.map(r => ({ like_id: r.like_id, created_at: r.created_at, location: r.location }))
  };
}

// 선택: 장소 상세에 좋아요수 & 내가 좋아요했는지 함께 반환하는 헬퍼
export async function getLocationWithLikeMeta({ userId, locationId }) {
  const [loc, count, mine] = await Promise.all([
    prisma.location.findUnique({ where: { location_id: locationId } }),
    prisma.locationLike.count({ where: { location_id: locationId } }),
    prisma.locationLike.findUnique({
      where: { user_id_location_id: { user_id: userId, location_id: locationId } }
    })
  ]);
  return { ...loc, like_count: count, liked_by_me: !!mine };
}
