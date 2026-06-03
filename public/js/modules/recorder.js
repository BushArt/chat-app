/* eslint-env browser */

/**
 * Voice recorder module using the MediaRecorder API.
 *
 * State machine: idle → requesting → recording → preview → sending → idle
 *                              ↓                                       ↓
 *                            idle                                 preview (retry)
 *              preview → recording (re-record)
 *              preview → idle (discard)
 *
 * Invalid transitions are silently ignored.
 */

// ── Private state ───────────────────────────────────────────────────────
let _state = 'idle';
let _mediaRecorder = null;
let _stream = null;
let _chunks = [];
let _maxDurationTimer = null;
let _onStateChangeCbs = [];
let _onRecordingReadyCb = null;

const MAX_DURATION_MS = 120_000; // 2 minutes

// ── Supported MIME type detection ───────────────────────────────────────
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

// ── State transition helper ─────────────────────────────────────────────
function setState(newState) {
  _state = newState;
  _onStateChangeCbs.forEach(cb => {
    if (typeof cb === 'function') cb(newState);
  });
}

// ── Cleanup helper ──────────────────────────────────────────────────────
function releaseMicStream() {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

// ── Exported API ────────────────────────────────────────────────────────

/**
 * Register a callback invoked on every state transition.
 * @param {function(string): void} cb - receives the new state string
 */
export function onStateChange(cb) {
  if (typeof cb === 'function') {
    _onStateChangeCbs.push(cb);
  }
}

/**
 * Returns the current state string.
 * @returns {'idle' | 'requesting' | 'recording' | 'preview' | 'sending'}
 */
export function getState() {
  return _state;
}

/**
 * Start recording audio.
 *
 * Requests microphone permission, then begins recording.
 * On stop (user-initiated or duration limit), calls `onReady(blob, filename, mimeType)`.
 *
 * @param {function(Blob, string, string): void} onReady
 *   Callback invoked with (blob, filename, mimeType) when recording completes.
 */
export function startRecording(onReady) {
  if (_state !== 'idle' && _state !== 'preview') return;
  if (_state === 'preview') {
    // Re-record: discard current blob and restart
    _chunks = [];
    _mediaRecorder = null;
    _onRecordingReadyCb = null;
    releaseMicStream();
  }

  if (typeof onReady !== 'function') return;
  _onRecordingReadyCb = onReady;

  setState('requesting');

  const mimeType = getSupportedMimeType();

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      if (_state !== 'requesting') {
        // Permission was granted after a discard or abort — clean up
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      _stream = stream;
      _chunks = [];

      const options = mimeType ? { mimeType } : {};
      _mediaRecorder = new MediaRecorder(stream, options);

      _mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          _chunks.push(e.data);
        }
      };

      _mediaRecorder.onstop = () => {
        const blob = new Blob(_chunks, { type: mimeType || 'audio/webm' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `voice-${timestamp}.webm`;

        _chunks = [];
        releaseMicStream();

        if (typeof _onRecordingReadyCb === 'function') {
          _onRecordingReadyCb(blob, filename, mimeType || 'audio/webm');
        }
      };

      _mediaRecorder.start(1000); // timeslice every 1s for ondataavailable

      // Auto-stop after max duration
      _maxDurationTimer = setTimeout(() => {
        stopRecording();
      }, MAX_DURATION_MS);

      setState('recording');
    })
    .catch(() => {
      // Permission denied or mic unavailable
      releaseMicStream();
      setState('idle');
    });
}

/**
 * Stop recording. Only valid in 'recording' state.
 * Transitions to 'preview'.
 */
export function stopRecording() {
  if (_state !== 'recording') return;

  clearTimeout(_maxDurationTimer);
  _maxDurationTimer = null;

  setState('preview');

  try {
    _mediaRecorder.stop();
  } catch (e) {
    // MediaRecorder may have already stopped; clean up anyway
    releaseMicStream();
  }
}

/**
 * Discard the recorded audio and return to idle.
 * Only valid in 'preview' state.
 */
export function discardRecording() {
  if (_state !== 'preview') return;

  _chunks = [];
  _mediaRecorder = null;
  _onRecordingReadyCb = null;

  setState('idle');
}

/**
 * Transition to sending state (to be set by the caller when upload starts).
 */
export function setSending() {
  if (_state !== 'preview') return;
  setState('sending');
}

/**
 * Transition back to preview (to be set by the caller when upload fails).
 */
export function setPreview() {
  if (_state !== 'sending') return;
  setState('preview');
}

/**
 * Reset fully to idle (called after successful send or on session reset).
 *
 * IMPORTANT: setState('idle') must fire BEFORE clearing callbacks, so that
 * UI listeners (e.g. updateVoiceButton, clearVoicePreview) are notified and
 * the record button reverts to the idle (🎤) state.
 */
export function reset() {
  clearTimeout(_maxDurationTimer);
  _maxDurationTimer = null;
  releaseMicStream();
  _chunks = [];
  _mediaRecorder = null;
  _onRecordingReadyCb = null;
  setState('idle');       // Fire FIRST so UI gets the state change notification
  _onStateChangeCbs = []; // Then clean up callbacks
}