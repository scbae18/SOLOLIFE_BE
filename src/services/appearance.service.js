// src/services/appearance.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

const DEFAULT_ASSETS = { 'bg1-only': null, bg23: [] };

export async function getMyAppearance(user_id) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const me = await prisma.user.findUnique({
    where: { user_id },
    select: { user_id: true, current_character_id: true, current_assets: true },
  });
  if (!me) throw new ApiError(404, 'User not found');

  const merged = { ...DEFAULT_ASSETS, ...(me.current_assets ?? {}) };
  return {
    user_id: me.user_id,
    current_character_id: me.current_character_id,
    current_assets: merged,
  };
}

export async function updateMyAppearance(user_id, payload = {}) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');
  const { character_id, assets } = payload;

  const me = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true, current_assets: true },
  });
  if (!me) throw new ApiError(404, 'User not found');

  const patch = {};

  // ✅ 캐릭터 변경
  if (character_id !== undefined) {
    if (character_id === null) patch.current_character_id = null;
    else if (typeof character_id === 'string') {
      const owned = await prisma.userCharacter.findUnique({
        where: { user_id_character_id: { user_id, character_id } },
      });
      if (!owned) throw new ApiError(403, 'You do not own this character');
      patch.current_character_id = character_id;
    } else throw new ApiError(400, 'character_id must be string or null');
  }

  // ✅ 에셋 변경
  if (assets !== undefined) {
    const current = { ...DEFAULT_ASSETS, ...(me.current_assets ?? {}) };

    if (assets === null) patch.current_assets = DEFAULT_ASSETS;
    else if (typeof assets === 'object') {
      if (assets['bg1-only'] !== undefined) {
        if (assets['bg1-only'] === null) current['bg1-only'] = null;
        else if (typeof assets['bg1-only'] === 'string') current['bg1-only'] = assets['bg1-only'];
        else throw new ApiError(400, 'bg1-only must be string or null');
      }
      if (assets['bg23'] !== undefined) {
        if (!Array.isArray(assets['bg23']))
          throw new ApiError(400, 'bg23 must be array');
        if (assets['bg23'].length > 2)
          throw new ApiError(400, 'bg23 can have up to 2 items');
        current['bg23'] = assets['bg23'].map(String);
      }
      patch.current_assets = current;
    } else throw new ApiError(400, 'assets must be object or null');
  }

  const updated = await prisma.user.update({
    where: { user_id },
    data: patch,
    select: { user_id: true, current_character_id: true, current_assets: true },
  });

  return {
    ...updated,
    current_assets: { ...DEFAULT_ASSETS, ...(updated.current_assets ?? {}) },
  };
}
