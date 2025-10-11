// src/services/characters.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export function listCharacters() {
  // Character: id(string), theme, gender
  return prisma.character.findMany({
    orderBy: { id: 'asc' },
  });
}

export async function unlockCharacter(user_id, character_id) {
  // character_id now string; Character PK is `id`
  const ch = await prisma.character.findUnique({ where: { id: character_id } });
  if (!ch) throw new ApiError(404, 'Character not found');

  // 레벨/해금 조건이 스키마에 없으므로 단순 해금 처리
  try {
    await prisma.userCharacter.create({
      data: { user_id, character_id }, // user_id:int, character_id:string
    });
  } catch (e) {
    // Unique constraint (already unlocked) → P2002
    if (e.code === 'P2002') {
      return { ok: true, message: 'Already unlocked' };
    }
    throw e;
  }
  return { ok: true };
}

export function listMyCharacters(user_id) {
  return prisma.userCharacter.findMany({
    where: { user_id },
    include: { character: true }, // join Character
    orderBy: { character_id: 'asc' }, // string 정렬
  });
}
