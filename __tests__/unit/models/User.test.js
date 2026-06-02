const mongoose = require('mongoose');
const { getMemoryMongoUri } = require('../../helpers/memoryMongoServer');

beforeAll(async () => {
  await mongoose.connect(await getMemoryMongoUri());
});

afterAll(async () => {
  await mongoose.disconnect();
});

const User = require('../../../models/User');

describe('User schema', () => {
  describe('field validations', () => {
    test('username is required', async () => {
      const user = new User({ password: 'password123' });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.username.kind).toBe('required');
    });

    test('password is required', async () => {
      const user = new User({ username: 'alice' });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.password).toBeDefined();
      expect(err.errors.password.kind).toBe('required');
    });

    test('username is trimmed', () => {
      const user = new User({ username: '  alice  ', password: 'password123' });
      expect(user.username).toBe('alice');
    });

    test('validates successfully with all required fields', async () => {
      const user = new User({ username: 'alice', password: 'password123' });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });

  describe('schema options', () => {
    test('timestamps are enabled', () => {
      const user = new User({ username: 'bob', password: 'pass' });
      expect(user.schema.options.timestamps).toBe(true);
    });

    test('username has a unique index', () => {
      const user = new User({ username: 'alice', password: 'pass' });
      expect(user.schema.path('username').options.unique).toBe(true);
    });
  });

  describe('profile fields', () => {
    test('displayName defaults to username on save', async () => {
      const user = new User({ username: 'alice', password: 'pass' });
      expect(user.displayName).toBe('');
      await user.save();
      expect(user.displayName).toBe('alice');
    });

    test('displayName accepts a valid value', async () => {
      const user = new User({ username: 'alice', password: 'pass', displayName: 'Alice Chen' });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });

    test('displayName exceeding 50 codepoints fails validation', async () => {
      const user = new User({ username: 'alice', password: 'pass', displayName: 'x'.repeat(51) });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.displayName).toBeDefined();
    });

    test('bio defaults to empty string', () => {
      const user = new User({ username: 'alice', password: 'pass' });
      expect(user.bio).toBe('');
    });

    test('bio exceeding 160 codepoints fails validation', async () => {
      const user = new User({ username: 'alice', password: 'pass', bio: 'x'.repeat(161) });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.bio).toBeDefined();
    });

    test('status defaults to online', () => {
      const user = new User({ username: 'alice', password: 'pass' });
      expect(user.status).toBe('online');
    });

    test('status accepts valid enum values', async () => {
      for (const status of ['online', 'away', 'busy', 'offline']) {
        const user = new User({ username: 'alice', password: 'pass', status });
        let err;
        try {
          await user.validate();
        } catch (e) {
          err = e;
        }
        expect(err).toBeUndefined();
      }
    });

    test('status set to an invalid value fails validation', async () => {
      const user = new User({ username: 'alice', password: 'pass', status: 'invalid' });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    test('all profile fields validate together successfully', async () => {
      const user = new User({
        username: 'alice',
        password: 'pass',
        displayName: 'Alice Chen',
        bio: 'Just here to chat.',
        status: 'away',
      });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });
});
