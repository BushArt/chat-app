jest.mock("../../../../models/Message");

const Message = require("../../../../models/Message");
const createPrivateMessageHandler = require("../../../../sockets/handlers/privateMessage");

describe("privateMessage handler", () => {
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
    jest.clearAllMocks();
    createMocks();
    Message.mockClear();

    const mockDocument = {
      sender: "alice",
      receiver: "bob",
      message: "hello",
      isGlobal: false,
      clientId: "abc123",
      room: "alice_bob",
      createdAt: new Date("2026-05-17T12:00:00Z"),
      save: jest.fn().mockResolvedValue(),
    };
    Message.mockImplementation(() => mockDocument);

    handler = createPrivateMessageHandler(io, socket, state, messageAllowed);
  });

  // -----------------------------------------------------------------------
  // Rate limiter integration
  // -----------------------------------------------------------------------
  test("emits error_message and returns early when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    await handler({ message: "hello", receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(socket.emit).toHaveBeenCalledWith("error_message", {
      error: expect.any(String),
    });
  });

  test("does not call Message constructor when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    await handler({ message: "hello", receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Input validation — message fields
  // -----------------------------------------------------------------------
  test("returns early when data.message is undefined", async () => {
    await handler({ receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message is not a string", async () => {
    await handler({ message: 123, receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message is empty", async () => {
    await handler({ message: "", receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.message exceeds MAX_MESSAGE_LENGTH", async () => {
    await handler({ message: "x".repeat(1001), receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Input validation — receiver
  // -----------------------------------------------------------------------
  test("returns early when data.receiver is absent", async () => {
    await handler({ message: "hello", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.receiver is not a string", async () => {
    await handler({ message: "hello", receiver: 123, room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Input validation — room
  // -----------------------------------------------------------------------
  test("returns early when data.room is absent", async () => {
    await handler({ message: "hello", receiver: "bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  test("returns early when data.room is not a string", async () => {
    await handler({ message: "hello", receiver: "bob", room: 123, clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Database write and broadcast
  // -----------------------------------------------------------------------
  test("creates a Message document with isGlobal: false and correct receiver", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", receiver: "bob", message: "hi", isGlobal: false, clientId: "c1", room: "alice_bob", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hi", receiver: "bob", room: "alice_bob", clientId: "c1" });

    expect(Message).toHaveBeenCalledWith({
      sender: "alice",
      receiver: "bob",
      message: "hi",
      isGlobal: false,
      clientId: "c1",
    });
  });

  test("emits receive_message to the specific room (not global)", async () => {
    const createdAt = new Date("2026-05-17T12:34:56Z");
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", receiver: "bob", message: "hello", isGlobal: false, clientId: "c1", room: "alice_bob", createdAt };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hello", receiver: "bob", room: "alice_bob", clientId: "c1" });

    expect(io.to).toHaveBeenCalledWith("alice_bob");
    expect(io.to("alice_bob").emit).toHaveBeenCalledWith("receive_message", {
      sender: "alice",
      message: "hello",
      createdAt,
      room: "alice_bob",
      clientId: "c1",
    });
  });

  test("does not emit to global room for private messages", async () => {
    const mockDoc = { save: jest.fn().mockResolvedValue(), sender: "alice", receiver: "bob", message: "hello", isGlobal: false, clientId: "c1", room: "alice_bob", createdAt: new Date() };
    Message.mockImplementation(() => mockDoc);

    await handler({ message: "hello", receiver: "bob", room: "alice_bob", clientId: "c1" });

    // Should not have called io.to with "global"
    const globalCalls = io.to.mock.calls.filter(([room]) => room === "global");
    expect(globalCalls.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Missing username guard
  // -----------------------------------------------------------------------
  test("returns early when socket.username is falsy", async () => {
    socket.username = null;
    await handler({ message: "hello", receiver: "bob", room: "alice_bob", clientId: "abc" });
    expect(Message).not.toHaveBeenCalled();
  });
});