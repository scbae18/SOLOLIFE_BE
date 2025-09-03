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
