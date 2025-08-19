import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import { userRepository } from "../repositories/index.js";

export const register = async ({ email, password }) => {
  if (!email || !password) throw new ApiError(400, "Email and password required");

  const exists = await userRepository.findByEmail(email);
  if (exists) throw new ApiError(409, "Email already in use");

  const hash = await bcrypt.hash(password, 10);
  const user = await userRepository.create({ email, password: hash });

  const token = sign(user.id);
  return { user: expose(user), token };
};

export const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);
  if (!user) throw new ApiError(401, "Invalid credentials");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw new ApiError(401, "Invalid credentials");

  const token = sign(user.id);
  return { user: expose(user), token };
};

const sign = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const expose = (user) => {
  const plain = user.toJSON ? user.toJSON() : user;
  return { id: plain.id, email: plain.email };
};
