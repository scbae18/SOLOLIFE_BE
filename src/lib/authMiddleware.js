import jwt from 'jsonwebtoken';
import { ApiError } from './ApiError.js';

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

export function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  // 다음 중 하나라도 true면 관리자라고 간주
  const isAdmin =
    req.user.role === 'admin' ||
    req.user.is_admin === true ||
    (Array.isArray(req.user.permissions) && req.user.permissions.includes('admin'));

  if (!isAdmin) return res.status(403).json({ error: 'Forbidden: admin only' });
  return next();
}
