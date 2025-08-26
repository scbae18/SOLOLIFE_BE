// src/config/db.js
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
});

export const connectDB = async () => {
  await prisma.$connect();
  console.log("[db] PostgreSQL connected via Prisma");
};
