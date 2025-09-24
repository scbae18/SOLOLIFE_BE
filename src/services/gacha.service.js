// src/services/gacha.service.js
import { prisma } from '../lib/prisma.js';
import { spendPoints, addPoints } from './users.points.service.js';

// ---- 서버 정책/상수 ----
const DEFAULT_COST = Number(process.env.GACHA_COST ?? 50);
const MAX_ASSETS = 3;
// 쉼표 구분 환경변수 지원: GACHA_ASSET_POOL="101,102,103"
const ENV_POOL = (process.env.GACHA_ASSET_POOL || '')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(Number.isInteger);
const ASSET_POOL = ENV_POOL.length ? ENV_POOL : [101,102,103,104,105,201,202,203];

// 타입 가중치도 ENV로 오버라이드 가능: GACHA_WEIGHTS="character:0.4,asset:0.4,bonus:0.2"
function loadWeights() {
  const raw = (process.env.GACHA_WEIGHTS || '').trim();
  if (!raw) return { character: 0.4, asset: 0.4, bonus: 0.2 };
  const map = { character: 0.4, asset: 0.4, bonus: 0.2 };
  for (const kv of raw.split(',')) {
    const [k, v] = kv.split(':').map(s => s.trim());
    const w = Number(v);
    if (['character','asset','bonus'].includes(k) && Number.isFinite(w) && w >= 0) {
      map[k] = w;
    }
  }
  return map;
}

function pickWeighted(entries) {
  const sum = entries.reduce((a,b) => a + b.w, 0);
  // 모두 0이면 fallback
  if (sum <= 0) return entries[0].t;
  let r = Math.random() * sum;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.t; }
  return entries.at(-1).t;
}

function sanitizeCost(cost) {
  const n = Number(cost);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return DEFAULT_COST;
  return n;
}

export async function rollGacha(user_id, { cost } = {}) {
  const weights = loadWeights();
  const validCost = sanitizeCost(cost);

  return prisma.$transaction(async (tx) => {
    // 유저 존재 확인 (명시적)
    const exists = await tx.user.findUnique({ where: { user_id }, select: { user_id: true } });
    if (!exists) {
      // 통일된 에러 포맷을 쓰고 있다면 ApiError로 바꿔도 됨
      const e = new Error('User not found');
      e.status = 404;
      throw e;
    }

    // 1) 포인트 차감
    const afterSpend = await spendPoints(tx, user_id, validCost);

    // 2) 결과 타입 결정
    const resultType = pickWeighted([
      { t: 'character', w: weights.character },
      { t: 'asset',     w: weights.asset },
      { t: 'bonus',     w: weights.bonus },
    ]);

    if (resultType === 'character') {
      // 전체 캐릭터와 보유 목록 조회
      const [all, mine] = await Promise.all([
        tx.character.findMany({ select: { character_id: true } }),
        tx.userCharacter.findMany({ where: { user_id }, select: { character_id: true } })
      ]);
      const owned = new Set(mine.map(m => m.character_id));
      const candidates = all.map(a => a.character_id).filter(id => !owned.has(id));

      if (!candidates.length) {
        // 후보 없으면 보너스 포인트로 대체
        const bonus = 50;
        const afterBonus = await addPoints(tx, user_id, bonus);
        return {
          ok: true,
          spent: validCost,
          type: 'bonus',
          bonus,
          points: afterBonus.points,
          title: afterBonus.title,
        };
      }

      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      await tx.userCharacter.create({ data: { user_id, character_id: choice } });

      return {
        ok: true,
        spent: validCost,
        type: 'character',
        character_id: choice,
        points: afterSpend.points,
        title: afterSpend.title,
      };
    }

    if (resultType === 'asset') {
      // 자산 id 풀
      const u = await tx.user.findUnique({ where: { user_id }, select: { assets: true } });
      const mine = Array.isArray(u.assets) ? u.assets : [];

      // 미보유 우선
      const unowned = ASSET_POOL.filter(id => !mine.includes(id));
      const pool = unowned.length ? unowned : ASSET_POOL;
      const choice = pool[Math.floor(Math.random() * pool.length)];

      let nextAssets = mine.slice();
      if (nextAssets.length < MAX_ASSETS) {
        nextAssets.push(choice);
      } else {
        // 가득 찼으면 랜덤 교체
        const idx = Math.floor(Math.random() * MAX_ASSETS);
        nextAssets[idx] = choice;
      }

      await tx.user.update({ where: { user_id }, data: { assets: nextAssets } });

      return {
        ok: true,
        spent: validCost,
        type: 'asset',
        asset_id: choice,
        assets: nextAssets,
        points: afterSpend.points,
        title: afterSpend.title,
      };
    }

    // 보너스 포인트
    const min = Number(process.env.GACHA_BONUS_MIN ?? 20);
    const max = Number(process.env.GACHA_BONUS_MAX ?? 80);
    const lo = Math.max(1, Math.min(min, max));
    const hi = Math.max(lo, Math.max(min, max));
    const bonus = lo + Math.floor(Math.random() * (hi - lo + 1)); // [lo, hi]
    const afterBonus = await addPoints(tx, user_id, bonus);

    return {
      ok: true,
      spent: validCost,
      type: 'bonus',
      bonus,
      points: afterBonus.points,
      title: afterBonus.title,
    };
  });
}
