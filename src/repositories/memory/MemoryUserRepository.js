import crypto from "crypto";

export default class MemoryUserRepository {
  constructor() {
    this.users = new Map(); // id -> user
    this.byEmail = new Map(); // email -> id
  }

  async findByEmail(email) {
    const id = this.byEmail.get(String(email).toLowerCase());
    if (!id) return null;
    return this.users.get(id) || null;
  }

  async findById(id) {
    return this.users.get(id) || null;
  }

  async create({ email, password }) {
    const id = crypto.randomUUID();
    const normalized = String(email).toLowerCase();
    const user = { id, email: normalized, password };
    this.users.set(id, user);
    this.byEmail.set(normalized, id);
    return user;
  }
}
