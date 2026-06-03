/**
 * Client-side tests for public/js/modules/socket.js
 *
 * socket.js registers all event handlers at module-load time via socket.on(...).
 * Strategy: mock global.io as a factory returning a mock socket, capture handler
 * callbacks via the mock's .on() calls, then test each handler by invoking it
 * directly with mock data and asserting on dependency calls.
 */

// ---- Mock dependency modules ----
const mockState = {
  getCurrentUser: jest.fn(() => 'alice'),
  getCurrentRoom: jest.fn(() => 'alice:bob'),
  getActiveTab: jest.fn(() => 'global'),
  getOnlineUsersMap: jest.fn(() => new Map()),
  getUnreadGlobal: jest.fn(() => 0),
  getUnreadPrivate: jest.fn(() => 0),
  hasOptimisticTimeout: jest.fn(() => false),
  deleteOptimisticTimeout: jest.fn(),
  setSendingGlobal: jest.fn(),
  setSendingPrivate: jest.fn(),
  setUnreadGlobal: jest.fn(),
  setUnreadPrivate: jest.fn(),
  setOnlineUsersFromList: jest.fn(),
  updateOnlineUser: jest.fn(),
  setCurrentDisplayName: jest.fn(),
  setCurrentStatus: jest.fn(),
  setCurrentAvatarUrl: jest.fn(),
  addTypingUser: jest.fn(),
  removeTypingUser: jest.fn(),
  hasBufferedMessages: jest.fn(() => false),
  touchBufferEntry: jest.fn(),
  getBufferSize: jest.fn(() => 0),
  getOldestBufferKey: jest.fn(() => 'oldest'),
  deleteBufferEntry: jest.fn(),
  createBufferEntry: jest.fn(),
  pushBufferedMessage: jest.fn(),
  clearAllOptimisticTimeouts: jest.fn(),
  clearTypingTimer: jest.fn(),
  setTypingTimer: jest.fn()
};

const mockUi = {
  appendMessage: jest.fn(),
  appendSystem: jest.fn(),
  renderTyping: jest.fn(),
  renderOnlineUsers: jest.fn(),
  setConnectionBanner: jest.fn(),
  getDom: jest.fn(() => ({
    badgeGlobal: { textContent: '', style: { display: 'none' } },
    badgePrivate: null,
    tabPrivate: { appendChild: jest.fn() }
  }))
};

const mockOptimistic = {
  resolveOptimistic: jest.fn(() => false)
};

jest.mock('../../public/js/modules/state.js', () => mockState);
jest.mock('../../public/js/modules/ui.js', () => mockUi);
jest.mock('../../public/js/modules/optimistic.js', () => mockOptimistic);
jest.mock('../../public/js/modules/utils.js', () => ({
  MAX_BUFFERED_ROOMS: 10,
  TYPING_DEBOUNCE_MS: 300
}));

// ---- Set up mock socket and io factory BEFORE importing socket.js ----
const mockSocket = {
  auth: { token: null },
  on: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn()
};

global.io = jest.fn(() => mockSocket);

// Now import — handlers register on mockSocket via mockSocket.on(...)
const socketModule = require('../../public/js/modules/socket.js');

// Extract handler callbacks from mockSocket.on calls
const handlers = {};
mockSocket.on.mock.calls.forEach(([event, fn]) => {
  handlers[event] = fn;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockState.getCurrentUser.mockReturnValue('alice');
  mockState.getCurrentRoom.mockReturnValue('alice:bob');
  mockState.getActiveTab.mockReturnValue('global');
  mockState.getUnreadGlobal.mockReturnValue(0);
  mockState.getUnreadPrivate.mockReturnValue(0);
  mockState.hasOptimisticTimeout.mockReturnValue(false);
  mockState.getOnlineUsersMap.mockReturnValue(new Map());
  mockState.hasBufferedMessages.mockReturnValue(false);
  mockState.getBufferSize.mockReturnValue(0);
  mockOptimistic.resolveOptimistic.mockReturnValue(false);
  mockUi.getDom.mockReturnValue({
    badgeGlobal: { textContent: '', style: { display: 'none' } },
    badgePrivate: null,
    tabPrivate: { appendChild: jest.fn() }
  });
});

// =========================================================================
// Event handler tests
// =========================================================================

describe('receive_global_message', () => {
  test('calls ui.appendMessage for received messages', () => {
    handlers.receive_global_message({
      sender: 'bob',
      message: 'hello',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockUi.appendMessage).toHaveBeenCalledWith(
      'global-messages', 'bob', 'hello', '2026-01-01T00:00:00Z', 'received',
      { attachment: undefined, senderAvatarUrl: null }
    );
  });

  test('calls ui.appendMessage for sent messages and clears sending flag', () => {
    handlers.receive_global_message({
      sender: 'alice',
      message: 'my msg',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockUi.appendMessage).toHaveBeenCalledWith(
      'global-messages', 'alice', 'my msg', '2026-01-01T00:00:00Z', 'sent',
      { attachment: undefined, senderAvatarUrl: null }
    );
    expect(mockState.setSendingGlobal).toHaveBeenCalledWith(false);
  });

  test('resolves optimistic message and skips appendMessage', () => {
    mockOptimistic.resolveOptimistic.mockReturnValue(true);

    handlers.receive_global_message({
      sender: 'alice',
      message: 'my msg',
      clientId: 'cid1',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockOptimistic.resolveOptimistic).toHaveBeenCalledWith('global', expect.anything());
    expect(mockUi.appendMessage).not.toHaveBeenCalled();
  });

  test('deletes optimistic timeout for sent messages with clientId', () => {
    mockState.hasOptimisticTimeout.mockReturnValue(true);

    handlers.receive_global_message({
      sender: 'alice',
      message: 'msg',
      clientId: 'cid1',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.deleteOptimisticTimeout).toHaveBeenCalledWith('cid1');
  });

  test('increments unread count when not on global tab and message is from another user', () => {
    mockState.getActiveTab.mockReturnValue('private');
    mockState.getUnreadGlobal.mockReturnValue(2);

    handlers.receive_global_message({
      sender: 'bob',
      message: 'hi',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.setUnreadGlobal).toHaveBeenCalledWith(3);
  });

  test('silently drops invalid data (no message string and no attachment url)', () => {
    handlers.receive_global_message({ sender: 'bob' });
    handlers.receive_global_message(null);
    handlers.receive_global_message({ message: 123 });

    expect(mockUi.appendMessage).not.toHaveBeenCalled();
  });

  test('accepts attachment-only message (empty message but has attachment url)', () => {
    handlers.receive_global_message({
      sender: 'bob',
      message: '',
      attachment: { url: 'https://cdn.example.com/img.png' },
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockUi.appendMessage).toHaveBeenCalled();
  });
});

describe('receive_message', () => {
  test('calls ui.appendMessage when room matches current room', () => {
    handlers.receive_message({
      sender: 'bob',
      message: 'private hi',
      room: 'alice:bob',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockUi.appendMessage).toHaveBeenCalledWith(
      'private-messages', 'bob', 'private hi', '2026-01-01T00:00:00Z', 'received',
      { attachment: undefined, senderAvatarUrl: null }
    );
  });

  test('buffers message when room does not match current room', () => {
    handlers.receive_message({
      sender: 'charlie',
      message: 'hey',
      room: 'alice:charlie',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.createBufferEntry).toHaveBeenCalledWith('alice:charlie');
    expect(mockState.pushBufferedMessage).toHaveBeenCalledWith('alice:charlie', expect.anything());
    expect(mockState.setUnreadPrivate).toHaveBeenCalledWith(1);
  });

  test('touches existing buffer entry instead of creating new one', () => {
    mockState.hasBufferedMessages.mockReturnValue(true);

    handlers.receive_message({
      sender: 'charlie',
      message: 'another',
      room: 'alice:charlie',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.touchBufferEntry).toHaveBeenCalledWith('alice:charlie');
    expect(mockState.createBufferEntry).not.toHaveBeenCalled();
  });

  test('evicts oldest buffer when at capacity', () => {
    mockState.getBufferSize.mockReturnValue(10); // at MAX_BUFFERED_ROOMS

    handlers.receive_message({
      sender: 'charlie',
      message: 'hey',
      room: 'alice:charlie',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.getOldestBufferKey).toHaveBeenCalled();
    expect(mockState.deleteBufferEntry).toHaveBeenCalledWith('oldest');
    expect(mockState.createBufferEntry).toHaveBeenCalledWith('alice:charlie');
  });

  test('clears sending flag for own message in different room', () => {
    handlers.receive_message({
      sender: 'alice',
      message: 'my msg',
      room: 'alice:charlie',
      createdAt: '2026-01-01T00:00:00Z'
    });

    expect(mockState.setSendingPrivate).toHaveBeenCalledWith(false);
  });
});

describe('user_typing', () => {
  test('adds typing user for global room', () => {
    handlers.user_typing({ username: 'bob', room: 'global' });

    expect(mockState.addTypingUser).toHaveBeenCalledWith('global', 'bob');
    expect(mockUi.renderTyping).toHaveBeenCalledWith('global');
  });

  test('adds typing user for current private room', () => {
    handlers.user_typing({ username: 'bob', room: 'alice:bob' });

    expect(mockState.addTypingUser).toHaveBeenCalledWith('private', 'bob');
    expect(mockUi.renderTyping).toHaveBeenCalledWith('private');
  });

  test('ignores typing from current user', () => {
    handlers.user_typing({ username: 'alice', room: 'global' });

    expect(mockState.addTypingUser).not.toHaveBeenCalled();
  });
});

describe('user_stopped_typing', () => {
  test('removes typing user for global room', () => {
    handlers.user_stopped_typing({ username: 'bob', room: 'global' });

    expect(mockState.removeTypingUser).toHaveBeenCalledWith('global', 'bob');
    expect(mockUi.renderTyping).toHaveBeenCalledWith('global');
  });

  test('removes typing user for current private room', () => {
    handlers.user_stopped_typing({ username: 'bob', room: 'alice:bob' });

    expect(mockState.removeTypingUser).toHaveBeenCalledWith('private', 'bob');
    expect(mockUi.renderTyping).toHaveBeenCalledWith('private');
  });

  test('ignores event without username', () => {
    handlers.user_stopped_typing({ room: 'global' });

    expect(mockState.removeTypingUser).not.toHaveBeenCalled();
  });
});

describe('error_message', () => {
  test('appends system warning and clears sending flags', () => {
    handlers.error_message({ error: 'Rate limited' });

    expect(mockUi.appendSystem).toHaveBeenCalledWith('global-messages', 'Warning: Rate limited');
    expect(mockState.setSendingGlobal).toHaveBeenCalledWith(false);
    expect(mockState.setSendingPrivate).toHaveBeenCalledWith(false);
  });

  test('uses default message when no error text provided', () => {
    handlers.error_message({});

    expect(mockUi.appendSystem).toHaveBeenCalledWith(
      'global-messages',
      'Warning: Message could not be sent.'
    );
  });
});

describe('online_users', () => {
  test('updates state and re-renders user list', () => {
    const users = [{ username: 'bob', displayName: 'Bob', status: 'online' }];
    handlers.online_users(users);

    expect(mockState.setOnlineUsersFromList).toHaveBeenCalledWith(users);
    expect(mockUi.renderOnlineUsers).toHaveBeenCalledWith(users);
  });
});

describe('profile_updated', () => {
  test('updates online user and re-renders list', () => {
    mockState.getOnlineUsersMap.mockReturnValue(new Map([
      ['bob', { username: 'bob', displayName: 'Bob', status: 'online', avatarUrl: null }]
    ]));

    handlers.profile_updated({
      username: 'bob',
      displayName: 'Bobby',
      status: 'away',
      avatarUrl: 'https://cdn.example.com/bob.png'
    });

    expect(mockState.updateOnlineUser).toHaveBeenCalledWith('bob', 'Bobby', 'away', 'https://cdn.example.com/bob.png');
    expect(mockUi.renderOnlineUsers).toHaveBeenCalled();
  });

  test('updates own profile when current user matches', () => {
    mockState.getOnlineUsersMap.mockReturnValue(new Map());

    handlers.profile_updated({
      username: 'alice',
      displayName: 'Alice Chen',
      status: 'busy',
      avatarUrl: 'https://cdn.example.com/alice.png'
    });

    expect(mockState.setCurrentDisplayName).toHaveBeenCalledWith('Alice Chen');
    expect(mockState.setCurrentStatus).toHaveBeenCalledWith('busy');
    expect(mockState.setCurrentAvatarUrl).toHaveBeenCalledWith('https://cdn.example.com/alice.png');
  });

  test('ignores event without username', () => {
    handlers.profile_updated({});
    handlers.profile_updated(null);

    expect(mockState.updateOnlineUser).not.toHaveBeenCalled();
  });
});

describe('connect', () => {
  test('clears connection banner', () => {
    handlers.connect();
    expect(mockUi.setConnectionBanner).toHaveBeenCalledWith('');
  });
});

describe('disconnect', () => {
  test('shows disconnect banner and clears state', () => {
    handlers.disconnect();

    expect(mockUi.setConnectionBanner).toHaveBeenCalledWith('Disconnected. Reconnecting...');
    expect(mockState.setSendingGlobal).toHaveBeenCalledWith(false);
    expect(mockState.setSendingPrivate).toHaveBeenCalledWith(false);
    expect(mockState.clearAllOptimisticTimeouts).toHaveBeenCalled();
  });
});

describe('connect_error', () => {
  test('shows error banner and clears sending flags', () => {
    handlers.connect_error({ message: 'timeout' });

    expect(mockUi.setConnectionBanner).toHaveBeenCalledWith('Connection issue: timeout');
    expect(mockState.setSendingGlobal).toHaveBeenCalledWith(false);
    expect(mockState.setSendingPrivate).toHaveBeenCalledWith(false);
  });
});

describe('reconnect', () => {
  test('emits sync with null lastSeenAt when no DOM data available', () => {
    handlers.reconnect();

    expect(mockSocket.emit).toHaveBeenCalledWith('sync', { lastSeenAt: null });
  });
});

// =========================================================================
// Exported function tests
// =========================================================================

describe('exported emit functions', () => {
  test('connect sets auth token and calls socket.connect', () => {
    socketModule.connect('jwt-token-123');

    expect(mockSocket.auth).toEqual({ token: 'jwt-token-123' });
    expect(mockSocket.connect).toHaveBeenCalled();
  });

  test('disconnect clears auth token and calls socket.disconnect', () => {
    socketModule.disconnect();

    expect(mockSocket.auth).toEqual({ token: null });
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  test('emitJoinRoom emits join_room event', () => {
    socketModule.emitJoinRoom('global');

    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', 'global');
  });

  test('emitSendGlobalMessage emits send_global_message event', () => {
    const data = { message: 'hello', clientId: 'cid1' };
    socketModule.emitSendGlobalMessage(data);

    expect(mockSocket.emit).toHaveBeenCalledWith('send_global_message', data);
  });

  test('emitSendPrivateMessage emits send_message event', () => {
    const data = { message: 'hi', room: 'alice:bob', clientId: 'cid2' };
    socketModule.emitSendPrivateMessage(data);

    expect(mockSocket.emit).toHaveBeenCalledWith('send_message', data);
  });

  test('emitStopTyping emits stop_typing and clears timer', () => {
    socketModule.emitStopTyping('global');

    expect(mockSocket.emit).toHaveBeenCalledWith('stop_typing', { room: 'global' });
    expect(mockState.clearTypingTimer).toHaveBeenCalledWith('global');
  });

  test('emitStopTyping does nothing when room is falsy', () => {
    socketModule.emitStopTyping('');
    socketModule.emitStopTyping(null);

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});