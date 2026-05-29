const createPresenceHandlers = require("../../../../sockets/handlers/presence");

// Mock User model for updateOne calls in handleDisconnect
jest.mock("../../../../models/User", () => ({
  updateOne: jest.fn().mockResolvedValue()
}));

describe("presence handlers", () => {
  let io, socket, state, messageAllowed;

  beforeEach(() => {
    io = { emit: jest.fn() };
    socket = { username: "alice", id: "socket-1", join: jest.fn() };
    state = {
      onlineUsers: new Map(),
      typingTimeouts: new Map(),
      typingTimeoutsByUser: new Map(),
      getOnlineList: jest.fn().mockReturnValue(Promise.resolve([])),
    };
    messageAllowed = { cleanup: jest.fn() };
  });

  describe("handleJoinRoom", () => {
    test("does not call socket.join when roomId is falsy", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom(null);
      expect(socket.join).not.toHaveBeenCalled();
    });

    test("does not call socket.join when roomId is not a string", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom(123);
      expect(socket.join).not.toHaveBeenCalled();
    });

    test("does not call socket.join when roomId exceeds 100 characters", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("a".repeat(101));
      expect(socket.join).not.toHaveBeenCalled();
    });

    test("does not call socket.join when room is valid DM but doesn't contain socket's username", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("bob:carol");
      expect(socket.join).not.toHaveBeenCalled();
    });

    test("calls socket.join('global') when roomId is 'global'", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("global");
      expect(socket.join).toHaveBeenCalledWith("global");
    });

    test("calls socket.join with roomId when socket.username is the first part of a DM room", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("alice:bob");
      expect(socket.join).toHaveBeenCalledWith("alice:bob");
    });

    test("calls socket.join with roomId when socket.username is the second part of a DM room", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("bob:alice");
      expect(socket.join).toHaveBeenCalledWith("bob:alice");
    });
  });

  describe("handleDisconnect", () => {
    test("calls messageAllowed.cleanup()", async () => {
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      await handleDisconnect();
      expect(messageAllowed.cleanup).toHaveBeenCalledTimes(1);
    });

    test("removes socket from user's Set and does not broadcast when other sockets remain", async () => {
      const sockets = new Set(['socket-2', 'socket-3']);
      state.onlineUsers.set("alice", sockets);
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      await handleDisconnect();

      expect(state.onlineUsers.get("alice")).toBe(sockets);
      expect(sockets.has('socket-1')).toBe(false);
      expect(sockets.size).toBe(2);
      expect(io.emit).not.toHaveBeenCalled();
    });

    test("removes user and broadcasts online_users when last socket disconnects", async () => {
      const sockets = new Set(['socket-1']);
      state.onlineUsers.set("alice", sockets);
      state.getOnlineList = jest.fn().mockReturnValue(Promise.resolve([]));
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      await handleDisconnect();

      expect(state.onlineUsers.has("alice")).toBe(false);
      expect(io.emit).toHaveBeenCalledWith("online_users", []);
    });

    test("clears typingTimeouts entries where key starts with 'username:'", async () => {
      state.onlineUsers.set("alice", new Set(["socket-1"]));
      state.typingTimeouts.set("alice:global", 111);
      state.typingTimeouts.set("alice:bob:room", 222);
      state.typingTimeouts.set("bob:global", 333);
      state.typingTimeoutsByUser.set("alice", new Set(["alice:global", "alice:bob:room"]));

      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      await handleDisconnect();

      expect(state.typingTimeouts.has("alice:global")).toBe(false);
      expect(state.typingTimeouts.has("alice:bob:room")).toBe(false);
      expect(state.typingTimeouts.has("bob:global")).toBe(true);
      expect(state.typingTimeoutsByUser.has("alice")).toBe(false);
    });

    test("does not throw when socket.username is falsy", async () => {
      socket.username = null;
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      await expect(() => handleDisconnect()).not.toThrow();
    });
  });
});