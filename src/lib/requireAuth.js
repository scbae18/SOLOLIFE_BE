// src/middlewares/requireAuth.js
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) throw new ApiError(401, 'No token provided');

    const token = authHeader.replace('Bearer ', '');
    if (!token) throw new ApiError(401, 'Invalid token format');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw new ApiError(401, 'Invalid or expired token');
    }

    const user = await prisma.user.findUnique({ where: { user_id: payload.user_id } });
    if (!user) throw new ApiError(401, 'User not found');

    req.user = { user_id: user.user_id };
    next();
  } catch (err) {
    next(err);
  }
}
