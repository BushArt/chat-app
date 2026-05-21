import * as state from '../../../public/js/modules/state.js';

beforeEach(() => {
  // Reset all state before each test
  state.resetAllState();
});

describe('FEATURE_FLAGS', () => {
  test('exports expected flags', () => {
    expect(state.FEATURE_FLAGS).toEqual({
      darkMode: true,
      optimisticSend: true,
      jumpToLatest: true
    });
  });
});

describe('session state getters/setters', () => {
  test('getCurrentUser / setCurrentUser', () => {
    expect(state.getCurrentUser()).toBeNull();
    state.setCurrentUser('alice');
    expect(state.getCurrentUser()).toBe('alice');
  });

  test('getCurrentToken / setCurrentToken', () => {
    expect(state.getCurrentToken()).toBeNull();
    state.setCurrentToken('token123');
    expect(state.getCurrentToken()).toBe('token123');
  });

  test('getCurrentRoom / setCurrentRoom', () => {
    expect(state.getCurrentRoom()).toBeNull();
    state.setCurrentRoom('room1');
    expect(state.getCurrentRoom()).toBe('room1');
  });

  test('getCurrentRecipient / setCurrentRecipient', () => {
    expect(state.getCurrentRecipient()).toBeNull();
    state.setCurrentRecipient('bob');
    expect(state.getCurrentRecipient()).toBe('bob');
  });
});

describe('UI state getters/setters', () => {
  test('getActiveTab defaults to global', () => {
    expect(state.getActiveTab()).toBe('global');
  });

  test('setActiveTab updates tab', () => {
    state.setActiveTab('private');
    expect(state.getActiveTab()).toBe('private');
  });

  test('unread counts default to 0', () => {
    expect(state.getUnreadGlobal()).toBe(0);
    expect(state.getUnreadPrivate()).toBe(0);
  });

  test('setUnreadGlobal / setUnreadPrivate', () => {
    state.setUnreadGlobal(5);
    expect(state.getUnreadGlobal()).toBe(5);
    state.setUnreadPrivate(3);
    expect(state.getUnreadPrivate()).toBe(3);
  });
});

describe('sending flags', () => {
  test('isSendingGlobal / isSendingPrivate default to false', () => {
    expect(state.isSendingGlobal()).toBe(false);
    expect(state.isSendingPrivate()).toBe(false);
  });

  test('setSendingGlobal / setSendingPrivate', () => {
    state.setSendingGlobal(true);
    expect(state.isSendingGlobal()).toBe(true);
    state.setSendingPrivate(true);
    expect(state.isSendingPrivate()).toBe(true);
  });
});

describe('time format', () => {
  test('getTimeFormat defaults to relative', () => {
    expect(state.getTimeFormat()).toBe('relative');
  });

  test('setTimeFormat', () => {
    state.setTimeFormat('exact');
    expect(state.getTimeFormat()).toBe('exact');
  });
});

describe('typing state', () => {
  test('addTypingUser and getTypingUsers', () => {
    state.addTypingUser('global', 'alice');
    expect(state.getTypingUsers('global')).toEqual(['alice']);
    expect(state.getTypingUsers('private')).toEqual([]);
  });

  test('addTypingUser multiple users', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('global', 'bob');
    expect(state.getTypingUsers('global')).toEqual(['alice', 'bob']);
  });

  test('addTypingUser deduplicates', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('global', 'alice');
    expect(state.getTypingUsers('global')).toEqual(['alice']);
  });

  test('removeTypingUser', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('global', 'bob');
    state.removeTypingUser('global', 'alice');
    expect(state.getTypingUsers('global')).toEqual(['bob']);
  });

  test('clearTypingState', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('private', 'bob');
    state.clearTypingState('global');
    expect(state.getTypingUsers('global')).toEqual([]);
    expect(state.getTypingUsers('private')).toEqual(['bob']);
  });

  test('private and global typing states are independent', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('private', 'bob');
    expect(state.getTypingUsers('global')).toEqual(['alice']);
    expect(state.getTypingUsers('private')).toEqual(['bob']);
  });
});

describe('typing timers', () => {
  test('setTypingTimer and clearTypingTimer', () => {
    const timer = setTimeout(() => {}, 10000);
    state.setTypingTimer('room1', timer);
    state.clearTypingTimer('room1');
    // Should not throw
  });

  test('clearTypingTimer on non-existent room is safe', () => {
    expect(() => state.clearTypingTimer('nonexistent')).not.toThrow();
  });

  test('clearAllTypingTimers', () => {
    const timer1 = setTimeout(() => {}, 10000);
    const timer2 = setTimeout(() => {}, 10000);
    state.setTypingTimer('room1', timer1);
    state.setTypingTimer('room2', timer2);
    expect(() => state.clearAllTypingTimers()).not.toThrow();
  });
});

describe('optimistic queue', () => {
  test('pushOptimisticMessage and spliceOptimistic', () => {
    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'hello' });
    state.pushOptimisticMessage('global', { clientId: 'def', text: 'world' });
    const idx = state.findOptimisticIndex('global', 'abc', 'hello');
    expect(idx).toBe(0);
    state.spliceOptimistic('global', idx);
    expect(state.findOptimisticIndex('global', 'abc', 'hello')).toBe(-1);
  });

  test('findOptimisticIndex fallback by text when clientId not found', () => {
    state.pushOptimisticMessage('private', { clientId: 'abc', text: 'hello' });
    const idx = state.findOptimisticIndex('private', 'nonexistent', 'hello');
    expect(idx).toBe(0);
  });

  test('findOptimisticIndex returns -1 when nothing matches', () => {
    expect(state.findOptimisticIndex('global', 'nope', 'nope')).toBe(-1);
  });

  test('clearOptimisticChannel', () => {
    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'hello' });
    state.pushOptimisticMessage('global', { clientId: 'def', text: 'world' });
    state.clearOptimisticChannel('global');
    expect(state.findOptimisticIndex('global', 'abc', 'hello')).toBe(-1);
  });

  test('global and private channels are independent', () => {
    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'hello' });
    state.pushOptimisticMessage('private', { clientId: 'def', text: 'world' });
    expect(state.findOptimisticIndex('global', 'abc', 'hello')).toBe(0);
    expect(state.findOptimisticIndex('private', 'abc', 'hello')).toBe(-1);
  });
});

describe('jump buttons', () => {
  test('setJumpButton and getJumpButton', () => {
    const btn = document.createElement('button');
    state.setJumpButton('container1', btn);
    expect(state.getJumpButton('container1')).toBe(btn);
  });

  test('hasJumpButton', () => {
    jest.spyOn(state, 'hasJumpButton').mockRestore();
    expect(state.hasJumpButton('container1')).toBe(false);
    state.setJumpButton('container1', document.createElement('button'));
    expect(state.hasJumpButton('container1')).toBe(true);
  });
});

describe('message buffer', () => {
  test('createBufferEntry and hasBufferedMessages', () => {
    expect(state.hasBufferedMessages('room1')).toBe(false);
    state.createBufferEntry('room1');
    expect(state.hasBufferedMessages('room1')).toBe(true);
  });

  test('pushBufferedMessage and getBufferedMessages', () => {
    state.createBufferEntry('room1');
    state.pushBufferedMessage('room1', { text: 'hello' });
    state.pushBufferedMessage('room1', { text: 'world' });
    expect(state.getBufferedMessages('room1')).toEqual([
      { text: 'hello' },
      { text: 'world' }
    ]);
  });

  test('touchBufferEntry moves entry to end of insertion order', () => {
    state.createBufferEntry('roomA');
    state.createBufferEntry('roomB');
    state.createBufferEntry('roomC');
    // Touch roomA — it should now move to end
    state.touchBufferEntry('roomA');
    const keys = [];
    // Access oldest first
    const firstKey = state.getOldestBufferKey();
    // After touch, oldest should be roomB (not roomA)
    expect(firstKey).toBe('roomB');
  });

  test('deleteBufferEntry', () => {
    state.createBufferEntry('room1');
    expect(state.hasBufferedMessages('room1')).toBe(true);
    state.deleteBufferEntry('room1');
    expect(state.hasBufferedMessages('room1')).toBe(false);
  });

  test('getBufferSize', () => {
    expect(state.getBufferSize()).toBe(0);
    state.createBufferEntry('room1');
    expect(state.getBufferSize()).toBe(1);
    state.createBufferEntry('room2');
    expect(state.getBufferSize()).toBe(2);
  });

  test('clearMessageBuffer', () => {
    state.createBufferEntry('room1');
    state.createBufferEntry('room2');
    state.clearMessageBuffer();
    expect(state.getBufferSize()).toBe(0);
  });
});

describe('optimistic timeouts', () => {
  test('setOptimisticTimeout and getOptimisticTimeout', () => {
    state.setOptimisticTimeout('client1', 'timeoutId');
    expect(state.getOptimisticTimeout('client1')).toBe('timeoutId');
  });

  test('hasOptimisticTimeout', () => {
    expect(state.hasOptimisticTimeout('client1')).toBe(false);
    state.setOptimisticTimeout('client1', 'timeoutId');
    expect(state.hasOptimisticTimeout('client1')).toBe(true);
  });

  test('deleteOptimisticTimeout clears timeout and removes entry', () => {
    const timer = setTimeout(() => {}, 10000);
    state.setOptimisticTimeout('client1', timer);
    expect(state.hasOptimisticTimeout('client1')).toBe(true);
    state.deleteOptimisticTimeout('client1');
    expect(state.hasOptimisticTimeout('client1')).toBe(false);
  });

  test('clearAllOptimisticTimeouts', () => {
    state.setOptimisticTimeout('client1', setTimeout(() => {}, 10000));
    state.setOptimisticTimeout('client2', setTimeout(() => {}, 10000));
    state.clearAllOptimisticTimeouts();
    expect(state.hasOptimisticTimeout('client1')).toBe(false);
    expect(state.hasOptimisticTimeout('client2')).toBe(false);
  });
});

describe('resetAllState', () => {
  test('resets all values to defaults', () => {
    state.setCurrentUser('alice');
    state.setCurrentToken('token');
    state.setCurrentRoom('room');
    state.setCurrentRecipient('bob');
    state.setActiveTab('private');
    state.setUnreadGlobal(5);
    state.setUnreadPrivate(3);
    state.setSendingGlobal(true);
    state.setSendingPrivate(true);
    state.addTypingUser('global', 'charlie');
    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'hi' });
    state.createBufferEntry('room1');
    state.setOptimisticTimeout('client1', 'timer');

    state.resetAllState();

    expect(state.getCurrentUser()).toBeNull();
    expect(state.getCurrentToken()).toBeNull();
    expect(state.getCurrentRoom()).toBeNull();
    expect(state.getCurrentRecipient()).toBeNull();
    expect(state.getActiveTab()).toBe('global');
    expect(state.getUnreadGlobal()).toBe(0);
    expect(state.getUnreadPrivate()).toBe(0);
    expect(state.isSendingGlobal()).toBe(false);
    expect(state.isSendingPrivate()).toBe(false);
    expect(state.getTypingUsers('global')).toEqual([]);
    expect(state.getTypingUsers('private')).toEqual([]);
    expect(state.findOptimisticIndex('global', 'abc', 'hi')).toBe(-1);
    expect(state.hasBufferedMessages('room1')).toBe(false);
    expect(state.hasOptimisticTimeout('client1')).toBe(false);
  });
});