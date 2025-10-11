// src/services/assets.service.js
import { ApiError } from '../lib/ApiError.js';
import { prisma } from '../lib/prisma.js';

export function createAsset(data) {
  const { id, label, group } = data;
  if (!id || !label || !group) throw new ApiError(400, 'id, label, group required');
  const allowed = new Set(['bg1-only', 'bg23']);
  if (!allowed.has(group)) throw new ApiError(400, 'invalid group (bg1-only|bg23)');
  return prisma.asset.create({ data: { id, label, group } });
}

export function listAssets() {
  return prisma.asset.findMany({
    orderBy: { asset_id: 'asc' },
    select: { id: true, label: true, group: true },
  });
}

export async function listMyAssets(user_id) {
  const u = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true },
  });
  if (!u) throw new ApiError(404, 'User not found');
  const ids = Array.from(new Set((u.assets ?? []).map(Number))).filter(Boolean);
  if (!ids.length) return [];
  return prisma.asset.findMany({
    where: { asset_id: { in: ids } },
    select: { id: true, label: true, group: true },
  });
}

export async function unlockAsset(user_id, assetId) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, 'Asset not found');

  const u = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true },
  });
  if (!u) throw new ApiError(404, 'User not found');

  const prev = Array.isArray(u.assets) ? u.assets : [];
  const ownedIds = await prisma.asset.findMany({ where: { asset_id: { in: prev } } });
  const already = ownedIds.some(a => a.id === assetId);
  if (already) return { ok: true, message: 'Already unlocked' };

  await prisma.user.update({
    where: { user_id },
    data: { assets: { push: asset.asset_id } },
  });

  return { ok: true };
}
