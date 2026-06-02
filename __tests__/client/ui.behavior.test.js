/**
 * @jest-environment jsdom
 *
 * Behavioral regression tests for the 5 production UI defects.
 * Complements static checks in visual.regressions.test.js.
 */

import * as ui from '../../public/js/modules/ui.js';
import * as state from '../../public/js/modules/state.js';
import { mountAppHtml } from './helpers/domScaffold';
import { readStylesheet, resolveSelectColors, injectStylesheet } from './helpers/cssTestHelpers';

const mockUploadAttachment = jest.fn();

jest.mock('../../public/js/modules/api.js', () => ({
  register: jest.fn(),
  login: jest.fn(),
  fetchGlobalHistory: jest.fn().mockResolvedValue({ messages: [], hasMore: false, cursor: null }),
  fetchPrivateHistory: jest.fn(),
  fetchProfile: jest.fn(),
  updateProfile: jest.fn(),
  uploadAttachment: (...args) => mockUploadAttachment(...args),
}));

jest.mock('../../public/js/modules/socket.js', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  emitJoinRoom: jest.fn(),
  emitSendGlobalMessage: jest.fn(),
  emitSendPrivateMessage: jest.fn(),
  emitStartTyping: jest.fn(),
  emitStopTyping: jest.fn(),
}));

jest.mock('../../public/js/modules/recorder.js', () => ({
  onStateChange: jest.fn(),
  getState: jest.fn(() => 'idle'),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  discardRecording: jest.fn(),
  reset: jest.fn(),
  setSending: jest.fn(),
  setPreview: jest.fn(),
}));

let initApp;

beforeAll(async () => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-preview-url');
  global.URL.revokeObjectURL = jest.fn();
  const appMod = await import('../../public/js/app.js');
  initApp = appMod.init;
});

function bootUi() {
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  state.resetAllState();
  mountAppHtml();
  ui.initDom();
}

function bootApp() {
  jest.clearAllMocks();
  bootUi();
  initApp();
}

describe('Defect 1 — status select readable in dark mode (behavioral)', () => {
  test('stylesheet defines explicit select color and sufficient dark-mode contrast', () => {
    const css = readStylesheet();
    const colors = resolveSelectColors(css, 'dark');

    expect(colors.hasExplicitColor).toBe(true);
    expect(colors.hasColorScheme).toBe(true);
    expect(colors.color).toBeTruthy();
    expect(colors.background).toBeTruthy();
    expect(colors.color).not.toBe(colors.background);
  });

  test('profile editor select is visible when dark theme is applied in DOM', () => {
    injectStylesheet(readStylesheet());
    bootUi();
    document.documentElement.setAttribute('data-theme', 'dark');
    ui.applyTheme('dark');

    state.setCurrentUser('alice');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'alice',
      bio: '',
      status: 'online',
    });

    ui.showProfileEditor();
    const select = document.getElementById('edit-status');
    expect(select).not.toBeNull();

    const style = window.getComputedStyle(select);
    expect(style.color).not.toBe('');
    expect(style.backgroundColor).not.toBe('');
  });
});

describe('Defect 2 — edit profile toggle preserves in-flight edits (behavioral)', () => {
  test('staging survives close and reopen via state module', () => {
    bootUi();
    state.setCurrentUser('alice');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'Original',
      bio: 'Original bio',
      status: 'online',
    });

    ui.showProfileEditor();
    document.getElementById('edit-display-name').value = 'Staged Name';
    document.getElementById('edit-bio').value = 'Staged bio';

    state.setPendingProfileEdits({
      displayName: document.getElementById('edit-display-name').value,
      bio: document.getElementById('edit-bio').value,
      status: document.getElementById('edit-status').value,
      avatarFile: null,
    });
    ui.hideProfileEditor();

    ui.showProfileEditor();
    expect(document.getElementById('edit-display-name').value).toBe('Staged Name');
    expect(document.getElementById('edit-bio').value).toBe('Staged bio');
  });

  test('app.js edit profile button toggles and preserves staged edits', async () => {
    bootApp();
    state.setCurrentUser('alice');
    state.setCurrentToken('token');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'alice',
      bio: '',
      status: 'online',
    });
    ui.showChatScreen();

    document.getElementById('btn-edit-profile').click();
    document.getElementById('edit-display-name').value = 'App Staged';
    document.getElementById('btn-edit-profile').click();
    document.getElementById('btn-edit-profile').click();

    expect(document.getElementById('edit-display-name').value).toBe('App Staged');
  });
});

describe('Defect 3 — avatar preview shows image (behavioral)', () => {
  test('showAvatarPreview renders img.avatar-img with object URL', () => {
    bootUi();
    state.setCurrentUser('alice');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'Alice',
      bio: '',
      status: 'online',
    });

    const file = new File(['img'], 'avatar.png', { type: 'image/png' });
    ui.showAvatarPreview(file);

    const preview = document.getElementById('editor-avatar-preview');
    const img = preview.querySelector('img.avatar-img');
    expect(img).not.toBeNull();
    expect(img.src).toMatch(/^blob:/);
    expect(img.alt).toBe('Avatar preview');
  });
});

describe('Defect 4 — global file upload sends isGlobal flag (behavioral)', () => {
  test('global file picker uploads with isGlobal true', async () => {
    bootApp();
    state.setCurrentUser('alice');
    state.setCurrentToken('token');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'alice',
      bio: '',
      status: 'online',
    });
    ui.showChatScreen();

    mockUploadAttachment.mockResolvedValue({
      type: 'image',
      url: 'https://cdn.example.com/photo.png',
      filename: 'photo.png',
      mimetype: 'image/png',
      size: 100,
    });

    const input = document.getElementById('global-file-input');
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(mockUploadAttachment).toHaveBeenCalledWith(file, null, null, true);
    expect(document.getElementById('global-attachment-preview').classList.contains('hidden')).toBe(false);
  });
});

describe('Defect 5 — voice button states (behavioral)', () => {
  test('updateVoiceButton adds voice-recording class while recording', () => {
    bootUi();
    ui.updateVoiceButton('global', 'recording');

    const btn = document.getElementById('global-voice-btn');
    expect(btn.classList.contains('voice-recording')).toBe(true);
    expect(btn.textContent).toContain('■');
  });

  test('updateVoiceButton adds voice-sending class while uploading', () => {
    bootUi();
    ui.updateVoiceButton('global', 'sending');

    const btn = document.getElementById('global-voice-btn');
    expect(btn.classList.contains('voice-sending')).toBe(true);
    expect(btn.disabled).toBe(true);
  });

  test('updateVoiceButton returns to idle after recording stops', () => {
    bootUi();
    ui.updateVoiceButton('global', 'recording');
    ui.updateVoiceButton('global', 'idle');

    const btn = document.getElementById('global-voice-btn');
    expect(btn.classList.contains('voice-recording')).toBe(false);
    expect(btn.classList.contains('voice-sending')).toBe(false);
  });
});
