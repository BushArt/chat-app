// Mock logger
jest.mock("../../../utils/logger", () => ({
  error: jest.fn(),
}));

const errorHandler = require("../../../middleware/errorHandler");

describe("errorHandler middleware", () => {
  function createMocks() {
    const req = { path: "/test" };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("responds with 500 and default code when error has no status/code", () => {
    const { req, res, next } = createMocks();
    const err = new Error("unexpected");
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "unexpected",
      code: "internal_error",
    });
  });

  test("responds with custom status and code", () => {
    const { req, res, next } = createMocks();
    const err = new Error("Not found");
    err.status = 404;
    err.code = "resource_not_found";
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "Not found",
      code: "resource_not_found",
    });
  });

  test("responds with 401 and authentication code", () => {
    const { req, res, next } = createMocks();
    const err = new Error("Authentication required");
    err.status = 401;
    err.code = "authentication_required";
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Authentication required",
      code: "authentication_required",
    });
  });

  test("calls logger.error with error details", () => {
    const logger = require("../../../utils/logger");
    const { req, res, next } = createMocks();
    const err = new Error("bad request");
    err.status = 400;
    err.code = "invalid_input";
    errorHandler(err, req, res, next);
    expect(logger.error).toHaveBeenCalledWith({
      event: "http_error",
      status: 400,
      code: "invalid_input",
      message: "bad request",
      path: "/test",
    });
  });

  test("does not call next()", () => {
    const { req, res, next } = createMocks();
    const err = new Error("test");
    errorHandler(err, req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});