import MemoryUserRepository from "./memory/MemoryUserRepository.js";

export const userRepository = new MemoryUserRepository();

// 🔁 나중에 DB 도입 시 여기만 바꾸면 됨
// import MongoUserRepository from "./mongo/MongoUserRepository.js";
// export const userRepository = new MongoUserRepository();
