import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import { userRepository } from "../repositories/index.js";

export const authRequired = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Missing token");

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userRepository.findById(payload.sub);
    if (!user) throw new ApiError(401, "User not found");

    req.user = { id: user.id, email: user.email };
    next();
  } catch {
    next(new ApiError(401, "Unauthorized"));
  }
};
