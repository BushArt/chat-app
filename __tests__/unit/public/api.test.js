import * as api from '../../../public/js/modules/api.js';
import * as state from '../../../public/js/modules/state.js';

beforeEach(() => {
  state.resetAllState();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('register', () => {
  test('sends POST to /auth/register with username and password', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Account created.' })
    });

    const result = await api.register('alice', 'secret123');
    expect(fetch).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret123' })
    });
    expect(result).toEqual({ message: 'Account created.' });
  });

  test('throws error on non-ok response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Username taken.' })
    });

    await expect(api.register('alice', 'secret123')).rejects.toThrow('Username taken.');
  });

  test('throws generic error when no error field', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({})
    });

    await expect(api.register('alice', 'secret123')).rejects.toThrow('Registration failed.');
  });
});

describe('login', () => {
  test('sends POST to /auth/login with credentials', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt', username: 'alice' })
    });

    const result = await api.login('alice', 'secret123');
    expect(fetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'secret123' })
    });
    expect(result).toEqual({ token: 'jwt', username: 'alice' });
  });

  test('throws error on non-ok response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials.' })
    });

    await expect(api.login('alice', 'wrong')).rejects.toThrow('Invalid credentials.');
  });

  test('throws generic error when no error field', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({})
    });

    await expect(api.login('alice', 'wrong')).rejects.toThrow('Login failed.');
  });
});

describe('fetchGlobalHistory', () => {
  test('sends GET to /messages/global with Bearer token and no before param', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ sender: 'alice', message: 'hello' }], hasMore: false, cursor: null })
    });

    const result = await api.fetchGlobalHistory();
    expect(fetch).toHaveBeenCalledWith('/messages/global', {
      headers: { Authorization: 'Bearer test-token' }
    });
    expect(result).toEqual({ messages: [{ sender: 'alice', message: 'hello' }], hasMore: false, cursor: null });
  });

  test('sends GET with before param when provided', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], hasMore: false, cursor: null })
    });

    const result = await api.fetchGlobalHistory('abc123');
    expect(fetch).toHaveBeenCalledWith('/messages/global?before=abc123', {
      headers: { Authorization: 'Bearer test-token' }
    });
  });

  test('throws on non-ok response for fetchGlobalHistory', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Server error' })
    });

    await expect(api.fetchGlobalHistory()).rejects.toThrow('Network response was not ok');
  });

  test('throws on non-JSON content-type for fetchGlobalHistory', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      json: async () => '{}'
    });

    await expect(api.fetchGlobalHistory()).rejects.toThrow('Invalid JSON response');
  });
});

describe('fetchPrivateHistory', () => {
  test('sends GET with encoded usernames, Bearer token, and no before param', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ sender: 'alice', message: 'hi' }], hasMore: false, cursor: null })
    });

    const result = await api.fetchPrivateHistory('alice', 'bob');
    expect(fetch).toHaveBeenCalledWith('/messages/alice/bob', {
      headers: { Authorization: 'Bearer test-token' }
    });
    expect(result).toEqual({ messages: [{ sender: 'alice', message: 'hi' }], hasMore: false, cursor: null });
  });

  test('sends GET with before param when provided', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], hasMore: false, cursor: null })
    });

    const result = await api.fetchPrivateHistory('alice', 'bob', 'xyz789');
    expect(fetch).toHaveBeenCalledWith('/messages/alice/bob?before=xyz789', {
      headers: { Authorization: 'Bearer test-token' }
    });
  });

  test('throws on non-ok response for fetchPrivateHistory', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Not found' })
    });

    await expect(api.fetchPrivateHistory('alice', 'bob')).rejects.toThrow('Network response was not ok');
  });

  test('throws on non-JSON content-type for fetchPrivateHistory', async () => {
    state.setCurrentToken('test-token');
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      json: async () => '{}'
    });

    await expect(api.fetchPrivateHistory('alice', 'bob')).rejects.toThrow('Invalid JSON response');
  });
});
