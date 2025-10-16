// src/services/onboarding.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

const VALID_CHAR_TYPES = new Set(['base_f', 'base_m']);

export async function saveOnboardingAnswers(user_id, payload) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const { nickname, characterType, interests } = payload ?? {};

  // (2) characterType은 'base_f' | 'base_m' 둘 중 하나만 허용
  if (!VALID_CHAR_TYPES.has(characterType)) {
    throw new ApiError(400, "characterType must be 'base_f' or 'base_m'");
  }
  const chosenCharacterId = characterType; // 그대로 사용

  const answers = {
    nickname: nickname ?? null,
    characterType: chosenCharacterId,
    interests: Array.isArray(interests) ? interests : [],
  };

  // 1) 의존성 없는 upsert는 짧게 배치 트랜잭션으로
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
    // 선택한 캐릭터만 최소 보유 보장(원하면 base_f/base_m 둘 다 보유 보장해도 됨)
    prisma.userCharacter.upsert({
      where: { user_id_character_id: { user_id, character_id: chosenCharacterId } },
      create: { user_id, character_id: chosenCharacterId },
      update: {},
    }),
  ]);

  // 2) asset_id 조회
  const [tent, tree] = await Promise.all([
    prisma.asset.findUnique({ where: { id: 'tent' }, select: { asset_id: true } }),
    prisma.asset.findUnique({ where: { id: 'tree' }, select: { asset_id: true } }),
  ]);

  // 3) 기존 User 상태 조회
  const existing = await prisma.user.findUnique({
    where: { user_id },
    select: { assets: true, current_assets: true },
  });

  // 4) 자산 보유(assets)는 중복 없이 유지(권장)
  const prevAssets = Array.isArray(existing?.assets) ? existing.assets : [];
  const nextAssetsSet = new Set(prevAssets);
  if (tent?.asset_id != null) nextAssetsSet.add(tent.asset_id);
  if (tree?.asset_id != null) nextAssetsSet.add(tree.asset_id);
  const nextAssets = Array.from(nextAssetsSet);

  // (3) 장착(current_assets)은 요청대로 bg23에 ["tree","tree"] 중복 포함
  const nextCurrent = {
    'bg1-only': 'tent',
    'bg23': ['tree', 'tree'],
  };

  // 5) 최종 업데이트
  const patch = {
    onboarding_answers: answers,
    current_character_id: chosenCharacterId,
    assets: nextAssets,
    current_assets: nextCurrent,
    // (1) username은 건드리지 않고 nickname만 설정
    nickname: nickname?.trim() || null,
  };

  const updated = await prisma.user.update({
    where: { user_id },
    data: patch,
    select: {
      user_id: true,
      nickname: true,
      username: true,              // 비교용으로 리턴은 해 둠(수정 X)
      onboarding_answers: true,
      current_character_id: true,
      assets: true,
      current_assets: true,
    },
  });

  return { ok: true, user: updated };
}
