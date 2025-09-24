// src/services/users.points.service.js
import { prisma } from '../lib/prisma.js';
import { titleByPoints } from '../utils/title.js';

export async function addPoints(tx, user_id, delta) {
  const u = await tx.user.update({
    where: { user_id },
    data: { points: { increment: Number(delta) } },
    select: { points: true }
  });
  const nextTitle = titleByPoints(u.points);
  await tx.user.update({
    where: { user_id },
    data: { title: nextTitle }
  });
  return { points: u.points, title: nextTitle };
}

export async function spendPoints(tx, user_id, amount) {
  const cur = await tx.user.findUnique({ where: { user_id }, select: { points: true } });
  if ((cur?.points ?? 0) < amount) throw new Error('Not enough points');
  const u = await tx.user.update({
    where: { user_id },
    data: { points: { decrement: Number(amount) } },
    select: { points: true }
  });
  // 칭호는 누적 총합 컨셉이 아니라 "보유 포인트" 기준이면 등락 가능.
  const nextTitle = titleByPoints(u.points);
  await tx.user.update({
    where: { user_id },
    data: { title: nextTitle }
  });
  return { points: u.points, title: nextTitle };
}
