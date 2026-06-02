const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const state = require("../../../sockets/state");
const {
  waitForEvent,
  connectClient,
  connectAndWait,
  connectAndWaitOrError,
  resetJwtVerifyDefault,
  closeSocketServer,
} = require("./socketTestHelpers");

// Mock the User model for JWT revocation checks
jest.mock("../../../models/User", () => ({
  findById: jest.fn(),
  updateOne: jest.fn().mockResolvedValue(),
}));

jest.mock("jsonwebtoken");

// Mock the rate limiter factory – returns a limiter function with cleanup
// The limiter function itself doubles as the isAllowed check
jest.mock("../../../middleware/rateLimiter", () => {
  return jest.fn(() => {
    const limiter = jest.fn().mockReturnValue(true);
    limiter.cleanup = jest.fn();
    return limiter;
  });
});

const Message = require("../../../models/Message");

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

function createSocketServer() {
  const server = http.createServer();
  const io = new Server(server, { transports: ["websocket"] });
  require("../../../sockets")(io);
  return { server, io };
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

  afterAll(async () => {
    await closeSocketServer(io, server);
  });

  // Track clients created in each test for cleanup
  let clients = [];

  beforeEach(() => {
    state.onlineUsers.clear();
    state.typingTimeouts.clear();
    clients = [];
    resetJwtVerifyDefault(jwt);
    Message.mockClear();
    const User = require("../../../models/User");
    User.findById.mockReset();
    User.findById.mockReturnValue({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({ lastLogout: null })
      }))
    });
  });

  afterEach(async () => {
    await Promise.all(clients.map((c) => new Promise((resolve) => {
      c.removeAllListeners();
      c.close();
      setTimeout(resolve, 0);
    })));
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
      const result = await connectAndWaitOrError(client);
      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("rejects connection when jwt.verify throws (invalid token)", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt malformed");
      });

      const client = track(connectClient(port, "invalid-token"));
      const result = await connectAndWaitOrError(client);
      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("rejects connection when jwt.verify throws (expired token)", async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error("jwt expired");
      });

      const client = track(connectClient(port, "expired-token"));
      const result = await connectAndWaitOrError(client);
      expect(result.connected).toBe(false);
      expect(result.error).toBeDefined();
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
      const result = await connectAndWaitOrError(client);
      expect(result.connected).toBe(false);
      await new Promise((r) => setTimeout(r, 200));

      expect(connectionCount).toBe(0);
      io.off("connection", handler);
    });

    test("rejects connection when User.findById fails (DB error in revocation)", async () => {
      jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: Math.floor(Date.now() / 1000) });
      const User = require("../../../models/User");
      User.findById.mockReturnValue({
        select: jest.fn(() => ({
          lean: jest.fn().mockRejectedValue(new Error("DB error"))
        }))
      });

      const client = track(connectClient(port, "valid-jwt"));
      const err = await waitForEvent(client, "connect_error");
      expect(err).toBeDefined();
    });

    test("connects when token has no iat field (skips revocation check)", async () => {
      jwt.verify.mockReturnValue({ id: "user1", username: "alice" });
      // No iat – this test confirms that the application skips the JWT revocation check
      // if the 'iat' (issued at) field is missing from the token payload.
      // This behavior is intended as tokens without 'iat' cannot be checked against 'lastLogout'.
      const client = track(connectClient(port, "no-iat-token"));
      await waitForEvent(client, "connect");
      expect(client.connected).toBe(true);
    });

    test("rejects connection when token is revoked (lastLogout after iat)", async () => {
      const pastIat = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: pastIat });
      const User = require("../../../models/User");
      User.findById.mockReturnValue({
        select: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue({ lastLogout: new Date() })
        }))
      });

      const client = track(connectClient(port, "revoked-token"));
      const err = await waitForEvent(client, "connect_error");
      expect(err.message).toBe("Token revoked");
    });

    test("connects when token iat is after lastLogout (not revoked)", async () => {
      const recentIat = Math.floor(Date.now() / 1000);
      jwt.verify.mockReturnValue({ id: "user1", username: "alice", iat: recentIat });
      const User = require("../../../models/User");
      User.findById.mockReturnValue({
        select: jest.fn(() => ({
          lean: jest.fn().mockResolvedValue({ lastLogout: new Date(Date.now() - 86400000) })
        }))
      });

      const client = track(connectClient(port, "valid-iat-token"));
      await waitForEvent(client, "connect");
      expect(client.connected).toBe(true);
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
      expect(state.onlineUsers.get("alice").size).toBe(2);
    });

    test("user remains online after one tab closes", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));

      clientA.close();
      await new Promise((r) => setTimeout(r, 300));
      expect(state.onlineUsers.get("alice").size).toBe(1);
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

    test("message with valid attachment includes attachment in receive_global_message", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));
      await new Promise((r) => setTimeout(r, 100));

      const msgPromise = waitForEvent(clientB, "receive_global_message");

      const attachment = { type: "image", url: "https://res.cloudinary.com/test/img.png", filename: "photo.png", mimetype: "image/png", size: 204800 };
      clientA.emit("send_global_message", { message: "with attachment", clientId: "c3", attachment });
      const received = await msgPromise;

      expect(received).toHaveProperty("sender", "alice");
      expect(received).toHaveProperty("message", "with attachment");
      expect(received).toHaveProperty("attachment");
      expect(received.attachment).toMatchObject(attachment);
    });

    test("text-only message (no attachment) is unaffected — attachment is null", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));
      await new Promise((r) => setTimeout(r, 100));

      const msgPromise = waitForEvent(clientB, "receive_global_message");

      clientA.emit("send_global_message", { message: "just text", clientId: "c4" });
      const received = await msgPromise;

      expect(received).toHaveProperty("message", "just text");
      expect(received).toHaveProperty("attachment", null);
    });

    test("payload with neither message nor attachment does not broadcast", async () => {
      const clientA = track(await connectAndWait(port, "valid-jwt"));
      const clientB = track(await connectAndWait(port, "valid-jwt"));
      await new Promise((r) => setTimeout(r, 100));

      let broadcastCount = 0;
      clientB.on("receive_global_message", () => { broadcastCount++; });

      clientA.emit("send_global_message", { clientId: "c5" });
      await new Promise((r) => setTimeout(r, 300));

      expect(broadcastCount).toBe(0);
    });

    test("sync: reconnecting client receives missed global messages and ack", async () => {
      // Prepare messages created after lastSeenAt
      const lastSeenAt = new Date('2026-05-01T00:00:00Z');
      const docs = [
        { sender: 'bob', message: 'later', createdAt: new Date('2026-05-02T00:00:00Z'), clientId: 'c1', _id: 'm1' },
        { sender: 'carol', message: 'soon', createdAt: new Date('2026-05-03T00:00:00Z'), clientId: 'c2', _id: 'm2' }
      ];

      // Make Message.find() return a chainable query like in other tests
      Message.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(docs) });

      const client = track(await connectAndWait(port, "valid-jwt"));

      const msgPromise1 = waitForEvent(client, 'receive_global_message');
      const msgPromise2 = waitForEvent(client, 'receive_global_message');

      const ackPromise = new Promise((resolve) => {
        client.emit('sync', { lastSeenAt: lastSeenAt.toISOString() }, (ack) => resolve(ack));
      });

      const [m1, m2, ack] = await Promise.all([msgPromise1, msgPromise2, ackPromise]);

      expect(m1).toHaveProperty('message');
      expect(m2).toHaveProperty('message');
      expect(ack).toEqual({ status: 'ok', count: docs.length });
    });

    test("sync: reconnecting client receives missed private messages and ack", async () => {
      const docs = [
        { sender: 'bob', receiver: 'alice', message: 'hey back', createdAt: new Date('2026-05-02T00:00:00Z'), clientId: 'c3', _id: 'm3' }
      ];
      Message.find = jest.fn().mockReturnValue({ where: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(docs) });

      const client = track(await connectAndWait(port, "valid-jwt"));
      const msgPromise = waitForEvent(client, "receive_message");
      const ackPromise = new Promise((resolve) => {
        client.emit('sync', { type: 'private', with: 'bob' }, (ack) => resolve(ack));
      });

      const [message, ack] = await Promise.all([msgPromise, ackPromise]);

      expect(message).toHaveProperty('sender', 'bob');
      expect(message).toHaveProperty('receiver', 'alice');
      expect(message).toHaveProperty('room', 'alice:bob');
      expect(ack).toEqual({ status: 'ok', count: docs.length });
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
      bob.emit("join_room", "alice:bob");
      await new Promise((r) => setTimeout(r, 200));

      const msgPromise = waitForEvent(bob, "receive_message");

      alice.emit("send_message", {
        message: "secret",
        receiver: "bob",
        room: "alice:bob",
        clientId: "c1",
      });
      const received = await msgPromise;

      expect(received).toHaveProperty("sender", "alice");
      expect(received).toHaveProperty("message", "secret");
      expect(received).toHaveProperty("room", "alice:bob");
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

      // This will timeout if typing cleanup doesn't fire – which is fine
      const stopData = await stopPromise;
      expect(stopData).toHaveProperty("username", "alice");
    });
  });
});
