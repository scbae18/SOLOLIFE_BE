export class ApiError extends Error {
  constructor(status, message, meta={}) {
    super(message);
    this.status = status;
    this.meta = meta;
  }
}
