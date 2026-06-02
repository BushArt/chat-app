/**
 * Tests for config/env.js — environment variable validation.
 * env.js runs validation at require-time and calls process.exit(1) on failure.
 * We mock dotenv.config() to prevent it from loading the .env file, then
 * set process.env manually before requiring env.js in isolation.
 */

// Helper: require env.js in isolation with custom env vars
function loadEnv(envOverrides = {}) {
  const originalEnv = { ...process.env };
  const exitMock = jest.fn(() => { throw new Error('process.exit called'); });
  const originalExit = process.exit;
  process.exit = exitMock;

  // Clear all relevant env vars first
  delete process.env.JWT_SECRET;
  delete process.env.MONGO_URI;
  delete process.env.TEST_MONGO_URI;
  delete process.env.BCRYPT_ROUNDS;
  delete process.env.CLOUDINARY_URL;
  delete process.env.CLIENT_ORIGIN;
  delete process.env.NODE_ENV;

  // Apply overrides
  Object.keys(envOverrides).forEach(key => {
    if (envOverrides[key] !== undefined) {
      process.env[key] = envOverrides[key];
    }
  });

  let result = null;
  let error = null;
  try {
    jest.resetModules();
    // Mock dotenv to prevent loading .env file
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    result = require('../../../config/env');
  } catch (e) {
    error = e;
  }

  // Restore
  process.exit = originalExit;
  process.env = originalEnv;

  return { result, error, exitMock };
}

describe('config/env.js', () => {
  test('loads successfully with valid JWT_SECRET and MONGO_URI in test env', () => {
    const { result, exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: 'mongodb://localhost/test',
      NODE_ENV: 'test',
      BCRYPT_ROUNDS: undefined,
      CLOUDINARY_URL: undefined,
      CLIENT_ORIGIN: undefined
    });

    expect(exitMock).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.MAX_VOICE_SIZE).toBe(10 * 1024 * 1024);
  });

  test('exits when JWT_SECRET is missing', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: undefined,
      MONGO_URI: 'mongodb://localhost/test',
      NODE_ENV: 'test'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('exits when BCRYPT_ROUNDS is not a number', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      BCRYPT_ROUNDS: 'not-a-number',
      MONGO_URI: 'mongodb://localhost/test',
      NODE_ENV: 'test'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('does not exit when MONGO_URI missing but TEST_MONGO_URI present in test env', () => {
    const { result, exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: undefined,
      TEST_MONGO_URI: 'mongodb://localhost/testdb',
      NODE_ENV: 'test'
    });

    expect(exitMock).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  test('exits when MONGO_URI and TEST_MONGO_URI both missing in test env', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: undefined,
      TEST_MONGO_URI: undefined,
      NODE_ENV: 'test'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('exits when MONGO_URI missing in non-test env', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: undefined,
      NODE_ENV: 'development'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('exits when CLOUDINARY_URL missing in production', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: 'mongodb://localhost/test',
      CLOUDINARY_URL: undefined,
      CLIENT_ORIGIN: 'https://example.com',
      NODE_ENV: 'production'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('exits when CLIENT_ORIGIN missing in production', () => {
    const { exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: 'mongodb://localhost/test',
      CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
      CLIENT_ORIGIN: undefined,
      NODE_ENV: 'production'
    });

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  test('allowedOrigin returns wildcard in non-production', () => {
    const { result, exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: 'mongodb://localhost/test',
      NODE_ENV: 'development',
      CLIENT_ORIGIN: undefined
    });

    expect(exitMock).not.toHaveBeenCalled();
    expect(result.allowedOrigin).toBe('*');
  });

  test('allowedOrigin returns configured origin in production', () => {
    const { result, exitMock } = loadEnv({
      JWT_SECRET: 'test-secret',
      MONGO_URI: 'mongodb://localhost/test',
      CLOUDINARY_URL: 'cloudinary://key:secret@cloud',
      CLIENT_ORIGIN: 'https://myapp.example.com',
      NODE_ENV: 'production'
    });

    expect(exitMock).not.toHaveBeenCalled();
    expect(result.allowedOrigin).toBe('https://myapp.example.com');
  });
});