import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

export async function register({ username, email, password }) {
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { username, email, password_hash: hash },
      select: { user_id: true, username: true, email: true, created_at: true }
    });
    return user;
  } catch (e) {
    if (e.code === 'P2002') throw new ApiError(409, 'Username or email already exists');
    throw e;
  }
}

export async function login({ emailOrUsername, password }) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: emailOrUsername }, { username: emailOrUsername }]
    }
  });
  if (!user) throw new ApiError(401, 'Invalid credentials');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid credentials');

  const token = jwt.sign({ user_id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return {
    token,
    user: { user_id: user.user_id, username: user.username, email: user.email }
  };
}

export async function me(user_id) {
  const user = await prisma.user.findUnique({
    where: { user_id },
    select: {
      user_id: true, username: true, email: true, created_at: true,
      explorer_level: true, experience_points: true,
      points: true, title: true, assets: true,
      is_public_profile: true,
      current_character_id: true
    }
  });
  return user;
}

