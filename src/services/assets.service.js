// src/services/assets.service.js (옵션)
import { prisma } from '../lib/prisma.js';

export function createAsset(data) {
  // 간단 검증(필요시 강화)
  if (!Number.isInteger(data.asset_id)) throw Object.assign(new Error('asset_id required(int)'), { status: 400 });
  if (!data.name) throw Object.assign(new Error('name required'), { status: 400 });
  if (!data.type) throw Object.assign(new Error('type required'), { status: 400 });
  return prisma.asset.create({ data });
}
