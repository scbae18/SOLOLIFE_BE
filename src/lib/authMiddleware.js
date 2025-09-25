import jwt from 'jsonwebtoken';
import { ApiError } from './ApiError.js';
import { prisma } from './prisma.js'; // 🔥 같은 lib 폴더라 ./prisma.js 경로

export function authOptional(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { user_id: payload.user_id };
  } catch (_) {}
  next();
}

export function authRequired(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new ApiError(401, 'Unauthorized');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { user_id: payload.user_id };
    next();
  } catch (e) {
    throw new ApiError(401, 'Invalid token');
  }
}

/**
 * ✅ 어드민 전용 가드: DB에서 is_admin만 확인
 * - User.is_admin === true 이면 통과
 * - 그 외는 403
 */
export async function adminOnly(req, res, next) {
  try {
    if (!req.user?.user_id) return res.status(401).json({ error: 'Unauthorized' });

    const u = await prisma.user.findUnique({
      where: { user_id: req.user.user_id },
      select: { is_admin: true }
    });

    if (!u?.is_admin) return res.status(403).json({ error: 'Forbidden: admin only' });
    return next();
  } catch (e) {
    // 예외 발생 시 500
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
