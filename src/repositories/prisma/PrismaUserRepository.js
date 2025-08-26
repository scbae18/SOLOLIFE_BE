import { prisma } from "../../config/db.js";

export default class PrismaUserRepository {
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email: String(email).toLowerCase() },
    });
  }

  async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  }

  async create({ email, password }) {
    return prisma.user.create({
      data: { email: String(email).toLowerCase(), password },
    });
  }
}
