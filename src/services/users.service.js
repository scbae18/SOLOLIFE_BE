import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export async function getPublicProfile(user_id) {
  const u = await prisma.user.findUnique({
    where: { user_id },
    select: {
      user_id: true, username: true, created_at: true,
      is_public_profile: true, current_character_id: true
    }
  });
  if (!u) throw new ApiError(404, 'User not found');
  if (!u.is_public_profile) throw new ApiError(403, 'Private profile');
  return u;
}

export async function updateMe(user_id, payload) {
  const patch = {};
  if (typeof payload?.is_public_profile === 'boolean') {
    patch.is_public_profile = payload.is_public_profile;
  }

  // 현재 캐릭터 변경
  if (payload?.current_character_id != null) {
    const character_id = Number(payload.current_character_id);
    if (!Number.isInteger(character_id)) throw new ApiError(400, 'Invalid character_id');

    const owned = await prisma.userCharacter.findUnique({
      where: { user_id_character_id: { user_id, character_id } }
    });
    if (!owned) throw new ApiError(400, 'Character not unlocked');
    patch.current_character_id = character_id;
  }

  // 에셋 셀렉션 변경 (보유: 배열 자체가 보유 목록. 최대 3개만 허용)
  if (payload?.assets) {
    const arr = Array.isArray(payload.assets) ? payload.assets.map(Number) : [];
    if (!arr.every(Number.isInteger)) throw new ApiError(400, 'assets must be int[]');
    if (arr.length > 3) throw new ApiError(400, 'assets can have up to 3 items');
    patch.assets = arr;
  }

  // title은 자동 갱신이므로 수동 변경 금지
  if ('title' in (payload ?? {})) {
    // 무시하거나, 에러로 막고 싶으면 아래 줄 활성화
    // throw new ApiError(400, 'title is managed automatically by points');
  }

  if (Object.keys(patch).length === 0) return { ok: true };
  await prisma.user.update({ where: { user_id }, data: patch });
  return { ok: true };
}

export async function switchCurrentCharacter(user_id, character_id) {
  // ownership check: unlocked?
  const uc = await prisma.userCharacter.findUnique({
    where: { user_id_character_id: { user_id, character_id } }
  });
  if (!uc) throw new ApiError(400, 'Character not unlocked');

  await prisma.user.update({
    where: { user_id },
    data: { current_character_id: character_id }
  });
  return { ok: true };
}
