const request = require("supertest");
const express = require("express");
const cors = require("cors");
const securityHeaders = require("../../../middleware/security");
const errorHandler = require("../../../middleware/errorHandler");

// ── Mocks ──────────────────────────────────────────────────────────────
jest.mock("../../../models/Message");
jest.mock("jsonwebtoken");

const Message = require("../../../models/Message");
const jwt = require("jsonwebtoken");

const messageRoutes = require("../../../routes/messages");

// Helper for fluent Message.find().sort().limit() chain
function mockChain(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
}

// ── Test app factory ───────────────────────────────────────────────────
function createApp() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(securityHeaders);
  app.use("/messages", messageRoutes);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// GET /messages/global
// ─────────────────────────────────────────────────────────────────────
describe("GET /messages/global", () => {
  // ── Authentication ───────────────────────────────────────────────
  test("returns 401 when no Authorization header is present", async () => {
    const app = createApp();
    const res = await request(app).get("/messages/global");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('authentication_required');
  });

  test("returns 401 when header is malformed", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Token abc123");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('authentication_required');
  });

  test("returns 403 when token is invalid", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_token');
  });

  // ── Success ──────────────────────────────────────────────────────
  test("returns 200 with valid JWT", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
  });

  test("returns a paginated response shape", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.body).toHaveProperty("messages");
    expect(res.body).toHaveProperty("hasMore");
    expect(res.body).toHaveProperty("cursor");
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(typeof res.body.hasMore).toBe("boolean");
  });

  test("each element in messages has sender, message, createdAt, and clientId", async () => {
    const messages = [
      {
        sender: "alice",
        message: "hello",
        createdAt: new Date("2026-05-17T12:00:00Z"),
        clientId: "c1",
        _id: "msg1",
      },
    ];
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(messages));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");

    expect(res.body.messages[0]).toHaveProperty("sender");
    expect(res.body.messages[0]).toHaveProperty("message");
    expect(res.body.messages[0]).toHaveProperty("createdAt");
    expect(res.body.messages[0]).toHaveProperty("clientId");
  });

  test("returns empty messages array when no global messages exist", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.body.messages).toEqual([]);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.cursor).toBeNull();
  });

  test("returns hasMore=true when limit is reached", async () => {
    const manyMsgs = Array.from({ length: 100 }, (_, i) => ({
      sender: "alice",
      message: `msg-${i}`,
      createdAt: new Date(`2026-05-17T12:00:${String(i).padStart(2, '0')}Z`),
      clientId: `c${i}`,
      _id: `id${String(i).padStart(24, '0')}`,
    }));
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(manyMsgs));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.body.messages.length).toBe(100);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.cursor).toBeTruthy();
  });

  test("returns hasMore=false when results are fewer than limit", async () => {
    const fewMsgs = Array.from({ length: 50 }, (_, i) => ({
      sender: "alice",
      message: `msg-${i}`,
      createdAt: new Date(`2026-05-17T12:00:${String(i).padStart(2, '0')}Z`),
      clientId: `c${i}`,
      _id: `id${String(i).padStart(24, '0')}`,
    }));
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(fewMsgs));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.body.messages.length).toBe(50);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.cursor).toBeNull();
  });

  // ── Pagination via `before` parameter ────────────────────────────
  test("returns 400 when `before` is an invalid format", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global?before=not-a-valid-cursor")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.code).toBe("invalid_pagination_cursor");
  });

  test("returns 400 when `before` is a numeric string (not valid ObjectId or ISO)", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global?before=12345")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_pagination_cursor");
  });

  test("passes `before` as ObjectId filter when valid 24-hex string is provided", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    const mockSort = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValue([]);
    Message.find.mockReturnValue({ sort: mockSort, limit: mockLimit });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global?before=507f1f77bcf86cd799439011")
      .set("Authorization", "Bearer valid-token");

    expect(Message.find).toHaveBeenCalledWith({
      isGlobal: true,
      _id: { $lt: expect.any(Object) },
    });
    expect(res.status).toBe(200);
  });

  test("passes `before` as createdAt filter when ISO timestamp is provided", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    const mockSort = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValue([]);
    Message.find.mockReturnValue({ sort: mockSort, limit: mockLimit });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global?before=2026-01-01T00:00:00.000Z")
      .set("Authorization", "Bearer valid-token");

    expect(Message.find).toHaveBeenCalledWith({
      isGlobal: true,
      createdAt: { $lt: expect.any(Date) },
    });
    expect(res.status).toBe(200);
  });

  test("returns 500 when Message.find fails (global)", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockRejectedValue(new Error("DB failure")),
    });

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body.code).toBe("global_messages_fetch_failed");
  });
});

// ─────────────────────────────────────────────────────────────────────
// GET /messages/:user1/:user2
// ─────────────────────────────────────────────────────────────────────
describe("GET /messages/:user1/:user2", () => {
  // ── Authentication ───────────────────────────────────────────────
  test("returns 401 without a JWT", async () => {
    const app = createApp();
    const res = await request(app).get("/messages/alice/bob");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('authentication_required');
  });

  test("returns 403 with an invalid JWT", async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error("bad token");
    });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('invalid_token');
  });

  // ── Authorization ────────────────────────────────────────────────
  test("returns 403 when authenticated user is neither user1 nor user2", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "carol" });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('forbidden_access');
  });

  test("returns 200 when authenticated user is user1", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
  });

  test("returns 200 when authenticated user is user2", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "bob" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(200);
  });

  test("authorization check is case-sensitive", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "Alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    // "Alice" !== "alice" so this should be 403
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('forbidden_access');
  });

  // ── Success ──────────────────────────────────────────────────────
  test("returns a paginated response shape on success", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.body).toHaveProperty("messages");
    expect(res.body).toHaveProperty("hasMore");
    expect(res.body).toHaveProperty("cursor");
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(typeof res.body.hasMore).toBe("boolean");
  });

  test("returns messages in chronological ascending order", async () => {
    const messages = [
      {
        sender: "alice",
        receiver: "bob",
        message: "second",
        createdAt: new Date("2026-05-17T12:01:00Z"),
        isGlobal: false,
      },
      {
        sender: "alice",
        receiver: "bob",
        message: "first",
        createdAt: new Date("2026-05-17T12:00:00Z"),
        isGlobal: false,
      },
    ];

    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(messages));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");

    // Route fetches descending then reverses — final order should be ascending
    expect(res.body.messages[0].message).toBe("first");
    expect(res.body.messages[1].message).toBe("second");
  });

  test("returns empty messages array when no messages exist", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.body.messages).toEqual([]);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.cursor).toBeNull();
  });

  // ── Private pagination via `before` ──────────────────────────────
  test("private: returns 400 when `before` is invalid", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob?before=bad-cursor")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_pagination_cursor");
  });

  test("private: passes `before` as ObjectId filter", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    const mockSort = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValue([]);
    Message.find.mockReturnValue({ sort: mockSort, limit: mockLimit });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob?before=507f1f77bcf86cd799439011")
      .set("Authorization", "Bearer token");

    expect(Message.find).toHaveBeenCalledWith({
      isGlobal: false,
      $or: [
        { sender: "alice", receiver: "bob" },
        { sender: "bob", receiver: "alice" }
      ],
      _id: { $lt: expect.any(Object) },
    });
    expect(res.status).toBe(200);
  });

  test("private: passes `before` as createdAt filter when ISO timestamp", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    const mockSort = jest.fn().mockReturnThis();
    const mockLimit = jest.fn().mockResolvedValue([]);
    Message.find.mockReturnValue({ sort: mockSort, limit: mockLimit });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob?before=2026-01-01T00:00:00.000Z")
      .set("Authorization", "Bearer token");

    expect(Message.find).toHaveBeenCalledWith({
      isGlobal: false,
      $or: [
        { sender: "alice", receiver: "bob" },
        { sender: "bob", receiver: "alice" }
      ],
      createdAt: { $lt: expect.any(Date) },
    });
    expect(res.status).toBe(200);
  });

  test("private: returns hasMore=true when limit (50) is reached", async () => {
    const manyMsgs = Array.from({ length: 50 }, (_, i) => ({
      sender: "alice",
      receiver: "bob",
      message: `msg-${i}`,
      createdAt: new Date(`2026-05-17T12:00:${String(i).padStart(2, '0')}Z`),
      isGlobal: false,
      _id: `id${String(i).padStart(24, '0')}`,
    }));
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(manyMsgs));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.body.messages.length).toBe(50);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.cursor).toBeTruthy();
  });

  test("private: returns hasMore=false when results are fewer than limit", async () => {
    const fewMsgs = Array.from({ length: 30 }, (_, i) => ({
      sender: "alice",
      receiver: "bob",
      message: `msg-${i}`,
      createdAt: new Date(`2026-05-17T12:00:${String(i).padStart(2, '0')}Z`),
      isGlobal: false,
      _id: `id${String(i).padStart(24, '0')}`,
    }));
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain(fewMsgs));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.body.messages.length).toBe(30);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.cursor).toBeNull();
  });

  test("returns 500 when Message.find fails (private)", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockRejectedValue(new Error("DB failure")),
    });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body.code).toBe("private_messages_fetch_failed");
  });
});
