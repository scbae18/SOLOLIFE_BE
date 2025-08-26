// 기존 Memory / Sequelize 주석 처리
// import MemoryUserRepository from "./memory/MemoryUserRepository.js";
// export const userRepository = new MemoryUserRepository();

import PrismaUserRepository from "./prisma/PrismaUserRepository.js";
export const userRepository = new PrismaUserRepository();
