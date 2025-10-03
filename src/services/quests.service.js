// src/services/quests.service.js
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';
import { addPoints } from './users.points.service.js';

/**
 * 내 퀘스트 목록 조회
 * @param {number} user_id
 * @param {{ is_main_quest?: boolean, is_completed?: boolean }} filters
 */
export function listMyQuests(user_id, filters = {}) {
  const where = { user_id };
  if (filters.is_main_quest !== undefined) where.is_main_quest = filters.is_main_quest;
  if (filters.is_completed !== undefined) where.is_completed = filters.is_completed;

  return prisma.quest.findMany({
    where,
    orderBy: { quest_id: 'desc' },
  });
}

/**
 * (운영용) 퀘스트 생성
 * @param {object} data - Prisma Quest create data
 */
export function createQuest(data) {
  return prisma.quest.create({ data });
}

/**
 * 퀘스트 완료: 포인트만 지급 (EXP/레벨 미사용)
 * - idempotent: 이미 완료된 경우 재지급하지 않음
 * - reward_points가 없거나 0 이하면 포인트 지급 생략
 *
 * @param {number} user_id
 * @param {number} quest_id
 * @returns {Promise<{ok: true, quest_id: number, is_completed: boolean, reward_points: number, points?: number, title?: string, message?: string}>}
 */
export async function completeQuest(user_id, quest_id) {
  // 0) 퀘스트 존재/소유 확인
  const q = await prisma.quest.findUnique({ where: { quest_id } });
  if (!q || q.user_id !== user_id) {
    throw new ApiError(404, 'Quest not found');
  }
  if (q.is_completed) {
    return {
      ok: true,
      quest_id,
      is_completed: true,
      reward_points: Number(q.reward_points) || 0,
      message: 'Already completed',
    };
  }

  // 1) 트랜잭션
  return prisma.$transaction(async (tx) => {
    // 1-1) 완료 처리 (원하면 completed_at 필드가 있을 때만 업데이트됨)
    await tx.quest.update({
      where: { quest_id },
      data: {
        is_completed: true,
        // completed_at: new Date(), // 스키마에 있으면 주석 해제
      },
    });

    // 1-2) 포인트 지급
    const rewardPoints = Number(q.reward_points) || 0;
    let pointResult = {};
    if (rewardPoints > 0) {
      // addPoints(tx, user_id, amount) => { points, title, total_points_earned? }
      pointResult = await addPoints(tx, user_id, rewardPoints);
    }

    // 1-3) 응답
    return {
      ok: true,
      quest_id,
      is_completed: true,
      reward_points: rewardPoints,
      ...pointResult, // { points, title, ... }
    };
  });
}
