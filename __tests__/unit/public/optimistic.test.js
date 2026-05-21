/**
 * @jest-environment jsdom
 */
import * as optimistic from '../../../public/js/modules/optimistic.js';
import * as state from '../../../public/js/modules/state.js';
import * as utils from '../../../public/js/modules/utils.js';

// Mock ui.js appendMessage — must not reference document in factory (babel hoisting)
jest.mock('../../../public/js/modules/ui.js', () => ({
  appendMessage: jest.fn()
}));

import { appendMessage } from '../../../public/js/modules/ui.js';

beforeEach(() => {
  jest.clearAllMocks();
  state.resetAllState();
  state.setCurrentUser('testuser');
  document.body.innerHTML = `
    <div id="global-messages"></div>
    <div id="private-messages"></div>
  `;
});

describe('addOptimisticMessage', () => {
  test('returns a clientId when feature flag is enabled', () => {
    const clientId = optimistic.addOptimisticMessage('global', 'hello');
    expect(clientId).toBeTruthy();
    expect(typeof clientId).toBe('string');
  });

  test('pends message in state queue', () => {
    const clientId = optimistic.addOptimisticMessage('global', 'hello');
    expect(state.findOptimisticIndex('global', clientId, 'hello')).toBe(0);
  });

  test('appends a pending message to the DOM', () => {
    optimistic.addOptimisticMessage('global', 'hello');
    expect(appendMessage).toHaveBeenCalledWith(
      'global-messages',
      expect.any(String),
      'hello',
      expect.any(String),
      'sent',
      { pending: true, clientId: expect.any(String) }
    );
  });

  test('returns null when optimisticSend feature is disabled', () => {
    state.FEATURE_FLAGS.optimisticSend = false;
    const clientId = optimistic.addOptimisticMessage('global', 'hello');
    expect(clientId).toBeNull();
    state.FEATURE_FLAGS.optimisticSend = true; // restore
  });

  test('pushes to private channel correctly', () => {
    const clientId = optimistic.addOptimisticMessage('private', 'private msg');
    expect(state.findOptimisticIndex('private', clientId, 'private msg')).toBe(0);
    expect(appendMessage).toHaveBeenCalledWith(
      'private-messages',
      expect.any(String),
      'private msg',
      expect.any(String),
      'sent',
      { pending: true, clientId: expect.any(String) }
    );
  });
});

describe('resolveOptimistic', () => {
  test('returns false when feature flag is disabled', () => {
    state.FEATURE_FLAGS.optimisticSend = false;
    const result = optimistic.resolveOptimistic('global', { clientId: 'x', message: 'hi' });
    expect(result).toBe(false);
    state.FEATURE_FLAGS.optimisticSend = true;
  });

  test('cancels optimistic timeout when clientId matches', () => {
    const timer = setTimeout(() => {}, 10000);
    state.setOptimisticTimeout('client1', timer);
    jest.spyOn(state, 'deleteOptimisticTimeout');

    optimistic.resolveOptimistic('global', { clientId: 'client1', message: 'hi' });
    expect(state.deleteOptimisticTimeout).toHaveBeenCalledWith('client1');
  });

  test('returns false when no matching optimistic entry', () => {
    const result = optimistic.resolveOptimistic('global', { clientId: 'nonexistent', message: 'nobody' });
    expect(result).toBe(false);
  });

  test('updates DOM element when match found by clientId', () => {
    const container = document.getElementById('global-messages');
    const pending = document.createElement('div');
    pending.className = 'message sent pending';
    pending.dataset.clientId = 'match-client';
    
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.dataset.time = '';
    pending.appendChild(meta);
    container.appendChild(pending);

    state.pushOptimisticMessage('global', { clientId: 'match-client', text: 'world' });

    const result = optimistic.resolveOptimistic('global', {
      clientId: 'match-client',
      message: 'world',
      createdAt: '2026-01-01T12:00:00Z'
    });

    expect(result).toBe(true);
    expect(pending.classList.contains('pending')).toBe(false);
    expect(pending.hasAttribute('data-client-id')).toBe(false);
  });

  test('updates DOM element when match found by text fallback', () => {
    const container = document.getElementById('global-messages');
    const pending = document.createElement('div');
    pending.className = 'message sent pending';
    
    const meta = document.createElement('div');
    meta.className = 'meta';
    pending.appendChild(meta);
    container.appendChild(pending);

    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'fallback-text' });

    // Pass clientId as empty string so resolveOptimistic falls back to text-only match
    const result = optimistic.resolveOptimistic('global', {
      clientId: undefined,
      message: 'fallback-text',
      createdAt: '2026-01-01T12:00:00Z'
    });

    expect(result).toBe(true);
    expect(pending.classList.contains('pending')).toBe(false);
  });

  test('does not throw when container element is missing', () => {
    document.body.innerHTML = '';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    state.pushOptimisticMessage('global', { clientId: 'abc', text: 'hi' });
    
    expect(() => {
      optimistic.resolveOptimistic('global', { clientId: 'abc', message: 'hi' });
    }).not.toThrow();
  });
});

describe('clearOptimisticPending', () => {
  test('removes pending entry from state queue', () => {
    state.pushOptimisticMessage('global', { clientId: 'remove-me', text: 'bye' });
    optimistic.clearOptimisticPending('global', 'remove-me');
    expect(state.findOptimisticIndex('global', 'remove-me', null)).toBe(-1);
  });

  test('resets sending flags', () => {
    state.setSendingGlobal(true);
    state.setSendingPrivate(true);
    
    optimistic.clearOptimisticPending('global', 'client1');
    expect(state.isSendingGlobal()).toBe(false);
    
    optimistic.clearOptimisticPending('private', 'client2');
    expect(state.isSendingPrivate()).toBe(false);
  });

  test('cleans up optimistic timeout', () => {
    const timer = setTimeout(() => {}, 10000);
    state.setOptimisticTimeout('client1', timer);
    jest.spyOn(state, 'deleteOptimisticTimeout');
    
    optimistic.clearOptimisticPending('global', 'client1');
    expect(state.deleteOptimisticTimeout).toHaveBeenCalledWith('client1');
  });
});