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
  const { is_public_profile } = payload;
  const u = await prisma.user.update({
    where: { user_id },
    data: { is_public_profile }
  });
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
