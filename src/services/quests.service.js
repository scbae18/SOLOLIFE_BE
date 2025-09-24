// src/services/quests.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { addPoints } from './users.points.service.js'; // 🔥 포인트 지급

export function listMyQuests(user_id, filters = {}) {
  const where = { user_id };
  if (filters.is_main_quest !== undefined) where.is_main_quest = filters.is_main_quest;
  if (filters.is_completed !== undefined) where.is_completed = filters.is_completed;
  return prisma.quest.findMany({
    where,
    orderBy: { quest_id: 'desc' }
  });
}

// 관리자/운영용
export function createQuest(data) {
  return prisma.quest.create({ data });
}

export async function completeQuest(user_id, quest_id) {
  // 퀘스트 존재/소유 확인
  const q = await prisma.quest.findUnique({ where: { quest_id } });
  if (!q || q.user_id !== user_id) throw new ApiError(404, 'Quest not found');
  if (q.is_completed) return { ok: true, message: 'Already completed' };

  return prisma.$transaction(async (tx) => {
    // 1) 퀘스트 완료 처리
    await tx.quest.update({
      where: { quest_id },
      data: { is_completed: true }
    });

    // 2) EXP 지급 → 레벨업 반영(기존 로직 유지)
    const u = await tx.user.update({
      where: { user_id },
      data: { experience_points: { increment: q.reward_exp } },
      select: { user_id: true, explorer_level: true, experience_points: true }
    });

    let { explorer_level, experience_points } = u;
    const levelExp = (lv) => 100 * lv; // 필요 시 난이도 커브 조정
    while (experience_points >= levelExp(explorer_level)) {
      experience_points -= levelExp(explorer_level);
      explorer_level += 1;
    }
    await tx.user.update({
      where: { user_id },
      data: { explorer_level, experience_points }
    });

    // 3) 🔥 포인트 지급 (reward_points가 양수일 때만)
    let pointResult = {};
    if (q.reward_points && q.reward_points > 0) {
      pointResult = await addPoints(tx, user_id, q.reward_points); // { points, title }
    }

    // 클라이언트가 바로 반영할 수 있도록 합산 응답
    return {
      ok: true,
      explorer_level,
      experience_points,
      ...pointResult,              // { points, title } 또는 빈 객체
      reward_exp: q.reward_exp,    // 참고용
      reward_points: q.reward_points || 0
    };
  });
}
