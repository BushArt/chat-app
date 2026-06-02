/**
 * Unit tests for public/js/modules/recorder.js
 *
 * MediaRecorder is not available in jsdom, so we use a manual mock class.
 * All voice recording tests use mocked browser APIs.
 */

// ── Mock MediaRecorder class ────────────────────────────────────────────
class MockMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options || {};
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    this._chunksEmitted = false;
  }

  start(timeslice) {
    this.state = 'recording';
    // Simulate ondataavailable with a small chunk
    if (typeof this.ondataavailable === 'function') {
      this.ondataavailable({ data: new Blob(['mock-chunk'], { type: 'audio/webm' }) });
    }
  }

  stop() {
    this.state = 'inactive';
    // Emit final data chunk
    if (!this._chunksEmitted && typeof this.ondataavailable === 'function') {
      this.ondataavailable({ data: new Blob(['final-chunk'], { type: 'audio/webm' }) });
    }
    this._chunksEmitted = true;
    // Fire onstop
    if (typeof this.onstop === 'function') {
      this.onstop(new Event('stop'));
    }
  }

  static isTypeSupported(type) {
    return type === 'audio/webm;codecs=opus';
  }
}

// ── Mock getUserMedia ───────────────────────────────────────────────────
function createMockStream() {
  const mockTrack = { stop: jest.fn() };
  return {
    getTracks: jest.fn().mockReturnValue([mockTrack])
  };
}

let getUserMediaMock;
let originalMediaDevices;

beforeAll(() => {
  // Save original and set up mock
  originalMediaDevices = navigator.mediaDevices;
  getUserMediaMock = jest.fn();
  navigator.mediaDevices = { getUserMedia: getUserMediaMock };
  window.MediaRecorder = MockMediaRecorder;
});

afterAll(() => {
  navigator.mediaDevices = originalMediaDevices;
  delete window.MediaRecorder;
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('recorder.js – MediaRecorder wrapper', () => {
  let recorder;

  beforeEach(() => {
    jest.isolateModules(() => {
      recorder = require('../../public/js/modules/recorder.js');
    });
    // Ensure clean state
    recorder.reset();
    jest.useRealTimers();
  });

  // Helper to flush microtasks
  function flushMicrotasks() {
    return new Promise(process.nextTick);
  }

  // 1. startRecording() requests microphone permission
  test('startRecording() requests microphone permission', () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
  });

  // 2. startRecording() transitions to recording state after permission granted
  test('startRecording() transitions to recording state after permission granted', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    // Await the microtask from getUserMedia
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('recording');
  });

  // 3. startRecording() transitions back to idle after permission denied
  test('startRecording() transitions back to idle after permission denied', async () => {
    getUserMediaMock.mockRejectedValue(new Error('Permission denied'));
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('idle');
  });

  // 4. stopRecording() while recording transitions to preview
  test('stopRecording() while in recording state transitions to preview', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('recording');
    recorder.stopRecording();
    expect(recorder.getState()).toBe('preview');
  });

  // 5. stopRecording() while in idle state is a no-op (no throw)
  test('stopRecording() while in idle state is a no-op', () => {
    expect(() => recorder.stopRecording()).not.toThrow();
    expect(recorder.getState()).toBe('idle');
  });

  // 6. discardRecording() while in preview transitions to idle
  test('discardRecording() while in preview state transitions to idle', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    recorder.stopRecording();
    expect(recorder.getState()).toBe('preview');
    recorder.discardRecording();
    expect(recorder.getState()).toBe('idle');
  });

  // 7. After maxDuration elapses, auto-stop transitions to preview
  test('after maxDuration elapses, recording stops automatically and transitions to preview', async () => {
    // Spy on global.setTimeout so we can fire the max duration callback manually
    const originalSetTimeout = global.setTimeout;
    const setTimeoutCalls = [];
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay, ...args) => {
      setTimeoutCalls.push({ fn, delay, args });
      return originalSetTimeout(fn, delay, ...args);
    });
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('recording');
    // Find the max duration timer (delay === 120_000)
    const maxDurationCall = setTimeoutCalls.find(c => c.delay === 120_000);
    expect(maxDurationCall).toBeDefined();
    // Fire the max duration callback directly
    maxDurationCall.fn();
    expect(recorder.getState()).toBe('preview');
    global.setTimeout.mockRestore();
  });

  // 8. onRecordingReady callback receives blob, filename, and mimeType
  test('onRecordingReady callback is called with blob, filename, and mimeType', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    const onReady = jest.fn();
    recorder.startRecording(onReady);
    await new Promise(process.nextTick);
    recorder.stopRecording();
    // After stop, the onstop handler calls onReady with (blob, filename, mimeType)
    expect(onReady).toHaveBeenCalledTimes(1);
    const args = onReady.mock.calls[0];
    expect(args[0]).toBeInstanceOf(Blob);
    expect(typeof args[1]).toBe('string');
    expect(args[1]).toMatch(/^voice-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.webm$/);
    expect(typeof args[2]).toBe('string');
    expect(args[2]).toBe('audio/webm;codecs=opus');
  });

  // 9. Invalid transitions are silently ignored
  test('invalid transitions are silently ignored (stop in idle, discard in idle)', () => {
    expect(recorder.getState()).toBe('idle');
    // Calling stopRecording in idle should not throw
    recorder.stopRecording();
    expect(recorder.getState()).toBe('idle');
    // Calling discardRecording in idle should not throw
    recorder.discardRecording();
    expect(recorder.getState()).toBe('idle');
    // Calling setSending in idle should not throw
    recorder.setSending();
    expect(recorder.getState()).toBe('idle');
    // Calling setPreview in idle should not throw
    recorder.setPreview();
    expect(recorder.getState()).toBe('idle');
  });

  // 10. preview → recording re-record transition works
  test('startRecording from preview state (re-record) transitions to recording', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    recorder.stopRecording();
    expect(recorder.getState()).toBe('preview');
    // Start again (re-record)
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('recording');
  });

  // 11. onStateChange callback receives new state on every transition
  test('onStateChange callback receives state updates', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    const stateChanges = [];
    recorder.onStateChange((s) => stateChanges.push(s));
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    recorder.stopRecording();
    expect(stateChanges).toContain('requesting');
    expect(stateChanges).toContain('recording');
    expect(stateChanges).toContain('preview');
  });

  // 12. setSending transitions from preview to sending
  test('setSending transitions from preview to sending', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    recorder.stopRecording();
    expect(recorder.getState()).toBe('preview');
    recorder.setSending();
    expect(recorder.getState()).toBe('sending');
  });

  // 13. setPreview transitions from sending back to preview (retry)
  test('setPreview transitions from sending back to preview', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    recorder.stopRecording();
    recorder.setSending();
    expect(recorder.getState()).toBe('sending');
    recorder.setPreview();
    expect(recorder.getState()).toBe('preview');
  });

  // 14. reset() returns to idle from any state
  test('reset() returns to idle from any state', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(recorder.getState()).toBe('recording');
    recorder.reset();
    expect(recorder.getState()).toBe('idle');
  });

  // 15. Multiple onStateChange subscribers all receive callbacks
  test('multiple onStateChange subscribers all receive callbacks', async () => {
    getUserMediaMock.mockResolvedValue(createMockStream());
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    recorder.onStateChange(cb1);
    recorder.onStateChange(cb2);
    recorder.startRecording(jest.fn());
    await new Promise(process.nextTick);
    expect(cb1).toHaveBeenCalledWith('recording');
    expect(cb2).toHaveBeenCalledWith('recording');
  });
});
