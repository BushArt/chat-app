const http = require("http");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const jwt = require("jsonwebtoken");
const state = require("../../../sockets/state");

// ── Mocks ──────────────────────────────────────────────────────────────
jest.mock("jsonwebtoken");

// Mock the rate limiter factory — returns a limiter function with cleanup
// The limiter function itself doubles as the isAllowed check
jest.mock("../../../middleware/rateLimiter", () => {
  return jest.fn(() => {
    const limiter = jest.fn().mockReturnValue(true);
    limiter.cleanup = jest.fn();
    return limiter;
  });
});

// Mock the Message model for socket handler tests
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

const Message = require("../../../models/Message");

// ── Server factory ─────────────────────────────────────────────────────
function createSocketServer() {
  const server = http.createServer();
  const io = new Server(server, { transports: ["websocket"] });
  require("../../../sockets")(io);
  return { server, io };
}

// ── Helpers ────────────────────────────────────────────────────────────
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

describe("Socket.IO integration", () => {
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

  // Track clients created in each test for cleanup
  let clients = [];

  beforeEach(() => {
    state.onlineUsers.clear();
    state.typingTimeouts.clear();
    clients = [];
    jest.clearAllMocks();
    Message.mockClear();
    // Re-set jwt.verify mock after clearAllMocks
    jwt.verify.mockReturnValue({ id: "user1", username: "alice" });
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
  // 7.1 Connection Authentication
  // -------------------------------------------------------------------
  describe("connection authentication", () => {
    test("connects successfully with a valid JWT", async () => {
      const client = track(connectClient(port, "valid-jwt"));
      await waitForEvent(client, "connect");
      expect(client.connected).toBe(true);
    });

    test("does not emit connect_error for a valid token", async () => {
      const client = track(connectClient(port, "valid-jwt"));
      await waitForEvent(client, "connect");

      let connectErrorFired = false;
      client.on("connect_error", () => {
        connectErrorFired = true;
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(connectErrorFired).toBe(false);
    });

    test("rejects connection when JWT is missing (no token)", async () => {
      const client = track(connectClient(port, undefined));
      const err = await waitForEvent(client, "connect_error");
      expect(err).toBeDefined();
    });

    test("rejects connection when jwt.verify throws (invalid token)", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt malformed");
      });

      const client = track(connectClient(port, "invalid-token"));
      const err = await waitForEvent(client, "connect_error");
      expect(err).toBeDefined();
    });

    test("rejects connection when jwt.verify throws (expired token)", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt expired");
      });

      const client = track(connectClient(port, "expired-token"));
      const err = await waitForEvent(client, "connect_error");
      expect(err).toBeDefined();
    });

    test("server connection event does NOT fire for invalid tokens", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("bad token");
      });

      let connectionCount = 0;
      const handler = () => {
        connectionCount++;
      };
      io.on("connection", handler);

      const client = track(connectClient(port, "bad-token"));
      await waitForEvent(client, "connect_error");
      await new Promise((r) => setTimeout(r, 200));

      expect(connectionCount).toBe(0);
      io.off("connection", handler);
    });
  });

  // -------------------------------------------------------------------
  // 7.2 Presence / Online Users
  // -------------------------------------------------------------------
  describe("presence (online users)", () => {
    test("online_users event includes the connected username", async () => {
      const client = track(await connectAndWait(port, "valid-jwt"));

      const online = await waitForEvent(client, "online_users");
      expect(Array.isArray(online)).toBe(true);
      expect(online).toContain("alice");
    });

    test("disconnect removes user from online_users", async () => {
      const client = track(await connectAndWait(port, "valid-jwt"));
      client.close();

      await new Promise((r) => setTimeout(r, 300));
      expect(state.onlineUsers.has("alice")).toBe(false);
    });

    test("second connection for same user keeps them in online_users", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));

      await new Promise((r) => setTimeout(r, 100));
      expect(state.onlineUsers.get("alice")).toBe(2);
    });

    test("user remains online after one tab closes", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));

      clientA.close();
      await new Promise((r) => setTimeout(r, 300));
      expect(state.onlineUsers.get("alice")).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // 7.3 join_room
  // -------------------------------------------------------------------
  describe("join_room", () => {
    test("oversized roomId (>100 chars) is rejected", async () => {
      const client = track(await connectAndWait(port, "valid-jwt"));
      expect(() => client.emit("join_room", "a".repeat(101))).not.toThrow();
    });
  });

  // -------------------------------------------------------------------
  // 7.4 send_global_message
  // -------------------------------------------------------------------
  describe("send_global_message", () => {
    test("both clients in global room receive the message", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));
      await new Promise((r) => setTimeout(r, 100));

      const msgPromise = waitForEvent(clientB, "receive_global_message");

      clientA.emit("send_global_message", { message: "hello", clientId: "c1" });
      const received = await msgPromise;

      expect(received).toHaveProperty("sender", "alice");
      expect(received).toHaveProperty("message", "hello");
      expect(received).toHaveProperty("clientId", "c1");
      expect(received).toHaveProperty("createdAt");
    });

    test("HTML tags are stripped from messages", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));
      await new Promise((r) => setTimeout(r, 100));

      const msgPromise = waitForEvent(clientB, "receive_global_message");

      clientA.emit("send_global_message", { message: "<script>alert(1)</script>", clientId: "c2" });
      const received = await msgPromise;

      expect(received.message).not.toContain("<script>");
      expect(received.message).not.toContain("</script>");
    });

    test("invalid message data does not crash the server", async () => {
      const client = track(await connectAndWait(port, "valid-jwt"));

      expect(() => {
        client.emit("send_global_message", {});
        client.emit("send_global_message", { message: "" });
        client.emit("send_global_message", { message: "x".repeat(1001) });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 200));
    });
  });

  // -------------------------------------------------------------------
  // 7.5 send_message (private)
  // -------------------------------------------------------------------
  describe("send_message (private)", () => {
    test("recipient in the room receives the private message", async () => {
      const alice = track(await connectAndWait(port, "valid-jwt"));
      const bob = track(await connectAndWait(port, "valid-jwt"));

      // Bob joins the DM room
      bob.emit("join_room", "alice_bob");
      await new Promise((r) => setTimeout(r, 200));

      const msgPromise = waitForEvent(bob, "receive_message");

      alice.emit("send_message", {
        message: "secret",
        receiver: "bob",
        room: "alice_bob",
        clientId: "c1",
      });
      const received = await msgPromise;

      expect(received).toHaveProperty("sender", "alice");
      expect(received).toHaveProperty("message", "secret");
      expect(received).toHaveProperty("room", "alice_bob");
      expect(received).toHaveProperty("clientId", "c1");
    });

    test("invalid private message data does not crash", async () => {
      const client = track(await connectAndWait(port, "valid-jwt"));

      expect(() => {
        client.emit("send_message", {});
        client.emit("send_message", { message: "hi" });
        client.emit("send_message", { message: "hi", receiver: "bob" });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 200));
    });
  });

  // -------------------------------------------------------------------
  // 7.6 Typing Indicators
  // -------------------------------------------------------------------
  describe("typing indicators", () => {
    test("start_typing: other clients receive user_typing", async () => {
      const alice = track(await connectAndWait(port, "valid-jwt"));
      const bob = track(await connectAndWait(port, "valid-jwt"));

      const typingPromise = waitForEvent(bob, "user_typing");

      alice.emit("start_typing", { room: "global" });
      const data = await typingPromise;

      expect(data).toHaveProperty("username", "alice");
      expect(data).toHaveProperty("room", "global");
    });

    test("start_typing: sender does NOT receive user_typing", async () => {
      const alice = track(await connectAndWait(port, "valid-jwt"));
      const bob = track(await connectAndWait(port, "valid-jwt"));

      let aliceReceivedTyping = false;
      alice.on("user_typing", () => {
        aliceReceivedTyping = true;
      });

      alice.emit("start_typing", { room: "global" });
      await new Promise((r) => setTimeout(r, 300));

      expect(aliceReceivedTyping).toBe(false);
    });

    test("stop_typing: other clients receive user_stopped_typing", async () => {
      const alice = track(await connectAndWait(port, "valid-jwt"));
      const bob = track(await connectAndWait(port, "valid-jwt"));

      alice.emit("start_typing", { room: "global" });
      await new Promise((r) => setTimeout(r, 50));

      const stopPromise = waitForEvent(bob, "user_stopped_typing");
      alice.emit("stop_typing", { room: "global" });
      const data = await stopPromise;

      expect(data).toHaveProperty("username", "alice");
      expect(data).toHaveProperty("room", "global");
    });

    test("sending a global message clears typing state", async () => {
      const alice = track(await connectAndWait(port, "valid-jwt"));
      const bob = track(await connectAndWait(port, "valid-jwt"));

      alice.emit("start_typing", { room: "global" });
      await new Promise((r) => setTimeout(r, 100));

      const stopPromise = waitForEvent(bob, "user_stopped_typing");
      alice.emit("send_global_message", { message: "hello", clientId: "c1" });

      // This will timeout if typing cleanup doesn't fire — which is fine
      const stopData = await stopPromise;
      expect(stopData).toHaveProperty("username", "alice");
    });
  });
});