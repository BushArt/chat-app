/**
 * @jest-environment jsdom
 */
import * as utils from '../../../public/js/modules/utils.js';

beforeEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('constants', () => {
  test('MAX_LEN is 1000', () => {
    expect(utils.MAX_LEN).toBe(1000);
  });

  test('TYPING_DEBOUNCE_MS is 200', () => {
    expect(utils.TYPING_DEBOUNCE_MS).toBe(200);
  });

  test('OPTIMISTIC_TIMEOUT is 31000', () => {
    expect(utils.OPTIMISTIC_TIMEOUT).toBe(31000);
  });

  test('MAX_BUFFERED_ROOMS is 50', () => {
    expect(utils.MAX_BUFFERED_ROOMS).toBe(50);
  });
});

describe('autoResize', () => {
  test('sets height to scrollHeight', () => {
    const textarea = document.createElement('textarea');
    Object.defineProperty(textarea, 'scrollHeight', { value: 100, configurable: true });
    textarea.style.height = 'auto';
    
    utils.autoResize(textarea);
    
    expect(textarea.style.height).toBe('100px');
  });
});

describe('scroll helpers', () => {
  function createContainer(scrollHeightValue, scrollTopValue, clientHeightValue) {
    const container = document.createElement('div');
    Object.defineProperties(container, {
      scrollHeight: { value: scrollHeightValue, configurable: true },
      scrollTop: { value: scrollTopValue, writable: true, configurable: true },
      clientHeight: { value: clientHeightValue, configurable: true }
    });
    return container;
  }

  describe('isNearBottom', () => {
    test('returns true when within 120px of bottom', () => {
      // scrollHeight - scrollTop - clientHeight = 50 (< 120)
      const container = createContainer(1000, 900, 50);
      expect(utils.isNearBottom(container)).toBe(true);
    });

    test('returns false when far from bottom', () => {
      // scrollHeight - scrollTop - clientHeight = 200 (> 120)
      const container = createContainer(1000, 700, 100);
      expect(utils.isNearBottom(container)).toBe(false);
    });

    test('returns true when at exact bottom', () => {
      const container = createContainer(1000, 850, 150);
      expect(utils.isNearBottom(container)).toBe(true);
    });
  });

  describe('maybeScrollToBottom', () => {
    test('scrolls to bottom when near bottom', () => {
      const container = createContainer(1000, 900, 50);
      utils.maybeScrollToBottom(container);
      expect(container.scrollTop).toBe(1000);
    });

    test('does not scroll when far from bottom', () => {
      const container = createContainer(1000, 500, 100);
      const initial = container.scrollTop;
      utils.maybeScrollToBottom(container);
      expect(container.scrollTop).toBe(initial);
    });
  });

  describe('scrollToBottom', () => {
    test('always scrolls to scrollHeight', () => {
      const container = createContainer(500, 0, 100);
      utils.scrollToBottom(container);
      expect(container.scrollTop).toBe(500);
    });
  });
});

describe('tryCopyText', () => {
  test('calls clipboard.writeText when available', () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true
    });

    utils.tryCopyText('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  test('does not throw when clipboard is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true
    });

    expect(() => utils.tryCopyText('hello')).not.toThrow();
  });

  test('does not throw when writeText rejects', () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true
    });

    expect(() => utils.tryCopyText('hello')).not.toThrow();
  });
});