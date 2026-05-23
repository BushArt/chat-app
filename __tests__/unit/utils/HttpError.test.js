const HttpError = require("../../../utils/HttpError");

describe("HttpError", () => {
  test("creates an error with default values", () => {
    const err = new HttpError("Something went wrong");
    expect(err.message).toBe("Something went wrong");
    expect(err.status).toBe(500);
    expect(err.code).toBe("internal_error");
  });

  test("creates an error with custom status and code", () => {
    const err = new HttpError("Not found", 404, "resource_not_found");
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("resource_not_found");
  });

  test("is an instance of Error", () => {
    const err = new HttpError("test");
    expect(err).toBeInstanceOf(Error);
  });

  test("has a stack trace", () => {
    const err = new HttpError("test");
    expect(err.stack).toBeDefined();
  });

  test("only sets custom status when provided as second argument", () => {
    const err = new HttpError("Forbidden", 403);
    expect(err.message).toBe("Forbidden");
    expect(err.status).toBe(403);
    expect(err.code).toBe("internal_error");
  });
});