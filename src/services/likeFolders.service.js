import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export async function createFolder({ userId, name }) {
  const f = await prisma.likeFolder.create({
    data: { user_id: userId, name },
    select: { folder_id: true, name: true, created_at: true }
  }).catch(e => {
    if (e.code === 'P2002') throw new ApiError(409, 'Folder name already exists');
    throw e;
  });
  return f;
}

export async function listFolders({ userId }) {
  const rows = await prisma.likeFolder.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: 'asc' }],
    select: { folder_id: true, name: true, created_at: true, _count: { select: { items: true } } }
  });
  return { items: rows.map(r => ({ ...r, item_count: r._count.items })) };
}

export async function renameFolder({ userId, folderId, name }) {
  // 소유 검증
  const f = await prisma.likeFolder.findUnique({ where: { folder_id: folderId } });
  if (!f || f.user_id !== userId) throw new ApiError(404, 'Folder not found');

  const upd = await prisma.likeFolder.update({
    where: { folder_id: folderId },
    data: { name }
  }).catch(e => {
    if (e.code === 'P2002') throw new ApiError(409, 'Folder name already exists');
    throw e;
  });
  return { ok: true, folder_id: upd.folder_id, name: upd.name };
}

export async function removeFolder({ userId, folderId }) {
  const f = await prisma.likeFolder.findUnique({ where: { folder_id: folderId } });
  if (!f || f.user_id !== userId) throw new ApiError(404, 'Folder not found');
  await prisma.likeFolder.delete({ where: { folder_id: folderId } }); // items는 cascade
  return { ok: true };
}

export async function addToFolder({ userId, folderId, locationId }) {
  const f = await prisma.likeFolder.findUnique({ where: { folder_id: folderId } });
  if (!f || f.user_id !== userId) throw new ApiError(404, 'Folder not found');

  // 장소 존재 확인(실패시 404)
  const loc = await prisma.location.findUnique({ where: { location_id: locationId } });
  if (!loc) throw new ApiError(404, 'Location not found');

  await prisma.likeItem.upsert({
    where: { folder_id_location_id: { folder_id: folderId, location_id: locationId } },
    update: {},
    create: { folder_id: folderId, location_id: locationId }
  });
  return { saved: true };
}

export async function removeFromFolder({ userId, folderId, locationId }) {
  const f = await prisma.likeFolder.findUnique({ where: { folder_id: folderId } });
  if (!f || f.user_id !== userId) throw new ApiError(404, 'Folder not found');

  await prisma.likeItem.delete({
    where: { folder_id_location_id: { folder_id: folderId, location_id: locationId } }
  }).catch(() => {});
  return { saved: false };
}

export async function toggleInFolder({ userId, folderId, locationId }) {
  const existing = await prisma.likeItem.findUnique({
    where: { folder_id_location_id: { folder_id: folderId, location_id: locationId } }
  });
  if (existing) return removeFromFolder({ userId, folderId, locationId });
  return addToFolder({ userId, folderId, locationId });
}

export async function listFolderLocations({ userId, folderId, page = 1, limit = 20 }) {
  const f = await prisma.likeFolder.findUnique({ where: { folder_id: folderId } });
  if (!f || f.user_id !== userId) throw new ApiError(404, 'Folder not found');

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.likeItem.findMany({
      where: { folder_id: folderId },
      orderBy: { created_at: 'desc' },
      skip, take: limit,
      include: {
        location: {
          select: {
            location_id: true, location_name: true, address: true,
            category: true, latitude: true, longitude: true,
            rating_avg: true, rating_count: true, price_level: true,
            keywords: true, features: true, opening_hours: true,
          }
        }
      }
    }),
    prisma.likeItem.count({ where: { folder_id: folderId } })
  ]);

  return {
    page, limit, total,
    items: rows.map(r => ({ saved_at: r.created_at, ...r.location }))
  };
}
