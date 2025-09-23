// src/services/journeys.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { getPagination } from '../utils/pagination.js';

/** 문자열 배열 정규화: trim + 빈값 제거 + 중복 제거 */
function normalizeTags(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return [...new Set(arr.map(String).map(s => s.trim()).filter(Boolean))];
}

export async function listMine(user_id, q) {
  const { page, limit, skip } = getPagination(q);
  const [items, total] = await Promise.all([
    prisma.journey.findMany({
      where: { user_id },
      orderBy: { journey_id: 'desc' },
      skip, take: limit,
      select: {
        journey_id: true,
        journey_title: true,
        created_at: true,
        tags: true, // ← 태그 포함
      }
    }),
    prisma.journey.count({ where: { user_id } })
  ]);
  return { page, limit, total, items };
}

// ✅ 표준 시그니처로 단일화 + tags 지원
export async function createJourney({ userId, journeyTitle, locations, tags = [] }) {
  // 1) 기본 검증
  if (!userId) throw new Error('userId is required');
  if (!journeyTitle || typeof journeyTitle !== 'string') throw new Error('journey_title is required');
  if (!Array.isArray(locations) || locations.length === 0) throw new Error('locations must be a non-empty array');
  if (tags && !Array.isArray(tags)) throw new Error('tags must be an array of strings');

  // 고유 location_id만 허용
  const uniqIds = [...new Set(locations.map((l) => Number(l.location_id)))].filter(Boolean);
  if (uniqIds.length !== locations.length) {
    throw new Error('locations contain duplicate location_id');
  }

  // 존재 여부 확인
  const exist = await prisma.location.findMany({
    where: { location_id: { in: uniqIds } },
    select: { location_id: true },
  });
  if (exist.length !== uniqIds.length) {
    const existSet = new Set(exist.map((e) => Number(e.location_id)));
    const missing = uniqIds.filter((id) => !existSet.has(id));
    throw new Error(`invalid location_id(s): ${missing.join(', ')}`);
  }

  // sequence_number 부여(없으면 1..N)
  const withSeq = locations.map((l, i) => ({
    location_id: Number(l.location_id),
    sequence_number: l.sequence_number ? Number(l.sequence_number) : i + 1,
  }));

  const tagList = normalizeTags(tags);

  // 2) 트랜잭션: Journey(tags 포함) → JourneyLocation[]
  const result = await prisma.$transaction(async (tx) => {
    const journey = await tx.journey.create({
      data: {
        user_id: Number(userId),
        journey_title: journeyTitle,
        tags: tagList, // ← 태그 저장
      },
      select: {
        journey_id: true,
        user_id: true,
        journey_title: true,
        created_at: true,
        tags: true,
      },
    });

    await tx.journeyLocation.createMany({
      data: withSeq.map((x) => ({
        journey_id: journey.journey_id,
        location_id: x.location_id,
        sequence_number: x.sequence_number,
      })),
    });

    const items = await tx.journeyLocation.findMany({
      where: { journey_id: journey.journey_id },
      orderBy: { sequence_number: 'asc' },
      select: {
        journey_location_id: true,
        sequence_number: true,
        location: {
          select: {
            location_id: true,
            location_name: true,
            address: true,
            category: true,
            latitude: true,
            longitude: true,
            rating_avg: true,
            rating_count: true,
          },
        },
      },
    });

    return { journey, items };
  });

  return {
    journey_id: result.journey.journey_id,
    journey_title: result.journey.journey_title,
    created_at: result.journey.created_at,
    tags: result.journey.tags, // ← 응답 포함
    locations: result.items.map((it) => ({
      journey_location_id: it.journey_location_id,
      sequence_number: it.sequence_number,
      ...it.location,
    })),
  };
}

export async function getJourney(user_id, journey_id) {
  const j = await prisma.journey.findUnique({
    where: { journey_id },
    include: {
      locations: {
        include: { location: true },
        orderBy: { sequence_number: 'asc' }
      }
    },
    // include로 가져오면 기본 필드 + tags 모두 포함됨 (스키마에 tags 존재 시)
  });
  if (!j || j.user_id !== user_id) throw new ApiError(404, 'Journey not found');

  // 상세 응답 형태 정리(태그 포함)
  return {
    journey_id: j.journey_id,
    user_id: j.user_id,
    journey_title: j.journey_title,
    created_at: j.created_at,
    tags: j.tags ?? [],
    locations: j.locations
  };
}

export async function updateJourney(user_id, journey_id, { journey_title, locations, tags }) {
  return prisma.$transaction(async (tx) => {
    const j = await tx.journey.findUnique({ where: { journey_id } });
    if (!j || j.user_id !== user_id) throw new ApiError(404, 'Journey not found');

    // 제목/태그 업데이트
    const patch = {};
    if (journey_title) patch.journey_title = journey_title;
    if (tags !== undefined) {
      if (tags && !Array.isArray(tags)) throw new Error('tags must be an array of strings');
      patch.tags = normalizeTags(tags); // [] 전달 시 모두 제거
    }
    if (Object.keys(patch).length) {
      await tx.journey.update({ where: { journey_id }, data: patch });
    }

    // 시퀀스/장소 변경(전체 교체)
    if (Array.isArray(locations)) {
      await tx.journeyLocation.deleteMany({ where: { journey_id } });
      if (locations.length) {
        await tx.journeyLocation.createMany({
          data: locations.map((l, i) => ({
            journey_id,
            location_id: Number(l.location_id),
            sequence_number: l.sequence_number ? Number(l.sequence_number) : i + 1,
          })),
        });
      }
    }
    return { ok: true };
  });
}

export async function removeJourney(user_id, journey_id) {
  const j = await prisma.journey.findUnique({ where: { journey_id } });
  if (!j || j.user_id !== user_id) throw new ApiError(404, 'Journey not found');
  await prisma.journey.delete({ where: { journey_id } });
  return { ok: true };
}
