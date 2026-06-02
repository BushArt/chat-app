const http = require("http");
const express = require("express");
const cors = require("cors");
const request = require("supertest");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const state = require("../../../sockets/state");
const securityHeaders = require("../../../middleware/security");
const errorHandler = require("../../../middleware/errorHandler");
const {
  waitForEvent,
  connectAndWait,
  resetJwtVerifyDefault,
  closeSocketServer,
} = require("./socketTestHelpers");

jest.mock("express-rate-limit", () => () => (req, res, next) => next());
jest.mock("bcryptjs");
jest.mock("jsonwebtoken");
jest.mock("cloudinary", () => ({
  v2: { config: jest.fn(), uploader: { upload_stream: jest.fn() } },
}));

jest.mock("../../../models/User", () => {
  function MockUser(data) {
    if (data) Object.assign(this, data);
  }
  MockUser.prototype.save = jest.fn().mockResolvedValue();
  MockUser.findOne = jest.fn();
  MockUser.findById = jest.fn();
  MockUser.findByIdAndUpdate = jest.fn();
  MockUser.updateOne = jest.fn().mockResolvedValue();
  MockUser.find = jest.fn();
  return MockUser;
});

jest.mock("../../../middleware/rateLimiter", () => {
  return jest.fn(() => {
    const limiter = jest.fn().mockReturnValue(true);
    limiter.cleanup = jest.fn();
    return limiter;
  });
});

const User = require("../../../models/User");
const authRoutes = require("../../../routes/auth");

function mockFindByIdReturns(userObj) {
  User.findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(userObj) }),
  });
}

function mockFindByIdAndUpdateReturns(userObj) {
  User.findByIdAndUpdate.mockReturnValue({
    select: () => Promise.resolve(userObj),
  });
}

function mockFindReturns(users) {
  User.find.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(users),
    }),
  });
}

function createCombinedServer() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "100kb" }));
  app.use(securityHeaders);
  app.use("/auth", authRoutes);
  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new Server(server, { transports: ["websocket"] });
  app.set("io", io);
  require("../../../sockets")(io);

  return { app, server, io };
}

describe("Socket.IO connection – profile broadcast via PUT /auth/profile", () => {
  let app, server, io, port;
  let clients = [];

  const mockUser = {
    _id: "user1",
    username: "alice",
    displayName: "Alice",
    bio: "",
    status: "online",
    avatarUrl: null,
    lastLogout: null,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    jwt.verify.mockReturnValue({
      id: "user1",
      username: "alice",
      iat: Math.floor(Date.now() / 1000),
      loginAt: Date.now(),
    });

    ({ app, server, io } = createCombinedServer());
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await closeSocketServer(io, server);
  });

  beforeEach(() => {
    state.onlineUsers.clear();
    state.typingTimeouts.clear();
    clients = [];
    resetJwtVerifyDefault(jwt);
    jwt.verify.mockReturnValue({
      id: "user1",
      username: "alice",
      iat: Math.floor(Date.now() / 1000),
      loginAt: Date.now(),
    });
    mockFindByIdReturns(mockUser);

    User.find.mockReset();
    mockFindReturns([
      { username: "alice", displayName: "Alice", status: "online" },
    ]);
    User.updateOne.mockReset();
    User.updateOne.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Promise.all(
      clients.map(
        (c) =>
          new Promise((resolve) => {
            c.removeAllListeners();
            c.close();
            setTimeout(resolve, 0);
          })
      )
    );
  });

  function track(client) {
    clients.push(client);
    return client;
  }

  test("online_users payload is an array of objects with username, displayName, status", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));
    const online = await waitForEvent(client, "online_users");
    expect(Array.isArray(online)).toBe(true);
    expect(online.length).toBeGreaterThan(0);
    const aliceEntry = online.find((e) => e && e.username === "alice");
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry).toHaveProperty("displayName");
    expect(aliceEntry).toHaveProperty("status");
  });

  test("PUT /auth/profile broadcasts profile_updated to connected clients", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));
    const profilePromise = waitForEvent(client, "profile_updated");

    const updatedUser = {
      ...mockUser,
      displayName: "Alice Updated",
      status: "busy",
    };
    mockFindByIdAndUpdateReturns(updatedUser);

    const res = await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-jwt")
      .send({ displayName: "Alice Updated", status: "busy" });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Alice Updated");

    const data = await profilePromise;
    expect(data).toEqual({
      username: "alice",
      displayName: "Alice Updated",
      status: "busy",
      avatarUrl: null,
    });
  });

  test("profile_updated event does not include sensitive fields", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));
    const profilePromise = waitForEvent(client, "profile_updated");

    mockFindByIdAndUpdateReturns({
      ...mockUser,
      displayName: "Alice Safe",
      status: "away",
    });

    await request(app)
      .put("/auth/profile")
      .set("Authorization", "Bearer valid-jwt")
      .send({ displayName: "Alice Safe", status: "away" });

    const data = await profilePromise;
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("token");
    expect(data).not.toHaveProperty("lastLogout");
  });
});
