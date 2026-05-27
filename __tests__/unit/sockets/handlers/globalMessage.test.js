jest.mock("../../../../models/Message");
jest.mock("../../../../models/User");

const Message = require("../../../../models/Message");
const User = require("../../../../models/User");
const createGlobalMessageHandler = require("../../../../sockets/handlers/globalMessage");

describe("globalMessage handler", () => {
  let io, socket, state, messageAllowed, handler;

  function createMocks() {
    io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    socket = { username: "alice", to: jest.fn().mockReturnThis(), emit: jest.fn() };
    state = {
      MAX_MESSAGE_LENGTH: 1000,
      typingTimeouts: new Map(),
    };
    messageAllowed = jest.fn().mockReturnValue(true);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    createMocks();
    Message.mockClear();

    // Mock User.findOne to return a user with a displayName
    User.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ username: "alice", displayName: "Alice" }),
    });

    // Make Message constructor return a mock document with a mock save()
    const mockDocument = {
      sender: "alice",
      message: "hello",
      isGlobal: true,
      clientId: "abc123",
      createdAt: new Date("2026-05-17T12:00:00Z"),
      save: jest.fn().mockResolvedValue(),
    };
    Message.mockImplementation(() => mockDocument);

    handler = createGlobalMessageHandler(io, socket, state, messageAllowed);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Rate limiter integration
  // -----------------------------------------------------------------------
  test("emits error_message with code and returns early when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    await handler({ message: "hello", clientId: "abc" });
    expect(socket.emit).toHaveBeenCalledWith("error_message", {
      error: expect.any(String),
      code: expect.any(String),
    });
  });

  test("does not call Message constructor when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    await handler({ message: "hello", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("does not emit to global room when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    await handler({ message: "hello", clientId: "abc" });
    expect(io.to).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------
  test("returns early when data.message is undefined", async () => {
    await handler({ clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message is not a string", async () => {
    await handler({ message: 123, clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message is an empty string", async () => {
    await handler({ message: "", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message is only whitespace", async () => {
    await handler({ message: "   ", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when message exceeds MAX_MESSAGE_LENGTH codepoints", async () => {
    const longMsg = "x".repeat(1001);
    await handler({ message: longMsg, clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("correctly counts codepoints for multi-byte characters (1001 emoji)", async () => {
    const emojiMsg = "😀".repeat(1001);
    await handler({ message: emojiMsg, clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // HTML sanitization
  // -----------------------------------------------------------------------
  test("strips HTML tags before saving", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "alert(1)", isGlobal: true, clientId: "abc", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "<script>alert(1)</script>", clientId: "abc" });
    expect(Message).toHaveBeenCalledWith(
      expect.objectContaining({ message: "alert(1)" })
    );
  });

  test("strips tags but preserves text content", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "bold", isGlobal: true, clientId: "abc", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "<b>bold</b>", clientId: "abc" });
    expect(Message).toHaveBeenCalledWith(
      expect.objectContaining({ message: "bold" })
    );
  });

  test("passes plain text through without modification", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "hello world", isGlobal: true, clientId: "abc", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hello world", clientId: "abc" });
    expect(Message).toHaveBeenCalledWith(
      expect.objectContaining({ message: "hello world" })
    );
  });

  // -----------------------------------------------------------------------
  // Typing state cleanup
  // -----------------------------------------------------------------------
  test("clears typing timeout for 'alice:global' when one exists", async () => {
    const timeoutSpy = jest.fn();
    const timeoutId = setTimeout(timeoutSpy, 4000);
    state.typingTimeouts.set("alice:global", timeoutId);

    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "hi", isGlobal: true, clientId: "abc", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hi", clientId: "abc" });

    // The old timeout should be cleared, so it should not fire
    jest.advanceTimersByTime(4000);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  test("deletes the 'alice:global' entry from typingTimeouts", async () => {
    state.typingTimeouts.set("alice:global", setTimeout(() => {}, 4000));

    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "hi", isGlobal: true, clientId: "abc", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hi", clientId: "abc" });
    expect(state.typingTimeouts.has("alice:global")).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Database write and broadcast
  // -----------------------------------------------------------------------
  test("creates a Message document with correct fields including senderDisplayName", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "hello", isGlobal: true, clientId: "client-1", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hello", clientId: "client-1" });

    expect(Message).toHaveBeenCalledWith({
      sender: "alice",
      message: "hello",
      isGlobal: true,
      clientId: "client-1",
      senderDisplayName: "Alice",
    });
  });

  test("calls save() on the created document", async () => {
    const saveMock = jest.fn().mockResolvedValue();
    Message.mockImplementation(() => ({ save: saveMock, sender: "alice", message: "hi", isGlobal: true, clientId: "abc", createdAt: new Date() }));

    await handler({ message: "hi", clientId: "abc" });
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test("broadcasts receive_global_message with senderDisplayName to the global room", async () => {
    const createdAt = new Date("2026-05-17T12:34:56Z");
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", message: "hello", isGlobal: true, clientId: "client-1", createdAt };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hello", clientId: "client-1" });

    expect(io.to).toHaveBeenCalledWith("global");
    expect(io.to("global").emit).toHaveBeenCalledWith("receive_global_message", {
      sender: "alice",
      message: "hello",
      createdAt,
      clientId: "client-1",
      senderDisplayName: "Alice",
    });
  });

  // -----------------------------------------------------------------------
  // Missing username guard
  // -----------------------------------------------------------------------
  test("returns early without doing anything when socket.username is falsy", async () => {
    socket.username = null;
    await handler({ message: "hello", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  test("does not crash when Message.save() throws", async () => {
    Message.mockImplementation(() => ({
      save: jest.fn().mockRejectedValue(new Error("DB error")),
      sender: "alice",
      message: "hi",
      isGlobal: true,
      clientId: "abc",
    }));

    await expect(handler({ message: "hi", clientId: "abc" })).resolves.toBeUndefined();
  });
});