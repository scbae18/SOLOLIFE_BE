// src/services/appearance.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

const SUPPORTED_TYPES = ['TYPE1', 'TYPE2', 'TYPE3'];
const DEFAULT_ASSETS = { TYPE1: 1, TYPE2: 2, TYPE3: 3 };

function sanitizeAssetsPayload(assets) {
  const out = {};
  for (const t of SUPPORTED_TYPES) {
    if (assets.hasOwnProperty(t)) {
      const v = assets[t];
      if (v === null) {
        out[t] = null;
      } else {
        const n = Number(v);
        if (!Number.isInteger(n)) throw new ApiError(400, `assets.${t} must be an integer or null`);
        out[t] = n;
      }
    }
  }
  return out;
}

export async function getMyAppearance(user_id) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const me = await prisma.user.findUnique({
    where: { user_id },
    select: {
      user_id: true,
      current_character_id: true,
      current_assets: true
    }
  });
  if (!me) throw new ApiError(404, 'User not found');

  const map = { ...DEFAULT_ASSETS, ...(me.current_assets ?? {}) };
  return {
    user_id: me.user_id,
    current_character_id: me.current_character_id,
    current_assets: map
  };
}

export async function updateMyAppearance(user_id, payload = {}) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const { character_id, assets } = payload;

  const me = await prisma.user.findUnique({
    where: { user_id },
    select: {
      user_id: true,
      assets: true,
      current_assets: true,
      current_character_id: true
    }
  });
  if (!me) throw new ApiError(404, 'User not found');

  const patch = {};

  // ✅ 캐릭터 변경
  if (character_id !== undefined) {
    if (character_id === null) {
      patch.current_character_id = null;
    } else {
      const cid = Number(character_id);
      if (!Number.isInteger(cid)) throw new ApiError(400, 'character_id must be an integer');

      const owned = await prisma.userCharacter.findUnique({
        where: { user_id_character_id: { user_id, character_id: cid } },
        select: { user_id: true }
      });
      if (!owned) throw new ApiError(403, 'You do not own this character');

      patch.current_character_id = cid;
    }
  }

  // ✅ 에셋 타입별 변경
  if (assets !== undefined) {
    if (assets === null) {
      patch.current_assets = DEFAULT_ASSETS;
    } else if (typeof assets === 'object') {
      const inMap = sanitizeAssetsPayload(assets);
      const nextMap = { ...DEFAULT_ASSETS, ...(me.current_assets ?? {}) };

      const idsToCheck = Object.values(inMap).filter(Number.isInteger);
      const ownedSet = new Set(me.assets || []);

      // DB에서 타입 확인
      const assetsInDb = await prisma.asset.findMany({
        where: { asset_id: { in: idsToCheck } },
        select: { asset_id: true, type: true }
      });
      const typeMap = Object.fromEntries(assetsInDb.map(a => [a.asset_id, a.type]));

      for (const type of SUPPORTED_TYPES) {
        if (!inMap.hasOwnProperty(type)) continue;

        const asset_id = inMap[type];
        if (asset_id === null) {
          nextMap[type] = DEFAULT_ASSETS[type]; // 해제 → 기본값 복원
        } else {
          if (!ownedSet.has(asset_id)) throw new ApiError(403, `You do not own asset ${asset_id}`);
          if (typeMap[asset_id] !== type) {
            throw new ApiError(400, `Asset ${asset_id} is type ${typeMap[asset_id]}, not ${type}`);
          }
          nextMap[type] = asset_id;
        }
      }
      patch.current_assets = nextMap;
    } else {
      throw new ApiError(400, 'assets must be an object');
    }
  }

  if (Object.keys(patch).length === 0) {
    return getMyAppearance(user_id);
  }

  const updated = await prisma.user.update({
    where: { user_id },
    data: patch,
    select: { user_id: true, current_character_id: true, current_assets: true }
  });

  return {
    ...updated,
    current_assets: { ...DEFAULT_ASSETS, ...(updated.current_assets ?? {}) }
  };
}
