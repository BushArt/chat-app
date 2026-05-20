const request = require("supertest");
const express = require("express");
const cors = require("cors");
const securityHeaders = require("../../../middleware/security");

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
  });

  test("returns 401 when header is malformed", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Token abc123");
    expect(res.status).toBe(401);
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

  test("returns a JSON array", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("each element has sender, message, createdAt, and clientId", async () => {
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

    expect(res.body[0]).toHaveProperty("sender");
    expect(res.body[0]).toHaveProperty("message");
    expect(res.body[0]).toHaveProperty("createdAt");
    expect(res.body[0]).toHaveProperty("clientId");
  });

  test("returns empty array when no global messages exist", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/global")
      .set("Authorization", "Bearer valid-token");
    expect(res.body).toEqual([]);
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
  });

  // ── Authorization ────────────────────────────────────────────────
  test("returns 403 when authenticated user is neither user1 nor user2", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "carol" });

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.status).toBe(403);
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
  });

  // ── Success ──────────────────────────────────────────────────────
  test("returns a JSON array on success", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(Array.isArray(res.body)).toBe(true);
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
    expect(res.body[0].message).toBe("first");
    expect(res.body[1].message).toBe("second");
  });

  test("returns empty array when no messages exist", async () => {
    jwt.verify.mockReturnValue({ id: "u1", username: "alice" });
    Message.find.mockReturnValue(mockChain([]));

    const app = createApp();
    const res = await request(app)
      .get("/messages/alice/bob")
      .set("Authorization", "Bearer token");
    expect(res.body).toEqual([]);
  });
});