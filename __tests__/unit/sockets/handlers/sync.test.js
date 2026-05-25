jest.mock("../../../../models/Message");

const Message = require("../../../../models/Message");
const createSyncHandler = require("../../../../sockets/handlers/sync");

describe("sync handler", () => {
  let io, socket, state, messageAllowed, handler;

  function createMocks() {
    io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    socket = { username: "alice", to: jest.fn().mockReturnThis(), emit: jest.fn() };
    state = { MAX_HISTORY_GLOBAL: 100 };
    messageAllowed = jest.fn().mockReturnValue(true);
  }

  function createChainableQuery(docs) {
    return {
      where: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(docs),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createMocks();
    Message.mockClear();
    handler = createSyncHandler(io, socket, state, messageAllowed);
  });

  test("emits error_message and ack when rate limited", async () => {
    messageAllowed.mockReturnValue(false);
    const ack = jest.fn();
    await handler({ lastSeenAt: new Date().toISOString() }, ack);
    expect(socket.emit).toHaveBeenCalledWith("error_message", { error: expect.any(String), code: expect.any(String) });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', message: 'rate_limited' }));
  });

  test("returns early when socket.username is falsy", async () => {
    socket.username = null;
    const ack = jest.fn();
    await handler({ lastSeenAt: new Date().toISOString() }, ack);
    expect(Message.find).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  test("private sync returns error ack when with and room are missing", async () => {
    const ack = jest.fn();
    await handler({ type: 'private' }, ack);
    expect(socket.emit).not.toHaveBeenCalledWith('receive_message', expect.anything());
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', message: 'Missing peer or room for private sync', code: 'missing_peer_or_room' }));
  });

  test("private sync returns error ack when room is invalid", async () => {
    const ack = jest.fn();
    await handler({ type: 'private', room: 'invalidroom' }, ack);
    expect(socket.emit).not.toHaveBeenCalledWith('receive_message', expect.anything());
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', message: 'Invalid room format for private sync', code: 'invalid_room' }));
  });

  test("emits missed private messages for valid peer and acks with count", async () => {
    const docs = [
      { sender: 'alice', receiver: 'bob', message: 'secret', createdAt: new Date('2026-05-02T00:00:00Z'), clientId: 'c1', _id: 'm1' },
      { sender: 'bob', receiver: 'alice', message: 'reply', createdAt: new Date('2026-05-03T00:00:00Z'), clientId: 'c2', _id: 'm2' }
    ];
    Message.find = jest.fn().mockReturnValue(createChainableQuery(docs));

    const ack = jest.fn();
    await handler({ type: 'private', with: 'bob' }, ack);

    expect(Message.find).toHaveBeenCalledWith({ isGlobal: false, $or: [{ sender: 'alice', receiver: 'bob' }, { sender: 'bob', receiver: 'alice' }] });
    expect(socket.emit).toHaveBeenCalledTimes(docs.length);
    expect(socket.emit).toHaveBeenCalledWith('receive_message', expect.objectContaining({ sender: 'alice', receiver: 'bob', message: 'secret', room: 'alice:bob' }));
    expect(socket.emit).toHaveBeenCalledWith('receive_message', expect.objectContaining({ sender: 'bob', receiver: 'alice', message: 'reply', room: 'alice:bob' }));
    expect(ack).toHaveBeenCalledWith({ status: 'ok', count: docs.length });
  });

  test("emits missed private messages for room-based sync and acks with count", async () => {
    const docs = [
      { sender: 'bob', receiver: 'alice', message: 'hey there', createdAt: new Date('2026-05-02T00:00:00Z'), clientId: 'c3', _id: 'm3' }
    ];
    Message.find = jest.fn().mockReturnValue(createChainableQuery(docs));

    const ack = jest.fn();
    await handler({ type: 'private', room: 'alice:bob' }, ack);

    expect(Message.find).toHaveBeenCalledWith({ isGlobal: false, $or: [{ sender: 'alice', receiver: 'bob' }, { sender: 'bob', receiver: 'alice' }] });
    expect(socket.emit).toHaveBeenCalledWith('receive_message', expect.objectContaining({ room: 'alice:bob' }));
    expect(ack).toHaveBeenCalledWith({ status: 'ok', count: docs.length });
  });

  test("emits missed messages for valid lastSeenAt and acks with count", async () => {
    const lastSeen = new Date('2026-05-01T00:00:00Z');
    const docs = [
      { sender: 'bob', message: 'later', createdAt: new Date('2026-05-02T00:00:00Z'), clientId: 'c1', _id: 'm1' },
      { sender: 'carol', message: 'soon', createdAt: new Date('2026-05-03T00:00:00Z'), clientId: 'c2', _id: 'm2' }
    ];
    Message.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(docs) });

    const ack = jest.fn();
    await handler({ lastSeenAt: lastSeen.toISOString() }, ack);

    expect(Message.find).toHaveBeenCalledWith({ isGlobal: true, createdAt: { $gt: lastSeen } });
    expect(socket.emit).toHaveBeenCalledTimes(docs.length);
    expect(socket.emit).toHaveBeenCalledWith('receive_global_message', expect.objectContaining({ sender: 'bob', message: 'later' }));
    expect(socket.emit).toHaveBeenCalledWith('receive_global_message', expect.objectContaining({ sender: 'carol', message: 'soon' }));
    expect(ack).toHaveBeenCalledWith({ status: 'ok', count: docs.length });
  });

  test("returns recent messages when lastSeenAt missing and acks with count", async () => {
    const docsDesc = [
      { sender: 'z', message: 'last', createdAt: new Date('2026-05-05T00:00:00Z'), clientId: 'c3', _id: 'm3' },
      { sender: 'y', message: 'first', createdAt: new Date('2026-05-04T00:00:00Z'), clientId: 'c4', _id: 'm4' }
    ];
    // Handler expects find() to return descending recent docs which it will reverse
    Message.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(docsDesc) });

    const ack = jest.fn();
    await handler({}, ack);

    expect(Message.find).toHaveBeenCalledWith({ isGlobal: true });
    expect(socket.emit).toHaveBeenCalledTimes(docsDesc.length);
    expect(ack).toHaveBeenCalledWith({ status: 'ok', count: docsDesc.length });
  });

  test("sends error and ack when DB throws", async () => {
    Message.find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockRejectedValue(new Error('DB error')) });
    const ack = jest.fn();
    await handler({}, ack);
    expect(socket.emit).toHaveBeenCalledWith('error_message', { error: 'Server error during global sync', code: 'global_sync_failed' });
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});
