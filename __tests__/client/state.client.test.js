import * as state from '../../public/js/modules/state.js';

describe('client state – profile fields', () => {
  beforeEach(() => {
    state.resetAllState();
  });

  // -------------------------------------------------------------------
  // setCurrentDisplayName / getCurrentDisplayName round-trip
  // -------------------------------------------------------------------
  test('setCurrentDisplayName and getCurrentDisplayName round-trip correctly', () => {
    expect(state.getCurrentDisplayName()).toBeNull(); // no currentUser set yet
    state.setCurrentUser('alice');
    expect(state.getCurrentDisplayName()).toBe('alice'); // fallback to username
    state.setCurrentDisplayName('Alice Chen');
    expect(state.getCurrentDisplayName()).toBe('Alice Chen');
  });

  test('getCurrentDisplayName falls back to username when displayName is null', () => {
    state.setCurrentUser('bob');
    // displayName not explicitly set => null => fallback to username
    expect(state.getCurrentDisplayName()).toBe('bob');
    state.setCurrentDisplayName('Bob Smith');
    expect(state.getCurrentDisplayName()).toBe('Bob Smith');
  });

  // -------------------------------------------------------------------
  // onlineUsersMap updates from profile_updated
  // -------------------------------------------------------------------
  test('onlineUsersMap is empty after reset', () => {
    const map = state.getOnlineUsersMap();
    expect(map.size).toBe(0);
  });

  test('setOnlineUsersFromList handles old string[] format', () => {
    state.setOnlineUsersFromList(['alice', 'bob']);
    const map = state.getOnlineUsersMap();
    expect(map.size).toBe(2);
    expect(map.get('alice')).toEqual({ username: 'alice', displayName: 'alice', status: 'online' });
    expect(map.get('bob')).toEqual({ username: 'bob', displayName: 'bob', status: 'online' });
  });

  test('setOnlineUsersFromList handles new object[] format', () => {
    state.setOnlineUsersFromList([
      { username: 'alice', displayName: 'Alice', status: 'away' },
      { username: 'bob', displayName: 'Bob', status: 'busy' },
    ]);
    const map = state.getOnlineUsersMap();
    expect(map.size).toBe(2);
    expect(map.get('alice')).toEqual({ username: 'alice', displayName: 'Alice', status: 'away' });
    expect(map.get('bob')).toEqual({ username: 'bob', displayName: 'Bob', status: 'busy' });
  });

  test('setOnlineUsersFromList skips null/undefined entries', () => {
    state.setOnlineUsersFromList(['alice', null, undefined, 'bob']);
    const map = state.getOnlineUsersMap();
    expect(map.size).toBe(2);
  });

  test('setOnlineUsersFromList clears previous entries', () => {
    state.setOnlineUsersFromList(['alice']);
    expect(state.getOnlineUsersMap().size).toBe(1);

    state.setOnlineUsersFromList(['bob']);
    expect(state.getOnlineUsersMap().size).toBe(1);
    expect(state.getOnlineUsersMap().has('alice')).toBe(false);
    expect(state.getOnlineUsersMap().has('bob')).toBe(true);
  });

  test('updateOnlineUser updates an existing entry in onlineUsersMap', () => {
    state.setOnlineUsersFromList([
      { username: 'alice', displayName: 'Alice', status: 'online' },
    ]);
    state.updateOnlineUser('alice', 'Alice Updated', 'busy');
    const map = state.getOnlineUsersMap();
    expect(map.get('alice')).toEqual({ username: 'alice', displayName: 'Alice Updated', status: 'busy' });
  });

  test('updateOnlineUser does nothing for unknown user', () => {
    state.setOnlineUsersFromList(['alice']);
    state.updateOnlineUser('bob', 'Bob', 'away');
    const map = state.getOnlineUsersMap();
    expect(map.has('bob')).toBe(false);
    expect(map.get('alice')).toBeDefined();
  });
});