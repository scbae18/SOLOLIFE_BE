// src/repositories/index.js
import SequelizeUserRepository from "./sequelize/SequelizeUserRepository.js";
export const userRepository = new SequelizeUserRepository();
