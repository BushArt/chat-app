const createTypingHandlers = require("../../../../sockets/handlers/typing");

describe("typing handlers", () => {
  let io, socket, state;

  beforeEach(() => {
    jest.useFakeTimers();
    io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    socket = { username: "alice", to: jest.fn().mockReturnThis(), emit: jest.fn() };
    state = {
      typingTimeouts: new Map(),
      typingTimeoutsByUser: new Map(),
      MAX_TYPING_ENTRIES: 10000,
      TYPING_TIMEOUT: 4000,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("handleStartTyping", () => {
    test("emits user_typing to the room (excluding sender)", () => {
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });
      expect(socket.to).toHaveBeenCalledWith("global");
      expect(socket.to("global").emit).toHaveBeenCalledWith("user_typing", {
        username: "alice",
        room: "global",
      });
    });

    test("sets a timeout in typingTimeouts under key 'username:room'", () => {
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });
      expect(state.typingTimeouts.has("alice:global")).toBe(true);
      expect(state.typingTimeouts.get("alice:global")).toBeDefined();
    });

    test("clears any existing timeout for the same key before setting a new one", () => {
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });
      const firstTimeout = state.typingTimeouts.get("alice:global");

      handleStartTyping({ room: "global" });
      const secondTimeout = state.typingTimeouts.get("alice:global");

      expect(state.typingTimeouts.size).toBe(1);
      expect(secondTimeout).not.toBe(firstTimeout);
    });

    test("evicts oldest entry when typingTimeouts reaches MAX_TYPING_ENTRIES", () => {
      state.MAX_TYPING_ENTRIES = 2;
      // Prefill with MAX entries so the next add triggers eviction
      state.typingTimeouts.set("oldest:global", setTimeout(() => {}, 4000));
      state.typingTimeouts.set("middle:global", setTimeout(() => {}, 4000));
      state.typingTimeoutsByUser.set("oldest", new Set(["oldest:global"]));
      state.typingTimeoutsByUser.set("middle", new Set(["middle:global"]));
      expect(state.typingTimeouts.size).toBe(2);

      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });

      // Should keep MAX entries, evicting the oldest
      expect(state.typingTimeouts.size).toBe(state.MAX_TYPING_ENTRIES);
      expect(state.typingTimeouts.has("oldest:global")).toBe(false);
      expect(state.typingTimeouts.has("alice:global")).toBe(true);
    });

    test("does nothing when room is absent", () => {
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({});
      expect(state.typingTimeouts.size).toBe(0);
      expect(socket.to).not.toHaveBeenCalled();
    });

    test("does nothing when socket.username is falsy", () => {
      socket.username = null;
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });
      expect(state.typingTimeouts.size).toBe(0);
    });

    test("auto-expire timeout emits user_stopped_typing after TYPING_TIMEOUT ms", () => {
      const { handleStartTyping } = createTypingHandlers(io, socket, state);
      handleStartTyping({ room: "global" });

      jest.advanceTimersByTime(state.TYPING_TIMEOUT);

      expect(socket.to("global").emit).toHaveBeenCalledWith("user_stopped_typing", {
        username: "alice",
        room: "global",
      });
      expect(state.typingTimeouts.has("alice:global")).toBe(false);
    });
  });

  describe("handleStopTyping", () => {
    test("clears existing timeout and deletes the key", () => {
      const handlers = createTypingHandlers(io, socket, state);
      handlers.handleStartTyping({ room: "global" });
      expect(state.typingTimeouts.has("alice:global")).toBe(true);

      handlers.handleStopTyping({ room: "global" });

      expect(state.typingTimeouts.has("alice:global")).toBe(false);
    });

    test("emits user_stopped_typing to the room", () => {
      const { handleStopTyping } = createTypingHandlers(io, socket, state);
      handleStopTyping({ room: "global" });

      expect(socket.to("global").emit).toHaveBeenCalledWith("user_stopped_typing", {
        username: "alice",
        room: "global",
      });
    });

    test("does not throw when no existing timeout is registered", () => {
      const { handleStopTyping } = createTypingHandlers(io, socket, state);
      expect(() => handleStopTyping({ room: "global" })).not.toThrow();
    });

    test("does nothing when room is absent", () => {
      const { handleStopTyping } = createTypingHandlers(io, socket, state);
      handleStopTyping({});
      expect(socket.to).not.toHaveBeenCalled();
    });

    test("does nothing when socket.username is falsy", () => {
      socket.username = null;
      const { handleStopTyping } = createTypingHandlers(io, socket, state);
      handleStopTyping({ room: "global" });
      expect(socket.to).not.toHaveBeenCalled();
    });
  });
});