import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { getPagination } from '../utils/pagination.js';

export async function listMine(user_id, q) {
  const { page, limit, skip } = getPagination(q);
  const [items, total] = await Promise.all([
    prisma.journey.findMany({
      where: { user_id },
      orderBy: { journey_id: 'desc' },
      skip, take: limit,
      select: { journey_id: true, journey_title: true, created_at: true }
    }),
    prisma.journey.count({ where: { user_id } })
  ]);
  return { page, limit, total, items };
}

export async function createJourney(user_id, { journey_title, locations }) {
  // locations: [{ location_id, sequence_number }, ...]
  return prisma.$transaction(async (tx)=>{
    const j = await tx.journey.create({
      data: { user_id, journey_title }
    });
    if (Array.isArray(locations) && locations.length) {
      await tx.journeyLocation.createMany({
        data: locations.map(l => ({
          journey_id: j.journey_id,
          location_id: l.location_id,
          sequence_number: l.sequence_number
        }))
      });
    }
    return j;
  });
}

export async function getJourney(user_id, journey_id) {
  const j = await prisma.journey.findUnique({
    where: { journey_id },
    include: {
      locations: {
        include: { location: true },
        orderBy: { sequence_number: 'asc' }
      }
    }
  });
  if (!j || j.user_id !== user_id) throw new ApiError(404, 'Journey not found');
  return j;
}

export async function updateJourney(user_id, journey_id, { journey_title, locations }) {
  return prisma.$transaction(async (tx)=>{
    const j = await tx.journey.findUnique({ where: { journey_id } });
    if (!j || j.user_id !== user_id) throw new ApiError(404, 'Journey not found');

    if (journey_title) {
      await tx.journey.update({ where: { journey_id }, data: { journey_title } });
    }
    if (Array.isArray(locations)) {
      await tx.journeyLocation.deleteMany({ where: { journey_id } });
      if (locations.length) {
        await tx.journeyLocation.createMany({
          data: locations.map(l => ({
            journey_id,
            location_id: l.location_id,
            sequence_number: l.sequence_number
          }))
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
