const jwt = require("jsonwebtoken");
jest.mock("jsonwebtoken");

const verifyToken = require("../../../middleware/auth");

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

describe("verifyToken middleware", () => {
  function createMocks() {
    const req = { headers: {} };
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

  // -----------------------------------------------------------------------
  // Missing or malformed Authorization header
  // -----------------------------------------------------------------------
  test("returns 401 when Authorization header is absent", () => {
    const { req, res, next } = createMocks();
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 401 when Authorization header is present but empty", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "";
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 401 when Authorization header does not start with 'Bearer '", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Token abc123";
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 401 when header is 'bearer token' (lowercase)", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "bearer token";
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns 401 when header is 'Bearer' with no trailing space or token", () => {
    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer";
    verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("returns a JSON body with 'error' field on 401", () => {
    const { req, res, next } = createMocks();
    verifyToken(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
  });

  test("does not call next() when auth header is missing", () => {
    const { req, res, next } = createMocks();
    verifyToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Invalid or expired token
  // -----------------------------------------------------------------------
  test("returns 403 when jwt.verify throws an error", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("returns JSON body with 'error' field on 403", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
  });

  test("does not leak the JWT error message to the response body on 403", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    // The actual message should not contain "jwt expired"
    const errorArg = res.json.mock.calls[0][0].error;
    expect(errorArg).not.toContain("jwt expired");
  });

  test("does not call next() on invalid token", () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("bad token");
    });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer invalid-token";
    verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Valid token
  // -----------------------------------------------------------------------
  test("calls next() exactly once when token is valid", () => {
    const decoded = { id: "user1", username: "alice" };
    jwt.verify.mockReturnValue(decoded);

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
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

  test("does not send a response directly on success", () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "bob" });

    const { req, res, next } = createMocks();
    req.headers["authorization"] = "Bearer valid.jwt.token";
    verifyToken(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});