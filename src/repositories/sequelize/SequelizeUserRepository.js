// src/repositories/sequelize/SequelizeUserRepository.js
import User from "../../models/userModel.js";

export default class SequelizeUserRepository {
  async findByEmail(email) {
    return User.findOne({ where: { email: String(email).toLowerCase() } });
  }

  async findById(id) {
    return User.findByPk(id);
  }

  async create({ email, password }) {
    return User.create({ email: String(email).toLowerCase(), password });
  }
}
