const request = require("supertest");
const express = require("express");
const cors = require("cors");
const securityHeaders = require("../../../middleware/security");
const errorHandler = require("../../../middleware/errorHandler");

// ── Mocks ──────────────────────────────────────────────────────────────
// Mock express-rate-limit to no-op — rate limiter behavior is tested in Phase 2 unit tests
jest.mock("express-rate-limit", () => () => (req, res, next) => next());

jest.mock("../../../models/User");
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");

const User = require("../../../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const authRoutes = require("../../../routes/auth");

// ── Test app factory ───────────────────────────────────────────────────
// Creates a fresh Express instance per call with middleware matching server.js order
function createApp() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(securityHeaders);
  app.use("/auth", authRoutes);
  app.get("/ping", (req, res) => res.send("Server is running!"));
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.BCRYPT_ROUNDS = "4";
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// GET /ping
// ─────────────────────────────────────────────────────────────────────
describe("GET /ping", () => {
  test("returns 200 without authentication", async () => {
    const app = createApp();
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
  });

  test("returns 'Server is running!'", async () => {
    const app = createApp();
    const res = await request(app).get("/ping");
    expect(res.text).toBe("Server is running!");
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────────────
describe("POST /auth/register", () => {
  // Default mock: user does not exist, save succeeds
  beforeEach(() => {
    User.findOne.mockResolvedValue(null);
    User.prototype.save.mockResolvedValue();
    bcrypt.hash.mockResolvedValue("hashed-password");
  });

  // ── Success ───────────────────────────────────────────────────────
  test("returns 201 on successful registration", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("response has a message field on success", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.body).toHaveProperty("message");
  });

  test("message does not contain the username or password", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.body.message).not.toContain("alice");
    expect(res.body.message).not.toContain("password123");
  });

  // ── Missing fields ────────────────────────────────────────────────
  test("returns 400 when username is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });

  test("returns 400 when password is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });

  test("returns 400 when body is empty", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });


  // ── Username validation ───────────────────────────────────────────
  test("returns 400 when username is empty after trim", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "   ", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 400 when username exceeds 30 characters (31 Latin chars)", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "a".repeat(31), password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 201 when username is exactly 30 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "a".repeat(30), password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 400 when username contains a space", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice bob", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 400 when username contains @ symbol", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice@test", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 400 when username contains ideographic space U+3000", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice\u3000bob", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 400 when username contains an emoji", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice😀", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_username');
  });

  test("returns 201 when username contains Latin characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains digits", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "user123", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains a hyphen", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "test-user", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains an underscore", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "test_user", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains Chinese characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "用戶", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains Japanese Hiragana", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "ひらがな", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when username contains Korean Hangul", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "한글", password: "password123" });
    expect(res.status).toBe(201);
  });

  // ── Password validation ──────────────────────────────────────────
  test("returns 400 when password is fewer than 6 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "12345" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('password_too_short');
  });

  test("returns 400 when password is 129 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "x".repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('password_too_long');
  });

  test("returns 201 when password is exactly 6 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "123456" });
    expect(res.status).toBe(201);
  });

  test("returns 201 when password is exactly 128 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "x".repeat(128) });
    expect(res.status).toBe(201);
  });

  // ── Uniqueness ───────────────────────────────────────────────────
  test("returns 400 when username already exists", async () => {
    User.findOne.mockResolvedValue({ username: "alice" });
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('username_taken');
  });

  test("returns 400 for case-insensitive duplicate", async () => {
    User.findOne.mockResolvedValue({ username: "Alice" });
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('username_taken');
  });

  // ── MongoDB duplicate key race (error code 11000) ────────────────
  test("returns 400 when save() throws duplicate key error 11000 (MongoDB race)", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: 11000 });
    User.prototype.save.mockRejectedValue(dupError);

    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('username_taken');
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────
describe("POST /auth/login", () => {
  const existingUser = {
    _id: "user-id-123",
    username: "alice",
    password: "hashed-password",
  };

  beforeEach(() => {
    User.findOne.mockResolvedValue(existingUser);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock-jwt-token");
  });

  // ── Success ──────────────────────────────────────────────────────
  test("returns 200 on successful login", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(200);
  });

  test("returns token and username on success", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("username");
  });

  test("username in response matches stored username", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.body.username).toBe("alice");
  });

  test("jwt.sign is called with correct payload { id, username }", async () => {
    const app = createApp();
    await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });

    expect(jwt.sign).toHaveBeenCalledWith(
      { id: "user-id-123", username: "alice" },
      expect.any(String),
      expect.objectContaining({ expiresIn: "24h" })
    );
  });

  // ── Missing fields ───────────────────────────────────────────────
  test("returns 400 when username is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });

  test("returns 400 when password is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });

  test("returns 400 when body is empty", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('missing_credentials');
  });

  // ── Failed authentication ────────────────────────────────────────
  test("returns 400 when user does not exist", async () => {
    User.findOne.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "nonexistent", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_credentials');
  });

  test("returns 400 when password is wrong", async () => {
    bcrypt.compare.mockResolvedValue(false);
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "wrongpassword" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_credentials');
  });

  test("error message is identical for 'user not found' and 'wrong password'", async () => {
    // Case 1: user not found
    User.findOne.mockResolvedValue(null);
    const app1 = createApp();
    const res1 = await request(app1)
      .post("/auth/login")
      .send({ username: "nonexistent", password: "password123" });

    // Case 2: wrong password
    User.findOne.mockResolvedValue(existingUser);
    bcrypt.compare.mockResolvedValue(false);
    const app2 = createApp();
    const res2 = await request(app2)
      .post("/auth/login")
      .send({ username: "alice", password: "wrongpassword" });

    expect(res1.body.error).toBe("Invalid username or password");
    expect(res1.body.code).toBe('invalid_credentials');
    expect(res2.body.error).toBe("Invalid username or password");
    expect(res2.body.code).toBe('invalid_credentials');
  });

  test("returns 400 when password exceeds 128 characters", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "x".repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('password_too_long');
  });
});