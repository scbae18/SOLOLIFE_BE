// src/services/assets.service.js (옵션)
import { ApiError } from '../lib/ApiError.js';
import { prisma } from '../lib/prisma.js';

export function createAsset(data) {
  // 간단 검증(필요시 강화)
  if (!Number.isInteger(data.asset_id)) throw Object.assign(new Error('asset_id required(int)'), { status: 400 });
  if (!data.name) throw Object.assign(new Error('name required'), { status: 400 });
  if (!data.type) throw Object.assign(new Error('type required'), { status: 400 });
  return prisma.asset.create({ data });
}

/** 전체 에셋 목록 */
export function listAssets() {
  return prisma.asset.findMany({
    orderBy: { asset_id: 'asc' },
    select: { asset_id: true, name: true, image_url: true },
  });
}

/** 내 에셋 목록 (User.assets 배열 기반) */
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
    orderBy: { asset_id: 'asc' },
    select: { asset_id: true, name: true, image_url: true },
  });
}

/** 에셋 해금 (User.assets 배열에 asset_id 추가) */
export async function unlockAsset(user_id, asset_id) {
  const id = Number(asset_id);
  if (!Number.isInteger(id)) throw new ApiError(400, 'Invalid asset_id');

  const asset = await prisma.asset.findUnique({ where: { asset_id: id } });
  if (!asset) throw new ApiError(404, 'Asset not found');

  const u = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true },
  });
  if (!u) throw new ApiError(404, 'User not found');

  const prev = Array.isArray(u.assets) ? u.assets.map(Number) : [];
  if (prev.includes(id)) return { ok: true, message: 'Already unlocked' };

  const next = Array.from(new Set([...prev, id]));
  await prisma.user.update({
    where: { user_id },
    data: { assets: { set: next } }, // Int[] 전체 치환
  });

  return { ok: true };
}

/**
 * (선택) 최대 3개 장착 같은 로직을 원하면:
 * export async function equipAssets(user_id, assetIds = []) {
 *   const ids = Array.from(new Set(assetIds.map(Number))).filter(Number.isInteger);
 *   if (ids.length > 3) throw new ApiError(400, 'You can equip up to 3 assets');
 *   const u = await prisma.user.findUnique({ where: { user_id }, select: { assets: true } });
 *   if (!u) throw new ApiError(404, 'User not found');
 *   const owned = new Set((u.assets ?? []).map(Number));
 *   if (!ids.every(id => owned.has(id))) throw new ApiError(400, 'Contains non-owned asset');
 *   // 장착 상태를 별도 컬럼으로 관리하지 않는다면, 서비스 레벨 검증만 하고
 *   // 실제 "장착" 표현은 프론트에서 상위 3개만 노출하는 식으로도 가능.
 *   return { ok: true };
 * }
 */
