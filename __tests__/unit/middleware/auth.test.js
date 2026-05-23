const jwt = require("jsonwebtoken");
jest.mock("jsonwebtoken");

const verifyToken = require("../../../middleware/auth");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

describe("verifyToken middleware", () => {
  function createMocks() {
    const req = { headers: {} };
    const res = {};
    const next = jest.fn();
    return { req, res, next };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Missing or malformed Authorization header
  // -----------------------------------------------------------------------
  test("calls next with HttpError (401) when Authorization header is absent", () => {
    const { req, res, next } = createMocks();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe("authentication_required");
  });

  test("calls next with HttpError (401) when Authorization header is present but empty", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "";
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe("authentication_required");
  });

  test("calls next with HttpError (401) when header does not start with 'Bearer '", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Token abc123";
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe("authentication_required");
  });

  test("calls next with HttpError (401) when header is 'bearer token' (lowercase)", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "bearer token";
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe("authentication_required");
  });

  test("calls next with HttpError (401) when header is 'Bearer' with no trailing space or token", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer";
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe("authentication_required");
  });

  test("error message does not expose implementation details on 401", () => {
    const { req, res, next } = createMocks();
    verifyToken(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.message).toBe("Authentication required");
  });

  // -----------------------------------------------------------------------
  // Invalid or expired token
  // -----------------------------------------------------------------------
  test("calls next with HttpError (403) when jwt.verify throws an error", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.code).toBe("invalid_token");
  });

  test("does not leak the JWT error message to the client on 403", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.message).not.toContain("jwt expired");
    expect(err.message).toBe("Invalid or expired token");
  });

  // -----------------------------------------------------------------------
  // Valid token
  // -----------------------------------------------------------------------
  test("calls next() without arguments when token is valid", () => {
    const decoded = { id: "user1", username: "alice" };
    jwt.verify.mockReturnValue(decoded);

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  test("attaches decoded payload to req.user when token is valid", () => {
    const decoded = { id: "user1", username: "alice" };
    jwt.verify.mockReturnValue(decoded);

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);

    expect(req.user).toEqual(decoded);
  });

  test("strips 'Bearer ' prefix before passing token to jwt.verify", () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "bob" });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer my-raw-token";
    verifyToken(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith("my-raw-token", expect.any(String));
  });
});
