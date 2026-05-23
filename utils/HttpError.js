class HttpError extends Error {
  constructor(message, status = 500, code = 'internal_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
module.exports = HttpError;