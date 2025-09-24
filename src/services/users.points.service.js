// src/services/users.points.service.js
import { prisma } from '../lib/prisma.js';
import { titleByPoints } from '../utils/title.js';

export async function addPoints(tx, user_id, delta) {
  const u = await tx.user.update({
    where: { user_id },
    data: {
      points: { increment: Number(delta) },
      total_points_earned: { increment: Number(delta) }, // 🔥 누적도 증가
    },
    select: { points: true, total_points_earned: true }
  });
  const nextTitle = titleByPoints(u.total_points_earned); // 🔥 칭호는 누적 기준
  await tx.user.update({ where: { user_id }, data: { title: nextTitle } });
  return { points: u.points, title: nextTitle };
}

export async function spendPoints(tx, user_id, amount) {
  const cur = await tx.user.findUnique({ where: { user_id }, select: { points: true, total_points_earned: true } });
  if ((cur?.points ?? 0) < amount) {
    const e = new Error('Not enough points'); e.status = 400; throw e;
  }
  const u = await tx.user.update({
    where: { user_id },
    data: { points: { decrement: Number(amount) } },
    select: { points: true, total_points_earned: true }
  });
  // 🔥 칭호는 "누적" 기준이므로 소비해도 변하지 않음
  const nextTitle = titleByPoints(u.total_points_earned);
  await tx.user.update({ where: { user_id }, data: { title: nextTitle } });
  return { points: u.points, title: nextTitle };
}
