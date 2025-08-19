/**
 * UserRepository interface (documentation)
 *
 * Methods:
 *  - findByEmail(email) -> Promise<User|null>
 *  - findById(id) -> Promise<User|null>
 *  - create({ email, password }) -> Promise<User>
 *
 * User shape:
 *  { id: string, email: string, password: string } // password는 해시 저장
 */
export {};
