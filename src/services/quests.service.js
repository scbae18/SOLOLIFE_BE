import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export function listMyQuests(user_id, filters={}) {
  const where = { user_id };
  if (filters.is_main_quest !== undefined) where.is_main_quest = filters.is_main_quest;
  if (filters.is_completed !== undefined) where.is_completed = filters.is_completed;
  return prisma.quest.findMany({ where, orderBy: { quest_id: 'desc' } });
}

// 관리자/운영용
export function createQuest(data){ return prisma.quest.create({ data }); }

export async function completeQuest(user_id, quest_id) {
  const q = await prisma.quest.findUnique({ where: { quest_id } });
  if (!q || q.user_id !== user_id) throw new ApiError(404, 'Quest not found');
  if (q.is_completed) return { ok: true, message: 'Already completed' };

  return prisma.$transaction(async (tx) => {
    await tx.quest.update({
      where: { quest_id },
      data: { is_completed: true }
    });

    const u = await tx.user.update({
      where: { user_id },
      data: { experience_points: { increment: q.reward_exp } },
      select: { user_id: true, explorer_level: true, experience_points: true }
    });

    // 레벨업 루프 (필요시 다단계 레벨업)
    let { explorer_level, experience_points } = u;
    const levelExp = (lv) => 100 * lv;

    while (experience_points >= levelExp(explorer_level)) {
      experience_points -= levelExp(explorer_level);
      explorer_level += 1;
    }

    // 변화가 있으면 반영
    await tx.user.update({
      where: { user_id },
      data: { explorer_level, experience_points }
    });

    return { ok: true, explorer_level, experience_points };
  });
}
