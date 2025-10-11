// src/services/gacha.service.js
import { prisma } from '../lib/prisma.js';
import { spendPoints, addPoints } from './users.points.service.js';

// 비용 고정 (요구사항)
const COST_CHARACTER = 100;
const COST_ASSET = 50;

// 보너스 포인트 범위
const BONUS_MIN_CHARACTER = 50;
const BONUS_MAX_CHARACTER = 120;
const BONUS_MIN_ASSET = 20;
const BONUS_MAX_ASSET = 80;

function randInt(lo, hi) {
  const L = Math.max(1, Math.min(lo, hi));
  const H = Math.max(L, Math.max(lo, hi));
  return L + Math.floor(Math.random() * (H - L + 1));
}

// 50% 확률로 true
function fiftyFifty() {
  return Math.random() < 0.5;
}

/**
 * 캐릭터 가챠 (100p 차감)
 * - 50% 확률: 포인트 보상
 * - 50% 확률: 미보유 캐릭터 1개 지급
 * - 후보가 없으면(전부 보유) → 포인트 보상
 */
export async function rollCharacterGacha(user_id) {
  return prisma.$transaction(async (tx) => {
    // 유저 확인
    const u = await tx.user.findUnique({
      where: { user_id },
      select: { user_id: true }
    });
    if (!u) {
      const e = new Error('User not found');
      e.status = 404;
      throw e;
    }

    // 포인트 차감
    const afterSpend = await spendPoints(tx, user_id, COST_CHARACTER);

    // 50% 확률로 즉시 보너스 포인트
    if (fiftyFifty()) {
      const bonus = randInt(BONUS_MIN_CHARACTER, BONUS_MAX_CHARACTER);
      const afterBonus = await addPoints(tx, user_id, bonus);
      return {
        ok: true,
        type: 'bonus',
        spent: COST_CHARACTER,
        bonus,
        points: afterBonus.points,
        title: afterBonus.title,
        message: '포인트 보상이 지급되었습니다.'
      };
    }

    // 나머지 50%: 캐릭터 지급 시도 (이미 가진 건 제외)
    const [all, mine] = await Promise.all([
      tx.character.findMany({ select: { id: true } }),
      tx.userCharacter.findMany({
        where: { user_id },
        select: { character_id: true }
      })
    ]);

    const owned = new Set(mine.map(m => m.character_id));
    const candidates = all.map(c => c.id).filter(id => !owned.has(id));

    // 후보 없음 → 보너스 포인트
    if (!candidates.length) {
      const bonus = randInt(BONUS_MIN_CHARACTER, BONUS_MAX_CHARACTER);
      const afterBonus = await addPoints(tx, user_id, bonus);
      return {
        ok: true,
        type: 'bonus',
        spent: COST_CHARACTER,
        bonus,
        points: afterBonus.points,
        title: afterBonus.title,
        message: '모든 캐릭터를 보유 중이어서 포인트 보상이 지급되었습니다.'
      };
    }

    // 하나 랜덤 지급
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    await tx.userCharacter.create({
      data: { user_id, character_id: choice }
    });

    return {
      ok: true,
      type: 'character',
      spent: COST_CHARACTER,
      character_id: choice,   // 문자열 PK
      points: afterSpend.points,
      title: afterSpend.title
    };
  });
}

/**
 * 에셋 가챠 (50p 차감)
 * - 50% 확률: 포인트 보상
 * - 50% 확률: 미보유 에셋 1개 지급 (User.assets(Int[])에 asset_id 추가)
 * - 후보가 없으면 → 포인트 보상
 */
export async function rollAssetGacha(user_id) {
  return prisma.$transaction(async (tx) => {
    // 유저 조회 (assets 포함)
    const u = await tx.user.findUnique({
      where: { user_id },
      select: { user_id: true, assets: true }
    });
    if (!u) {
      const e = new Error('User not found');
      e.status = 404;
      throw e;
    }

    // 포인트 차감
    const afterSpend = await spendPoints(tx, user_id, COST_ASSET);

    // 50% 확률로 즉시 보너스 포인트
    if (fiftyFifty()) {
      const bonus = randInt(BONUS_MIN_ASSET, BONUS_MAX_ASSET);
      const afterBonus = await addPoints(tx, user_id, bonus);
      return {
        ok: true,
        type: 'bonus',
        spent: COST_ASSET,
        bonus,
        points: afterBonus.points,
        title: afterBonus.title,
        message: '포인트 보상이 지급되었습니다.'
      };
    }

    // 나머지 50%: 에셋 지급 시도 (이미 가진 건 제외)
    const allAssets = await tx.asset.findMany({
      select: { asset_id: true, id: true, label: true, group: true }
    });
    const mine = new Set(Array.isArray(u.assets) ? u.assets : []);
    const candidates = allAssets.filter(a => !mine.has(a.asset_id));

    // 후보 없음 → 보너스 포인트
    if (!candidates.length) {
      const bonus = randInt(BONUS_MIN_ASSET, BONUS_MAX_ASSET);
      const afterBonus = await addPoints(tx, user_id, bonus);
      return {
        ok: true,
        type: 'bonus',
        spent: COST_ASSET,
        bonus,
        points: afterBonus.points,
        title: afterBonus.title,
        message: '모든 에셋을 보유 중이어서 포인트 보상이 지급되었습니다.'
      };
    }

    // 하나 랜덤 지급 (asset_id를 User.assets에 추가)
    const choice = candidates[Math.floor(Math.random() * candidates.length)];
    const nextAssets = [...mine, choice.asset_id];

    await tx.user.update({
      where: { user_id },
      data: { assets: nextAssets }
    });

    return {
      ok: true,
      type: 'asset',
      spent: COST_ASSET,
      asset: {
        asset_id: choice.asset_id, // Int (User.assets에 저장되는 값)
        id:       choice.id,       // String ("tent" 등)
        label:    choice.label,
        group:    choice.group     // "bg1-only" | "bg23"
      },
      assets: Array.from(nextAssets), // 보유 asset_id 목록
      points: afterSpend.points,
      title: afterSpend.title
    };
  });
}
