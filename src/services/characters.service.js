import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export function listCharacters() {
  return prisma.character.findMany({
    orderBy: { character_id: 'asc' }
  });
}

export async function unlockCharacter(user_id, character_id) {
  const ch = await prisma.character.findUnique({ where: { character_id } });
  if (!ch) throw new ApiError(404, 'Character not found');

  const user = await prisma.user.findUnique({ where: { user_id } });
  if (user.explorer_level < ch.unlock_level) {
    throw new ApiError(400, `Requires level ${ch.unlock_level}`);
  }

  try {
    await prisma.userCharacter.create({
      data: { user_id, character_id }
    });
  } catch (e) {
    if (e.code === 'P2002') return { ok: true, message: 'Already unlocked' };
    throw e;
  }
  return { ok: true };
}

export function listMyCharacters(user_id) {
  return prisma.userCharacter.findMany({
    where: { user_id },
    include: { character: true },
    orderBy: { unlocked_at: 'desc' }
  });
}
