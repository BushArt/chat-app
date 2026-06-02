/**
 * @jest-environment jsdom
 *
 * Integration tests for public/js/app.js orchestration (auth, profile, uploads).
 */

const { mountAppHtml } = require('./helpers/domScaffold');

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockEmitJoinRoom = jest.fn();
const mockEmitSendGlobalMessage = jest.fn();
const mockEmitSendPrivateMessage = jest.fn();
const mockEmitStartTyping = jest.fn();
const mockEmitStopTyping = jest.fn();

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockFetchGlobalHistory = jest.fn();
const mockFetchProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockUploadAttachment = jest.fn();

const mockRecorderOnStateChange = jest.fn();
const mockRecorderGetState = jest.fn(() => 'idle');
const mockRecorderStartRecording = jest.fn();
const mockRecorderStopRecording = jest.fn();
const mockRecorderDiscardRecording = jest.fn();
const mockRecorderReset = jest.fn();
const mockRecorderSetSending = jest.fn();
const mockRecorderSetPreview = jest.fn();

jest.mock('../../public/js/modules/socket.js', () => ({
  connect: (...args) => mockConnect(...args),
  disconnect: (...args) => mockDisconnect(...args),
  emitJoinRoom: (...args) => mockEmitJoinRoom(...args),
  emitSendGlobalMessage: (...args) => mockEmitSendGlobalMessage(...args),
  emitSendPrivateMessage: (...args) => mockEmitSendPrivateMessage(...args),
  emitStartTyping: (...args) => mockEmitStartTyping(...args),
  emitStopTyping: (...args) => mockEmitStopTyping(...args),
}));

jest.mock('../../public/js/modules/api.js', () => ({
  register: (...args) => mockRegister(...args),
  login: (...args) => mockLogin(...args),
  fetchGlobalHistory: (...args) => mockFetchGlobalHistory(...args),
  fetchPrivateHistory: jest.fn().mockResolvedValue({ messages: [], hasMore: false, cursor: null }),
  fetchProfile: (...args) => mockFetchProfile(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
  uploadAttachment: (...args) => mockUploadAttachment(...args),
}));

jest.mock('../../public/js/modules/recorder.js', () => ({
  onStateChange: (...args) => mockRecorderOnStateChange(...args),
  getState: (...args) => mockRecorderGetState(...args),
  startRecording: (...args) => mockRecorderStartRecording(...args),
  stopRecording: (...args) => mockRecorderStopRecording(...args),
  discardRecording: (...args) => mockRecorderDiscardRecording(...args),
  reset: (...args) => mockRecorderReset(...args),
  setSending: (...args) => mockRecorderSetSending(...args),
  setPreview: (...args) => mockRecorderSetPreview(...args),
}));

const profileResponse = {
  token: 'test-jwt-token',
  username: 'alice',
  displayName: 'alice',
  bio: '',
  status: 'online',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

let initApp;

beforeAll(async () => {
  const appMod = await import('../../public/js/app.js');
  initApp = appMod.init;
});

async function bootApp() {
  jest.clearAllMocks();
  localStorage.clear();
  mountAppHtml();
  mockFetchGlobalHistory.mockResolvedValue({ messages: [], hasMore: false, cursor: null });
  mockFetchProfile.mockResolvedValue({ ...profileResponse, token: undefined });

  const stateMod = await import('../../public/js/modules/state.js');
  stateMod.resetAllState();

  initApp();
  await Promise.resolve();
}

function click(id) {
  document.getElementById(id).click();
}

async function loginAsAlice() {
  document.getElementById('username-input').value = 'alice';
  document.getElementById('password-input').value = 'password123';
  mockLogin.mockResolvedValue({ ...profileResponse });
  click('btn-login');
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('app.js auth flows', () => {
  test('login shows chat screen, saves token, and connects socket', async () => {
    await bootApp();
    await loginAsAlice();

    expect(mockLogin).toHaveBeenCalledWith('alice', 'password123');
    expect(localStorage.getItem('chat_token')).toBe('test-jwt-token');
    expect(localStorage.getItem('chat_user')).toBe('alice');
    expect(document.getElementById('chat-screen').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('auth-screen').classList.contains('hidden')).toBe(true);
    expect(mockConnect).toHaveBeenCalledWith('test-jwt-token');
    expect(document.getElementById('logged-in-as').textContent).toContain('alice');
  });

  test('register shows chat screen, saves token, and connects socket', async () => {
    await bootApp();
    document.getElementById('username-input').value = 'bob';
    document.getElementById('password-input').value = 'password123';
    mockRegister.mockResolvedValue({
      ...profileResponse,
      username: 'bob',
      displayName: 'bob',
      token: 'bob-jwt',
    });
    click('btn-register');
    await Promise.resolve();

    expect(mockRegister).toHaveBeenCalledWith('bob', 'password123');
    expect(localStorage.getItem('chat_token')).toBe('bob-jwt');
    expect(mockConnect).toHaveBeenCalledWith('bob-jwt');
    expect(document.getElementById('chat-screen').classList.contains('hidden')).toBe(false);
  });

  test('empty login fields show auth error without calling API', async () => {
    await bootApp();
    click('btn-login');
    await Promise.resolve();

    expect(mockLogin).not.toHaveBeenCalled();
    expect(document.getElementById('auth-error').textContent).toBe('Please fill in both fields.');
  });

  test('logout clears session and returns to auth screen', async () => {
    await bootApp();
    await loginAsAlice();
    click('btn-logout');

    expect(mockDisconnect).toHaveBeenCalled();
    expect(localStorage.getItem('chat_token')).toBeNull();
    expect(localStorage.getItem('chat_user')).toBeNull();
    expect(document.getElementById('auth-screen').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('chat-screen').classList.contains('hidden')).toBe(true);
  });
});

describe('app.js profile editor', () => {
  test('edit profile toggle preserves in-flight edits when closed and reopened', async () => {
    await bootApp();
    await loginAsAlice();
    const stateMod = await import('../../public/js/modules/state.js');

    click('btn-edit-profile');
    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(false);

    document.getElementById('edit-display-name').value = 'Staged Name';
    document.getElementById('edit-bio').value = 'Staged bio';

    click('btn-edit-profile');
    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(true);
    expect(stateMod.getPendingProfileEdits()?.displayName).toBe('Staged Name');
    expect(stateMod.getPendingProfileEdits()?.bio).toBe('Staged bio');

    click('btn-edit-profile');
    expect(document.getElementById('edit-display-name').value).toBe('Staged Name');
    expect(document.getElementById('edit-bio').value).toBe('Staged bio');
  });

  test('cancel profile clears pending edits and closes panel', async () => {
    await bootApp();
    await loginAsAlice();

    click('btn-edit-profile');
    document.getElementById('edit-bio').value = 'Will be discarded';
    click('btn-cancel-profile');

    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(true);

    click('btn-edit-profile');
    expect(document.getElementById('edit-bio').value).toBe('');
  });
});

describe('app.js file attachments', () => {
  test('accepts audio/webm with codec parameter via normalizeMime', async () => {
    await bootApp();
    await loginAsAlice();

    mockUploadAttachment.mockResolvedValue({
      type: 'audio',
      url: 'https://cdn.example.com/voice.webm',
      filename: 'voice.webm',
      mimetype: 'audio/webm',
      size: 1024,
    });

    const input = document.getElementById('global-file-input');
    const file = new File(['audio-bytes'], 'voice.webm', { type: 'audio/webm;codecs=opus' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(mockUploadAttachment).toHaveBeenCalledWith(
      file,
      null,
      null,
      true
    );
    expect(document.getElementById('global-messages').textContent).not.toContain('not supported');
  });

  test('rejects unsupported MIME types with system message', async () => {
    await bootApp();
    await loginAsAlice();

    const input = document.getElementById('global-file-input');
    const file = new File(['data'], 'bad.exe', { type: 'application/x-msdownload' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(mockUploadAttachment).not.toHaveBeenCalled();
    expect(document.getElementById('global-messages').textContent).toContain('not supported');
  });
});
