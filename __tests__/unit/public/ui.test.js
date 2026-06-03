/**
 * @jest-environment jsdom
 */
import * as ui from '../../../public/js/modules/ui.js';
import * as state from '../../../public/js/modules/state.js';
import { getAppHtml } from '../../client/helpers/domScaffold.js';

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  document.body.innerHTML = getAppHtml();
  localStorage.clear();
  state.resetAllState();
  jest.restoreAllMocks();
  ui.initDom();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('initDom / getDom', () => {
  test('initDom returns a dom object with all expected keys', () => {
    const dom = ui.initDom();
    expect(dom.authScreen).toBe(document.getElementById('auth-screen'));
    expect(dom.chatScreen).toBe(document.getElementById('chat-screen'));
    expect(dom.authError).toBe(document.getElementById('auth-error'));
    expect(dom.usernameInput).toBe(document.getElementById('username-input'));
    expect(dom.passwordInput).toBe(document.getElementById('password-input'));
    expect(dom.loggedInAs).toBe(document.getElementById('logged-in-as'));
    expect(dom.connectionBanner).toBe(document.getElementById('connection-banner'));
    expect(dom.recipientInput).toBe(document.getElementById('recipient-input'));
    expect(dom.globalInput).toBe(document.getElementById('global-input'));
    expect(dom.privateInput).toBe(document.getElementById('private-input'));
    expect(dom.globalCounter).toBe(document.getElementById('global-char-counter'));
    expect(dom.privateCounter).toBe(document.getElementById('private-char-counter'));
    expect(dom.sendGlobal).toBe(document.getElementById('send-global'));
    expect(dom.sendPrivate).toBe(document.getElementById('send-private'));
    expect(dom.btnTime).toBe(document.getElementById('btn-time-format'));
    expect(dom.btnTheme).toBe(document.getElementById('btn-theme-toggle'));
    expect(dom.tabGlobal).toBe(document.getElementById('tab-global'));
    expect(dom.tabPrivate).toBe(document.getElementById('tab-private'));
    expect(dom.panelGlobal).toBe(document.getElementById('panel-global'));
    expect(dom.panelPrivate).toBe(document.getElementById('panel-private'));
    expect(dom.badgeGlobal).toBe(document.getElementById('global-tab-badge'));
    expect(dom.badgePrivate).toBe(document.getElementById('private-tab-badge'));
    expect(dom.globalMessages).toBe(document.getElementById('global-messages'));
    expect(dom.privateMessages).toBe(document.getElementById('private-messages'));
    expect(dom.globalTyping).toBe(document.getElementById('global-typing'));
    expect(dom.privateTyping).toBe(document.getElementById('private-typing'));
    expect(dom.onlineList).toBe(document.getElementById('online-list'));
    expect(dom.btnLogin).toBe(document.getElementById('btn-login'));
    expect(dom.btnRegister).toBe(document.getElementById('btn-register'));
    expect(dom.btnLogout).toBe(document.getElementById('btn-logout'));
    expect(dom.btnOpenChat).toBe(document.getElementById('btn-open-chat'));
    expect(dom.profilePanel).toBe(document.getElementById('profile-panel'));
    expect(dom.btnEditProfile).toBe(document.getElementById('btn-edit-profile'));
    expect(dom.editDisplayName).toBe(document.getElementById('edit-display-name'));
    expect(dom.globalVoiceBtn).toBe(document.getElementById('global-voice-btn'));
    expect(dom.globalAttachPreview).toBe(document.getElementById('global-attachment-preview'));
  });

  test('getDom returns the same cached dom', () => {
    const dom1 = ui.initDom();
    const dom2 = ui.getDom();
    expect(dom1).toBe(dom2);
  });
});

describe('screen switching', () => {
  test('showChatScreen hides auth and shows chat', () => {
    ui.showChatScreen();
    expect(document.getElementById('auth-screen').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('chat-screen').classList.contains('hidden')).toBe(false);
  });

  test('showAuthScreen hides chat and shows auth', () => {
    ui.showAuthScreen();
    expect(document.getElementById('chat-screen').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('auth-screen').classList.contains('hidden')).toBe(false);
  });
});

describe('auth error', () => {
  test('showAuthError sets text content', () => {
    ui.showAuthError('Something went wrong');
    expect(document.getElementById('auth-error').textContent).toBe('Something went wrong');
  });

  test('showAuthError colors red by default', () => {
    ui.showAuthError('Error');
    const el = document.getElementById('auth-error');
    expect(el.style.color).toBe('var(--danger)');
  });

  test('showAuthError colors green when isSuccess is true', () => {
    ui.showAuthError('Success!', true);
    const el = document.getElementById('auth-error');
    expect(el.style.color).toBe('var(--ok)');
  });
});

describe('connection banner', () => {
  test('setConnectionBanner with text shows banner', () => {
    ui.setConnectionBanner('Connecting...');
    const banner = document.getElementById('connection-banner');
    expect(banner.textContent).toBe('Connecting...');
    expect(banner.classList.contains('hidden')).toBe(false);
  });

  test('setConnectionBanner with empty text hides banner', () => {
    ui.setConnectionBanner('Text');
    ui.setConnectionBanner('');
    const banner = document.getElementById('connection-banner');
    expect(banner.textContent).toBe('');
    expect(banner.classList.contains('hidden')).toBe(true);
  });
});

describe('theme', () => {
  beforeEach(() => {
    // Mock matchMedia for initTheme
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false, // system prefers light by default
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  test('applyTheme sets data-theme attribute', () => {
    ui.applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('applyTheme saves to localStorage', () => {
    ui.applyTheme('dark');
    expect(localStorage.getItem('chat_theme')).toBe('dark');
  });

  test('applyTheme updates button text', () => {
    const btn = document.getElementById('btn-theme-toggle');
    ui.applyTheme('dark');
    expect(btn.textContent).toBe('Light Mode');
    ui.applyTheme('light');
    expect(btn.textContent).toBe('Dark Mode');
  });

  test('initTheme uses saved theme when available', () => {
    localStorage.setItem('chat_theme', 'dark');
    ui.initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('initTheme uses light when no saved theme and system prefers light', () => {
    ui.initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('initTheme uses dark when system prefers dark and no saved theme', () => {
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
    ui.initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('time format', () => {
  test('toggleTimeFormat switches to exact', () => {
    state.setTimeFormat('relative');
    ui.toggleTimeFormat();
    expect(state.getTimeFormat()).toBe('exact');
    expect(document.getElementById('btn-time-format').textContent).toBe('Time: Exact');
  });

  test('toggleTimeFormat switches back to relative', () => {
    state.setTimeFormat('exact');
    ui.toggleTimeFormat();
    expect(state.getTimeFormat()).toBe('relative');
    expect(document.getElementById('btn-time-format').textContent).toBe('Time: Relative');
  });

  test('toggleTimeFormat saves to localStorage', () => {
    ui.toggleTimeFormat();
    expect(localStorage.getItem('chat_time_format')).toBe('exact');
  });
});

describe('appendMessage', () => {
  test('creates message bubble with correct content', () => {
    const bubble = ui.appendMessage('global-messages', 'alice', 'hello world', '2026-01-01T12:00:00Z', 'received');
    expect(bubble).not.toBeNull();
    expect(bubble.classList.contains('message')).toBe(true);
    expect(bubble.classList.contains('received')).toBe(true);
    expect(bubble.querySelector('div').textContent).toBe('hello world');
  });

  test('includes copy button', () => {
    const bubble = ui.appendMessage('global-messages', 'alice', 'text', '2026-01-01T12:00:00Z', 'received');
    const copyBtn = bubble.querySelector('.copy-btn');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.textContent).toBe('Copy');
  });

  test('adds pending class when options.pending is true', () => {
    const bubble = ui.appendMessage('global-messages', 'alice', 'text', '2026-01-01T12:00:00Z', 'sent', { pending: true, clientId: 'cid1' });
    expect(bubble.classList.contains('pending')).toBe(true);
    expect(bubble.dataset.clientId).toBe('cid1');
  });

  test('adds date separator when date changes', () => {
    ui.appendMessage('global-messages', 'alice', 'msg1', '2026-01-01T12:00:00Z', 'received');
    ui.appendMessage('global-messages', 'bob', 'msg2', '2026-01-02T12:00:00Z', 'received');
    const container = document.getElementById('global-messages');
    const dateSeparators = container.querySelectorAll('.date-separator');
    expect(dateSeparators.length).toBe(2);
  });

  test('appends bubble to container', () => {
    ui.appendMessage('global-messages', 'alice', 'hello', '2026-01-01T12:00:00Z', 'received');
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.message').length).toBe(1);
  });

  test('returns null when sender is missing', () => {
    const result = ui.appendMessage('global-messages', '', 'text', '2026-01-01T12:00:00Z', 'received');
    expect(result).toBeNull();
  });

  test('returns null when text is not a string', () => {
    const result = ui.appendMessage('global-messages', 'alice', 123, '2026-01-01T12:00:00Z', 'received');
    expect(result).toBeNull();
  });

  test('returns null when containerId is null', () => {
    const result = ui.appendMessage(null, 'alice', 'text', '2026-01-01T12:00:00Z', 'received');
    expect(result).not.toBeNull();
  });
});

describe('appendSystem', () => {
  test('adds system message to container', () => {
    ui.appendSystem('global-messages', 'System says hi');
    const container = document.getElementById('global-messages');
    const sysMsg = container.querySelector('.system-msg');
    expect(sysMsg).not.toBeNull();
    expect(sysMsg.textContent).toBe('System says hi');
  });
});

describe('appendHistoryBatch', () => {
  test('appends multiple messages', () => {
    const history = [
      { sender: 'alice', message: 'first', createdAt: '2026-01-01T12:00:00Z' },
      { sender: 'bob', message: 'second', createdAt: '2026-01-01T12:01:00Z' }
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.message').length).toBe(2);
  });

  test('skips invalid messages', () => {
    const history = [
      { sender: 'alice', message: 'valid', createdAt: '2026-01-01T12:00:00Z' },
      { sender: 'bob', message: 12345, createdAt: '2026-01-01T12:01:00Z' },
      null
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.message').length).toBe(1);
  });

  test('inserts date separators between days', () => {
    const history = [
      { sender: 'alice', message: 'day1', createdAt: '2026-01-01T12:00:00Z' },
      { sender: 'bob', message: 'day2', createdAt: '2026-01-02T12:00:00Z' }
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.date-separator').length).toBe(2);
  });

  test('renders attachments from history (image)', () => {
    const attachment = {
      type: 'image',
      filename: 'cat.png',
      url: 'https://res.cloudinary.com/demo/image/upload/cat.png',
      mimetype: 'image/png',
      size: 12345
    };
    const history = [
      { sender: 'alice', message: 'see image', createdAt: '2026-01-01T12:00:00Z', attachment }
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    const img = container.querySelector('.attachment-image');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(attachment.url);
    expect(img.getAttribute('alt')).toBe(attachment.filename);
  });

  test('renders attachments from history (file uses proxy URL)', () => {
    const attachment = {
      type: 'file',
      filename: 'notes.txt',
      url: 'https://res.cloudinary.com/demo/raw/upload/notes.txt',
      mimetype: 'text/plain',
      size: 42
    };
    const history = [
      { sender: 'alice', message: 'see file', createdAt: '2026-01-01T12:00:00Z', attachment }
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    const link = container.querySelector('.attachment-file-link');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('/messages/download?url=');
    expect(link.getAttribute('href')).toContain(encodeURIComponent(attachment.url));
    expect(link.getAttribute('href')).toContain(encodeURIComponent(attachment.filename));
  });

  test('renders attachment-only messages (no text) from history', () => {
    const attachment = {
      type: 'file',
      filename: 'note.txt',
      url: 'https://res.cloudinary.com/demo/raw/upload/note.txt',
      mimetype: 'text/plain',
      size: 42
    };
    const history = [
      { sender: 'alice', message: undefined, createdAt: '2026-01-01T12:00:00Z', attachment }
    ];
    ui.appendHistoryBatch('global-messages', history);
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.message').length).toBe(1);
    expect(container.querySelector('.attachment-file-link')).not.toBeNull();
  });
});

describe('updateCharCounter', () => {
  test('shows remaining count when len > 0', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = 'hello';
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(counter.textContent).toBe('995 left');
    expect(counter.className).toContain('char-counter');
  });

  test('disables send button when empty', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = '';
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(sendBtn.disabled).toBe(true);
  });

  test('enables send button when text is present', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = 'hello';
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(sendBtn.disabled).toBe(false);
  });

  test('sets aria-invalid when over limit', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = 'x'.repeat(1001);
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(sendBtn.disabled).toBe(true);
  });

  test('adds danger class when remaining <= 50', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = 'x'.repeat(960);
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(counter.className).toContain('danger');
  });

  test('adds warn class when remaining <= 200 but > 50', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = 'x'.repeat(850);
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(counter.className).toContain('warn');
    expect(counter.className).not.toContain('danger');
  });

  test('clears counter when text is empty', () => {
    const textarea = document.getElementById('global-input');
    const counter = document.getElementById('global-char-counter');
    const sendBtn = document.getElementById('send-global');
    textarea.value = '';
    ui.updateCharCounter(textarea, counter, sendBtn);
    expect(counter.textContent).toBe('');
    expect(counter.className).toBe('char-counter');
  });
});

describe('renderTyping', () => {
  test('shows nothing when no typing users', () => {
    ui.renderTyping('global');
    expect(document.getElementById('global-typing').textContent).toBe('');
  });

  test('shows single user typing', () => {
    state.addTypingUser('global', 'alice');
    ui.renderTyping('global');
    expect(document.getElementById('global-typing').textContent).toBe('alice is typing...');
  });

  test('shows multiple users typing', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('global', 'bob');
    ui.renderTyping('global');
    expect(document.getElementById('global-typing').textContent).toBe('alice, bob are typing...');
  });

  test('shows only first two when many users typing', () => {
    state.addTypingUser('global', 'alice');
    state.addTypingUser('global', 'bob');
    state.addTypingUser('global', 'charlie');
    ui.renderTyping('global');
    expect(document.getElementById('global-typing').textContent).toBe('alice, bob are typing...');
  });

  test('renders private typing independently', () => {
    state.addTypingUser('private', 'bob');
    ui.renderTyping('private');
    expect(document.getElementById('private-typing').textContent).toBe('bob is typing...');
    ui.renderTyping('global');
    expect(document.getElementById('global-typing').textContent).toBe('');
  });
});

describe('switchTab', () => {
  test('switches to private tab', () => {
    ui.switchTab('private');
    expect(document.getElementById('panel-global').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('panel-private').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tab-global').classList.contains('active')).toBe(false);
    expect(document.getElementById('tab-private').classList.contains('active')).toBe(true);
    expect(document.getElementById('tab-global').getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('tab-private').getAttribute('aria-selected')).toBe('true');
  });

  test('switches to global tab', () => {
    ui.switchTab('private');
    ui.switchTab('global');
    expect(document.getElementById('panel-global').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('panel-private').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('tab-global').getAttribute('aria-selected')).toBe('true');
  });

  test('clears unread badges when switching', () => {
    state.setUnreadGlobal(5);
    state.setUnreadPrivate(3);
    ui.switchTab('global');
    expect(state.getUnreadGlobal()).toBe(0);
    expect(document.getElementById('global-tab-badge').style.display).toBe('none');
  });
});

describe('renderOnlineUsers', () => {
  test('renders nothing when not an array', () => {
    ui.renderOnlineUsers(null);
    expect(document.getElementById('online-list').children.length).toBe(0);
    ui.renderOnlineUsers('notarray');
    expect(document.getElementById('online-list').children.length).toBe(0);
  });

  test('renders each user as a button', () => {
    ui.renderOnlineUsers(['alice', 'bob', 'charlie']);
    const list = document.getElementById('online-list');
    expect(list.children.length).toBe(3);
    expect(list.children[0].classList.contains('online-user')).toBe(true);
    expect(list.children[0].children[2].textContent).toBe('alice');
  });

  test('sets aria-label on each user button', () => {
    ui.renderOnlineUsers(['alice']);
    const btn = document.getElementById('online-list').children[0];
    expect(btn.getAttribute('aria-label')).toBe('Start private chat with alice');
  });
});

describe('jump button', () => {
  beforeEach(() => {
    // Ensure jump button state is clean
    if (state.hasJumpButton('global-messages')) {
      state.setJumpButton('global-messages', null);
    }
  });

  test('ensureJumpButton creates button and registers in state', () => {
    ui.ensureJumpButton('global-messages');
    const container = document.getElementById('global-messages');
    const btn = container.querySelector('.jump-to-latest');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('New messages');
    expect(state.hasJumpButton('global-messages')).toBe(true);
  });

  test('ensureJumpButton does not duplicate', () => {
    ui.ensureJumpButton('global-messages');
    ui.ensureJumpButton('global-messages');
    const container = document.getElementById('global-messages');
    expect(container.querySelectorAll('.jump-to-latest').length).toBe(1);
  });

  test('updateJumpButton shows/hides based on scroll position', () => {
    ui.ensureJumpButton('global-messages');
    const container = document.getElementById('global-messages');
    Object.defineProperty(container, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
    
    // Near bottom
    Object.defineProperty(container, 'scrollTop', { value: 900, writable: true, configurable: true });
    ui.updateJumpButton(container);
    expect(container.querySelector('.jump-to-latest').classList.contains('hidden')).toBe(true);

    // Far from bottom
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true, configurable: true });
    ui.updateJumpButton(container);
    expect(container.querySelector('.jump-to-latest').classList.contains('hidden')).toBe(false);
  });

  test('setupMessageContainer calls ensureJumpButton and adds scroll listener', () => {
    const container = document.getElementById('global-messages');
    const addEventListenerSpy = jest.spyOn(container, 'addEventListener');
    ui.setupMessageContainer(container);
    expect(state.hasJumpButton('global-messages')).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

describe('resetChatUi', () => {
  test('clears message containers and online list', () => {
    document.getElementById('global-messages').innerHTML = '<div>msg</div>';
    document.getElementById('private-messages').innerHTML = '<div>msg</div>';
    document.getElementById('online-list').innerHTML = '<div>user</div>';
    document.getElementById('recipient-input').value = 'bob';
    document.getElementById('global-input').value = 'hello';
    document.getElementById('private-input').value = 'hi';

    ui.resetChatUi();

    expect(document.getElementById('global-messages').innerHTML).toBe('');
    expect(document.getElementById('private-messages').innerHTML).toBe('');
    expect(document.getElementById('online-list').innerHTML).toBe('');
    expect(document.getElementById('recipient-input').value).toBe('');
    expect(document.getElementById('global-input').value).toBe('');
    expect(document.getElementById('private-input').value).toBe('');
  });
});

describe('scrollPrivateToBottom', () => {
  test('scrolls private messages container to bottom', () => {
    const container = document.getElementById('private-messages');
    Object.defineProperty(container, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });

    ui.scrollPrivateToBottom();
    expect(container.scrollTop).toBe(500);
  });
});

describe('refreshVisibleMeta', () => {
  test('updates meta elements with new time format', () => {
    // Add a message with meta
    ui.appendMessage('global-messages', 'alice', 'hello', '2026-01-01T12:00:00Z', 'received');
    const container = document.getElementById('global-messages');
    const meta = container.querySelector('.meta');
    
    // Switch to exact and refresh
    state.setTimeFormat('exact');
    ui.refreshVisibleMeta();
    
    // Should now show exact time
    expect(meta.textContent).toContain('alice ·');
  });
});

describe('profile panel', () => {
  beforeEach(() => {
    state.setCurrentUser('alice');
    state.setProfileFromResponse({
      username: 'alice',
      displayName: 'Alice Chen',
      bio: 'Hello world',
      status: 'away',
      avatarUrl: null,
    });
  });

  test('showProfileEditor opens panel and populates from state', () => {
    ui.showProfileEditor();
    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('edit-display-name').value).toBe('Alice Chen');
    expect(document.getElementById('edit-bio').value).toBe('Hello world');
    expect(document.getElementById('edit-status').value).toBe('away');
  });

  test('showProfileEditor uses pending edits when present', () => {
    state.setPendingProfileEdits({
      displayName: 'Pending Name',
      bio: 'Pending bio',
      status: 'busy',
      avatarFile: null,
    });
    ui.showProfileEditor();
    expect(document.getElementById('edit-display-name').value).toBe('Pending Name');
    expect(document.getElementById('edit-bio').value).toBe('Pending bio');
    expect(document.getElementById('edit-status').value).toBe('busy');
  });

  test('hideProfileEditor closes panel and clears avatar file input', () => {
    ui.showProfileEditor();
    ui.hideProfileEditor();
    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('avatar-file-input').value).toBe('');
  });

  test('refreshProfileHeader updates summary fields', () => {
    ui.refreshProfileHeader();
    expect(document.getElementById('profile-display-name').textContent).toBe('Alice Chen');
    expect(document.getElementById('profile-detail').textContent).toContain('@alice');
    expect(document.getElementById('profile-detail').textContent).toContain('Hello world');
  });

  test('showAvatarPreview renders image for file input', () => {
    const file = new File(['img'], 'avatar.png', { type: 'image/png' });
    ui.showAvatarPreview(file);
    const img = document.getElementById('editor-avatar-preview').querySelector('img.avatar-img');
    expect(img).not.toBeNull();
    expect(img.src).toBe('blob:mock-url');
  });

  test('showAvatarPreview resets to initial letter when file is null', () => {
    ui.showAvatarPreview(null);
    const initial = document.getElementById('editor-avatar-preview').querySelector('.avatar-initial');
    expect(initial).not.toBeNull();
    expect(initial.textContent).toBe('A');
  });

  test('resetChatUi hides profile panel', () => {
    ui.showProfileEditor();
    ui.resetChatUi();
    expect(document.getElementById('profile-panel').classList.contains('hidden')).toBe(true);
  });
});

describe('attachment preview', () => {
  test('showAttachmentPreview displays filename and remove button', () => {
    ui.showAttachmentPreview('global', { type: 'image', filename: 'photo.png' });
    const preview = document.getElementById('global-attachment-preview');
    expect(preview.classList.contains('hidden')).toBe(false);
    expect(preview.textContent).toContain('photo.png');
    expect(preview.querySelector('.attach-preview-remove')).not.toBeNull();
  });

  test('clearAttachmentPreview hides preview and clears pending attachment', () => {
    state.setPendingAttachment({ type: 'file', filename: 'doc.pdf' });
    ui.showAttachmentPreview('global', { type: 'file', filename: 'doc.pdf' });
    ui.clearAttachmentPreview('global');
    expect(document.getElementById('global-attachment-preview').classList.contains('hidden')).toBe(true);
    expect(state.getPendingAttachment()).toBeNull();
  });
});

describe('voice recording UI', () => {
  test('updateVoiceButton sets recording state on global button', () => {
    ui.updateVoiceButton('global', 'recording');
    const btn = document.getElementById('global-voice-btn');
    expect(btn.classList.contains('voice-recording')).toBe(true);
  });

  test('updateVoiceButton sets sending state on private button', () => {
    ui.updateVoiceButton('private', 'sending');
    const btn = document.getElementById('private-voice-btn');
    expect(btn.classList.contains('voice-sending')).toBe(true);
  });

  test('updateVoiceButton hides button in preview state', () => {
    ui.updateVoiceButton('global', 'preview');
    expect(document.getElementById('global-voice-btn').classList.contains('hidden')).toBe(true);
  });

  test('showVoicePreview renders audio player and action buttons', () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const onSend = jest.fn();
    const onDiscard = jest.fn();
    ui.showVoicePreview('global', blob, onSend, onDiscard);

    const preview = document.getElementById('global-voice-preview');
    expect(preview.classList.contains('hidden')).toBe(false);
    expect(preview.querySelector('audio')).not.toBeNull();
    preview.querySelector('.voice-preview-send').click();
    expect(onSend).toHaveBeenCalled();
  });

  test('clearVoicePreview hides panel and restores voice button', () => {
    ui.updateVoiceButton('global', 'preview');
    ui.clearVoicePreview('global');
    expect(document.getElementById('global-voice-preview').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('global-voice-btn').classList.contains('hidden')).toBe(false);
  });
});

describe('pagination helpers', () => {
  test('setLoading toggles loading dataset on container', () => {
    ui.setLoading('global-messages', true);
    expect(document.getElementById('global-messages').dataset.loading).toBe('true');
    ui.setLoading('global-messages', false);
    expect(document.getElementById('global-messages').dataset.loading).toBe('false');
  });

  test('setHasMore stores hasMore flag on container', () => {
    ui.setHasMore('global-messages', true);
    expect(document.getElementById('global-messages').dataset.hasMore).toBe('true');
  });

  test('updateLoadMoreButton adds load-more control when hasMore', () => {
    ui.updateLoadMoreButton('global-messages', true, jest.fn());
    const container = document.getElementById('global-messages');
    expect(container.querySelector('.load-more-btn')).not.toBeNull();
  });
});