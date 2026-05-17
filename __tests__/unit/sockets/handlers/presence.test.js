const createPresenceHandlers = require("../../../../sockets/handlers/presence");

describe("presence handlers", () => {
  let io, socket, state, messageAllowed;

  beforeEach(() => {
    io = { emit: jest.fn() };
    socket = { username: "alice", id: "socket-1", join: jest.fn() };
    state = {
      onlineUsers: new Map(),
      typingTimeouts: new Map(),
      getOnlineList: jest.fn().mockReturnValue([]),
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
      handleJoinRoom("bob_carol");
      expect(socket.join).not.toHaveBeenCalled();
    });

    test("calls socket.join('global') when roomId is 'global'", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("global");
      expect(socket.join).toHaveBeenCalledWith("global");
    });

    test("calls socket.join with roomId when socket.username is the first part of a DM room", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("alice_bob");
      expect(socket.join).toHaveBeenCalledWith("alice_bob");
    });

    test("calls socket.join with roomId when socket.username is the second part of a DM room", () => {
      const { handleJoinRoom } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleJoinRoom("bob_alice");
      expect(socket.join).toHaveBeenCalledWith("bob_alice");
    });
  });

  describe("handleDisconnect", () => {
    test("calls messageAllowed.cleanup()", () => {
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleDisconnect();
      expect(messageAllowed.cleanup).toHaveBeenCalledTimes(1);
    });

    test("decrements connection count for the username", () => {
      state.onlineUsers.set("alice", 2);
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleDisconnect();
      expect(state.onlineUsers.get("alice")).toBe(1);
    });

    test("does not remove user or broadcast when count drops to 1 or above", () => {
      state.onlineUsers.set("alice", 2);
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleDisconnect();

      expect(state.onlineUsers.has("alice")).toBe(true);
      expect(io.emit).not.toHaveBeenCalled();
    });

    test("removes user and broadcasts online_users when count drops to 0", () => {
      state.onlineUsers.set("alice", 1);
      state.getOnlineList = jest.fn().mockReturnValue([]);
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleDisconnect();

      expect(state.onlineUsers.has("alice")).toBe(false);
      expect(io.emit).toHaveBeenCalledWith("online_users", []);
    });

    test("clears typingTimeouts entries where key starts with 'username:'", () => {
      state.typingTimeouts.set("alice:global", 111);
      state.typingTimeouts.set("alice:bob_room", 222);
      state.typingTimeouts.set("bob:global", 333);

      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      handleDisconnect();

      expect(state.typingTimeouts.has("alice:global")).toBe(false);
      expect(state.typingTimeouts.has("alice:bob_room")).toBe(false);
      expect(state.typingTimeouts.has("bob:global")).toBe(true);
    });

    test("does not throw when socket.username is falsy", () => {
      socket.username = null;
      const { handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
      expect(() => handleDisconnect()).not.toThrow();
    });
  });
});