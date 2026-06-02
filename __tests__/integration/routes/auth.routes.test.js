const request = require("supertest");
const express = require("express");
const cors = require("cors");
const securityHeaders = require("../../../middleware/security");
const errorHandler = require("../../../middleware/errorHandler");

// ── Mocks ──────────────────────────────────────────────────────────────
jest.mock("express-rate-limit", () => () => (req, res, next) => next());
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");

// Mock cloudinary so we never hit the real API in tests
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn()
    }
  }
}));

// Self-contained User mock: constructor stores properties, static methods are jest.fn()
jest.mock("../../../models/User", () => {
  // Use a factory function so that prototype.save is available
  function MockUser(data) {
    if (data) {
      Object.assign(this, data);
    }
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
  }
  MockUser.prototype.save = jest.fn().mockResolvedValue();
  MockUser.findOne = jest.fn();
  MockUser.findById = jest.fn().mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(null) })
  });
  MockUser.findByIdAndUpdate = jest.fn().mockReturnValue({
    select: () => Promise.resolve(null)
  });
  MockUser.updateOne = jest.fn();
  return MockUser;
});

const User = require("../../../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const authRoutes = require("../../../routes/auth");

// ── Test app factory ───────────────────────────────────────────────────
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

const mockIo = { emit: jest.fn() };

function createAppWithIo() {
  const app = createApp();
  app.set('io', mockIo);
  return app;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
  process.env.BCRYPT_ROUNDS = "4";
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset findById to return chainable select/lean
  User.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(null) })
  });
});

// Helper: mock User.findById() to return a specific user via chainable select().lean()
function mockFindByIdReturns(userObj) {
  User.findById.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(userObj)
    })
  });
}

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
  beforeEach(() => {
    User.findOne.mockResolvedValue(null);
    User.prototype.save.mockImplementation(function() {
      return Promise.resolve();
    });
    bcrypt.hash.mockResolvedValue("hashed-password");
    jwt.sign.mockReturnValue("mock-jwt-token");
  });

  test("returns 201 on successful registration", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(201);
  });

  test("response has token, username, displayName, bio, status, avatarUrl, createdAt on success", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("username");
    expect(res.body).toHaveProperty("displayName");
    expect(res.body).toHaveProperty("bio");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("avatarUrl");
    expect(res.body).toHaveProperty("createdAt");
  });

  test("displayName equals username on registration", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });
    expect(res.body.displayName).toBe("alice");
  });

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

  test("returns 400 when save() throws duplicate key error 11000 (MongoDB race)", async () => {
    const dupError = Object.assign(new Error("duplicate key"), { code: 11000 });
    User.prototype.save = jest.fn().mockRejectedValue(dupError);
    User.findOne.mockResolvedValue(null);
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
    displayName: "Alice Cool",
    bio: "Just chatting!",
    status: "online",
    createdAt: new Date("2026-01-15T10:00:00Z")
  };

  beforeEach(() => {
    User.findOne.mockResolvedValue(existingUser);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock-jwt-token");
  });

  test("returns 200 on successful login", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.status).toBe(200);
  });

  test("returns token, username, displayName, bio, status, avatarUrl, createdAt on success", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("username");
    expect(res.body).toHaveProperty("displayName");
    expect(res.body).toHaveProperty("bio");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("avatarUrl");
    expect(res.body).toHaveProperty("createdAt");
  });

  test("displayName matches stored value", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.body.displayName).toBe("Alice Cool");
  });

  test("status in response is 'online'", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/login")
      .send({ username: "alice", password: "password123" });
    expect(res.body.status).toBe("online");
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
    User.findOne.mockResolvedValue(null);
    const app1 = createApp();
    const res1 = await request(app1)
      .post("/auth/login")
      .send({ username: "nonexistent", password: "password123" });

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

// ─────────────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────────────
describe("GET /auth/me", () => {
  const mockUser = {
    _id: "user-id-123",
    username: "alice",
    displayName: "Alice Cool",
    bio: "Just chatting!",
    status: "online",
    createdAt: new Date("2026-01-15T10:00:00Z"),
    lastLogout: null
  };

  beforeEach(() => {
    jwt.verify.mockReturnValue({ id: "user-id-123", username: "alice", iat: Math.floor(Date.now() / 1000) });
    mockFindByIdReturns(mockUser);
  });

  test("returns 401 without JWT", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('authentication_required');
  });

  test("returns 200 with valid JWT", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
  });

  test("returns the profile object with correct fields", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid-token");
    expect(res.body).toHaveProperty("username");
    expect(res.body).toHaveProperty("displayName");
    expect(res.body).toHaveProperty("bio");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("createdAt");
    expect(res.body.username).toBe("alice");
    expect(res.body.displayName).toBe("Alice Cool");
    expect(res.body.bio).toBe("Just chatting!");
    expect(res.body.status).toBe("online");
  });

  test("does not include a password field", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid-token");
    expect(res.body).not.toHaveProperty("password");
  });

  test("returns 404 when user is not found", async () => {
    mockFindByIdReturns(null);
    const app = createApp();
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('user_not_found');
  });
});

// ─────────────────────────────────────────────────────────────────────
// PUT /auth/profile
// ─────────────────────────────────────────────────────────────────────
describe("PUT /auth/profile", () => {
  const mockUser = {
    _id: "user-id-123",
    username: "alice",
    displayName: "Alice Cool",
    bio: "Just chatting!",
    status: "online",
    createdAt: new Date("2026-01-15T10:00:00Z"),
    lastLogout: null
  };

  beforeEach(() => {
    jwt.verify.mockReturnValue({ id: "user-id-123", username: "alice", iat: Math.floor(Date.now() / 1000) });
    // GET /auth/me middleware check requires findById to work for JWT revocation
    mockFindByIdReturns(mockUser);
  });

  test("returns 401 without JWT", async () => {
    const app = createApp();
    const res = await request(app)
      .put("/auth/profile")
      .send({ displayName: "Alice Smith" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('authentication_required');
  });

  test("returns 400 when displayName is empty after trim", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_display_name');
  });

  test("returns 400 when displayName exceeds 50 codepoints (51 characters)", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "a".repeat(51) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_display_name');
  });

  test("returns 400 when status is 'offline'", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ status: "offline" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_status');
  });

  test("returns 400 when bio exceeds 160 codepoints", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ bio: "x".repeat(161) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_bio');
  });

  test("returns 400 when bio contains HTML tags", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ bio: "<script>alert('xss')</script>" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_bio');
  });

  // Helper to make findByIdAndUpdate return a value via .select() (no .lean() in route)
  function mockFindByIdAndUpdateReturns(userObj) {
    User.findByIdAndUpdate.mockReturnValue({
      select: () => Promise.resolve(userObj)
    });
  }

  test("update with only bio does not overwrite displayName", async () => {
    const updatedUser = {
      ...mockUser,
      displayName: "Alice Cool",
      bio: "New bio only",
      status: "online"
    };
    mockFindByIdAndUpdateReturns(updatedUser);
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ bio: "New bio only" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Alice Cool");
    expect(res.body.bio).toBe("New bio only");
  });

  test("returns the updated profile on success", async () => {
    const updatedUser = {
      ...mockUser,
      displayName: "Alice Smith",
      bio: "Updated bio!",
      status: "away"
    };
    mockFindByIdAndUpdateReturns(updatedUser);
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "Alice Smith", bio: "Updated bio!", status: "away" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Alice Smith");
    expect(res.body.bio).toBe("Updated bio!");
    expect(res.body.status).toBe("away");
  });

  test("broadcasts profile_updated socket event on success", async () => {
    const updatedUser = {
      ...mockUser,
      displayName: "Alice Smith",
      status: "away"
    };
    mockFindByIdAndUpdateReturns(updatedUser);
    const app = createAppWithIo();
    await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ displayName: "Alice Smith", status: "away" });
    expect(mockIo.emit).toHaveBeenCalledWith("profile_updated", {
      username: "alice",
      displayName: "Alice Smith",
      status: "away",
      avatarUrl: null
    });
  });

  test("returns 400 when no valid fields are provided", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('no_fields');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Avatar upload via PUT /auth/profile
// ─────────────────────────────────────────────────────────────────────
describe("PUT /auth/profile — avatar upload", () => {
  const mockUser = {
    _id: "user-id-123",
    username: "alice",
    displayName: "Alice Cool",
    bio: "Just chatting!",
    status: "online",
    avatarUrl: null,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    lastLogout: null
  };

  const cloudinary = require("cloudinary");

  beforeEach(() => {
    jwt.verify.mockReturnValue({ id: "user-id-123", username: "alice", iat: Math.floor(Date.now() / 1000) });
    mockFindByIdReturns(mockUser);
    // Default cloudinary mock: succeed with a fixed URL
    cloudinary.v2.uploader.upload_stream.mockImplementation((options, callback) => {
      callback(null, { secure_url: "https://res.cloudinary.com/test/chat-app/avatars/user_alice" });
      // Return a mock stream with .end()
      return { end: jest.fn() };
    });
  });

  test("returns 200 with avatarUrl when a valid image file is uploaded", async () => {
    const updatedUser = {
      ...mockUser,
      avatarUrl: "https://res.cloudinary.com/test/chat-app/avatars/user_alice"
    };
    User.findByIdAndUpdate.mockReturnValue({
      select: () => Promise.resolve(updatedUser)
    });

    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .attach("avatar", Buffer.from("fake-image-data"), "avatar.jpg");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("avatarUrl");
    expect(res.body.avatarUrl).toBe("https://res.cloudinary.com/test/chat-app/avatars/user_alice");
  });

  test("returns 400 when uploaded file exceeds 5 MB", async () => {
    const app = createAppWithIo();
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .attach("avatar", largeBuffer, "large.jpg");

    expect(res.status).toBe(400);
  });

  test("returns 400 when uploaded file has a disallowed MIME type", async () => {
    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .attach("avatar", Buffer.from("fake-pdf"), "document.pdf");

    expect(res.status).toBe(400);
  });

  test("upload with no file does not overwrite existing avatarUrl", async () => {
    const userWithAvatar = {
      ...mockUser,
      avatarUrl: "https://res.cloudinary.com/test/chat-app/avatars/user_alice"
    };
    mockFindByIdReturns(userWithAvatar);

    const updatedUser = {
      ...userWithAvatar,
      bio: "Updated bio"
    };
    User.findByIdAndUpdate.mockReturnValue({
      select: () => Promise.resolve(updatedUser)
    });

    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .send({ bio: "Updated bio" });

    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBe("https://res.cloudinary.com/test/chat-app/avatars/user_alice");
  });

  test("returns 500 when Cloudinary upload fails", async () => {
    cloudinary.v2.uploader.upload_stream.mockImplementation((options, callback) => {
      callback(new Error("Cloudinary error"), null);
      return { end: jest.fn() };
    });

    const app = createAppWithIo();
    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-token")
      .attach("avatar", Buffer.from("fake-image-data"), "avatar.jpg");

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("code", "avatar_upload_failed");
  });
});

// ─────────────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────────────
describe("POST /auth/logout", () => {
  beforeEach(() => {
    jwt.verify.mockReturnValue({ id: "user-id-123", username: "alice", iat: Math.floor(Date.now() / 1000) });
    mockFindByIdReturns({ _id: "user-id-123", username: "alice", lastLogout: null });
    User.findByIdAndUpdate.mockReset();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test("returns 401 without JWT", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("authentication_required");
  });

  test("returns 200 and records lastLogout timestamp", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user-id-123",
      expect.objectContaining({ lastLogout: expect.any(Date) })
    );
  });

  test("returns 500 when lastLogout update fails", async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error("db error"));
    const app = createApp();
    const res = await request(app)
      .post("/auth/logout")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("logout_failed");
  });
});
