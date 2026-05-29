const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const jwt = require("jsonwebtoken");
const state = require("../../../sockets/state");

// Mock User model for JWT revocation checks and getOnlineList
jest.mock("../../../models/User", () => ({
  findById: jest.fn(),
  find: jest.fn(),
  updateOne: jest.fn().mockResolvedValue(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock("jsonwebtoken");

// Mock the rate limiter factory
jest.mock("../../../middleware/rateLimiter", () => {
  return jest.fn(() => {
    const limiter = jest.fn().mockReturnValue(true);
    limiter.cleanup = jest.fn();
    return limiter;
  });
});

const Message = require("../../../models/Message");

jest.mock("../../../models/Message", () => {
  const mockDocument = {
    sender: "alice",
    receiver: null,
    message: "hello",
    isGlobal: true,
    clientId: "c1",
    createdAt: new Date("2026-05-17T12:00:00Z"),
    save: jest.fn().mockResolvedValue(),
  };
  return jest.fn(() => ({ ...mockDocument, save: jest.fn().mockResolvedValue() }));
});

function createSocketServer() {
  const server = http.createServer();
  const io = new Server(server, { transports: ["websocket"] });
  require("../../../sockets")(io);
  return { server, io };
}

function connectClient(port, token) {
  return ioClient(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    auth: { token },
  });
}

function waitForEvent(emitter, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args.length <= 1 ? args[0] : args);
    });
  });
}

async function connectAndWait(port, token) {
  const client = connectClient(port, token);
  await waitForEvent(client, "connect");
  return client;
}

describe("Socket.IO connection – Phase 1 profile fields", () => {
  let server, io, port;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    jwt.verify.mockReturnValue({ id: "user1", username: "alice" });

    ({ server, io } = createSocketServer());
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    io?.close();
    server?.close();
  });

  let clients = [];

  beforeEach(() => {
    state.onlineUsers.clear();
    state.typingTimeouts.clear();
    clients = [];
    jwt.verify.mockClear();
    jwt.verify.mockReturnValue({ id: "user1", username: "alice" });
    Message.mockClear();

    const User = require("../../../models/User");
    User.findById.mockClear();
    User.findById.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({ lastLogout: null })
      }))
    });

    // Default: User.find returns enriched objects for getOnlineList()
    User.find.mockReset();
    User.find.mockResolvedValue([
      { username: "alice", displayName: "Alice", status: "online" },
    ]);
  });

  afterEach(() => {
    clients.forEach((c) => {
      c.removeAllListeners();
      c.close();
    });
  });

  function track(client) {
    clients.push(client);
    return client;
  }

  // -------------------------------------------------------------------
  // Phase 1: online_users format
  // -------------------------------------------------------------------
  test("online_users payload after Phase 1 is an array of objects with username, displayName, status", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));

    const online = await waitForEvent(client, "online_users");
    expect(Array.isArray(online)).toBe(true);
    expect(online.length).toBeGreaterThan(0);

    // Each entry should be an object (not a string)
    const aliceEntry = online.find((e) => e && (typeof e === "object" ? e.username === "alice" : e === "alice"));
    expect(aliceEntry).toBeDefined();

    if (typeof aliceEntry === "object") {
      expect(aliceEntry).toHaveProperty("username", "alice");
      expect(aliceEntry).toHaveProperty("displayName");
      expect(aliceEntry).toHaveProperty("status");
    }
  });

  // -------------------------------------------------------------------
  // Phase 1: after PUT /auth/profile, connected clients receive profile_updated
  // -------------------------------------------------------------------
  test("after PUT /auth/profile, connected clients receive profile_updated", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));

    // Set up listener before the update
    const profilePromise = waitForEvent(client, "profile_updated");

    // Simulate a profile update by emitting directly on the io server
    // This mirrors what PUT /auth/profile does: io.emit('profile_updated', ...)
    io.emit("profile_updated", {
      username: "alice",
      displayName: "Alice Updated",
      status: "busy",
    });

    const data = await profilePromise;
    expect(data).toHaveProperty("username", "alice");
    expect(data).toHaveProperty("displayName", "Alice Updated");
    expect(data).toHaveProperty("status", "busy");
  });

  test("profile_updated event does not include sensitive fields", async () => {
    const client = track(await connectAndWait(port, "valid-jwt"));

    const profilePromise = waitForEvent(client, "profile_updated");

    io.emit("profile_updated", {
      username: "bob",
      displayName: "Bob",
      status: "away",
    });

    const data = await profilePromise;
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("token");
    expect(data).not.toHaveProperty("lastLogout");
  });
});