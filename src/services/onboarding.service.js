// src/services/onboarding.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export async function saveOnboardingAnswers(user_id, payload) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const { nickname, characterType, interests } = payload ?? {};
  const answers = {
    nickname: nickname ?? null,
    characterType: characterType ?? null,
    interests: Array.isArray(interests) ? interests : [],
  };
  const chosenCharacterId =
    (characterType || '').toUpperCase() === 'B' ? 'base_m' : 'base_f';

  // 1) 캐릭터/에셋 존재 보장: 의존성 없는 upsert는 배치 트랜잭션(배열)로 짧게 처리
  await prisma.$transaction([
    prisma.character.upsert({
      where: { id: 'base_f' },
      create: { id: 'base_f', theme: 'base', gender: 'f' },
      update: {},
    }),
    prisma.character.upsert({
      where: { id: 'base_m' },
      create: { id: 'base_m', theme: 'base', gender: 'm' },
      update: {},
    }),
    prisma.asset.upsert({
      where: { id: 'tent' },
      create: { id: 'tent', label: '텐트', group: 'bg1-only' },
      update: {},
    }),
    prisma.asset.upsert({
      where: { id: 'tree' },
      create: { id: 'tree', label: '나무', group: 'bg23' },
      update: {},
    }),
    prisma.userCharacter.upsert({
      where: { user_id_character_id: { user_id, character_id: 'base_f' } },
      create: { user_id, character_id: 'base_f' },
      update: {},
    }),
    prisma.userCharacter.upsert({
      where: { user_id_character_id: { user_id, character_id: 'base_m' } },
      create: { user_id, character_id: 'base_m' },
      update: {},
    }),
  ]);

  // 2) tent/tree 키로 asset_id 조회(의존값 필요하므로 단건 쿼리)
  const [tent, tree] = await Promise.all([
    prisma.asset.findUnique({ where: { id: 'tent' }, select: { asset_id: true } }),
    prisma.asset.findUnique({ where: { id: 'tree' }, select: { asset_id: true } }),
  ]);

  // 3) 기존 User 상태 조회
  const existing = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true, current_assets: true },
  });

  // 4) 자산/장착 병합
  const prevAssets = Array.isArray(existing?.assets) ? existing.assets : [];
  const nextAssetsSet = new Set(prevAssets);
  if (tent) nextAssetsSet.add(tent.asset_id);
  if (tree) nextAssetsSet.add(tree.asset_id);
  const nextAssets = Array.from(nextAssetsSet);

  const prevCurrent = existing?.current_assets ?? { 'bg1-only': null, bg23: [] };
  const nextCurrent = {
    'bg1-only': 'tent',
    'bg23': Array.isArray(prevCurrent?.bg23) ? [...new Set([...prevCurrent.bg23, 'tree'])] : ['tree'],
  };

  // 5) 최종 User 업데이트(단일 쿼리)
  const patch = {
    onboarding_answers: answers,
    current_character_id: chosenCharacterId,
    assets: nextAssets,
    current_assets: nextCurrent,
    ...(nickname && nickname.trim() ? { username: nickname.trim() } : {}),
  };

  const updated = await prisma.user.update({
    where: { user_id },
    data: patch,
    select: {
      user_id: true,
      username: true,
      onboarding_answers: true,
      current_character_id: true,
      assets: true,
      current_assets: true,
    },
  });

  return { ok: true, user: updated };
}
