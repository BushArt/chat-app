const jwt = require("jsonwebtoken");
jest.mock("jsonwebtoken");
jest.mock("../../../models/User");

const User = require("../../../models/User");
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

  // -----------------------------------------------------------------------
  // JWT revocation checks (iat vs lastLogout)
  // -----------------------------------------------------------------------
  test("passes through when token has no iat claim", () => {
    jwt.verify.mockReturnValue({ id: "user1", username: "alice" });
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(User.findById).not.toHaveBeenCalled();
  });

  test("passes through when user has no lastLogout", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ lastLogout: null })
    });
    jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: 1000 });
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);
    // Flush pending promise chain
    await new Promise(process.nextTick);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  test("passes through when token iat is after lastLogout", async () => {
    const later = Math.floor(Date.now() / 1000);
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ lastLogout: new Date(later * 1000 - 3600000) })
    });
    jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: later });
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);
    await new Promise(process.nextTick);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  test("rejects token when iat is before lastLogout", async () => {
    const logoutTime = new Date();
    const iatBeforeLogout = Math.floor(logoutTime.getTime() / 1000) - 3600;
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ lastLogout: logoutTime })
    });
    jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: iatBeforeLogout });
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);
    await new Promise(process.nextTick);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
    expect(err.code).toBe("token_revoked");
  });

  test("returns 500 when User.findById fails", async () => {
    const rejectPromise = Promise.reject(new Error("DB down"));
    // Suppress unhandled rejection (it's caught by .catch in the middleware)
    rejectPromise.catch(() => {});
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnValue(rejectPromise)
    });
    jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: 1000 });
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);
    await new Promise(process.nextTick);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(500);
    expect(err.code).toBe("auth_error");
  });
});
