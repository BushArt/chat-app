const securityHeaders = require("../../../middleware/security");

describe("securityHeaders middleware", () => {
  function createMocks() {
    const req = {};
    const res = {
      headers: {},
      setHeader: jest.fn(function (key, value) {
        this.headers[key] = value;
      }),
      removeHeader: jest.fn(function (key) {
        delete this.headers[key];
      }),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test("sets X-Content-Type-Options to nosniff", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });

  test("sets X-Frame-Options to DENY", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });

  test("sets X-XSS-Protection to '1; mode=block'", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("X-XSS-Protection", "1; mode=block");
  });

  test("sets Referrer-Policy to strict-origin-when-cross-origin", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  test("removes X-Powered-By header", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(res.removeHeader).toHaveBeenCalledWith("X-Powered-By");
  });

  test("calls next() exactly once", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("does not return a response directly", () => {
    const { req, res, next } = createMocks();
    const result = securityHeaders(req, res, next);
    expect(result).toBeUndefined();
  });

  test("sets Content-Security-Policy with connect-src for websockets", () => {
    const { req, res, next } = createMocks();
    securityHeaders(req, res, next);
    const csp = res.headers["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
  });
});
