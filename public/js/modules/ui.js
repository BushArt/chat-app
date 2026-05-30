/* eslint-env browser */
import * as state from './state.js';
import * as utils from './utils.js';

let dom;

/**
 * Deterministically generate a background color from a string (username).
 */
function colorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

/**
 * Create an avatar element (img if URL present, otherwise initials circle).
 */
export function createAvatarElement(avatarUrl, displayName, sizeClass = '') {
  const el = document.createElement('span');
  el.className = `avatar ${sizeClass}`.trim();
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.src = avatarUrl;
    img.alt = '';
    img.loading = 'lazy';
    el.appendChild(img);
  } else {
    const initial = displayName && displayName.length > 0 ? [...displayName][0].toUpperCase() : '?';
    const bg = colorFromString(displayName || '?');
    const initialEl = document.createElement('span');
    initialEl.className = 'avatar-initial';
    initialEl.textContent = initial;
    initialEl.style.background = bg;
    el.appendChild(initialEl);
  }
  return el;
}

function getDateKey(time) {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appendDateSeparator(parent, container, time) {
  const separator = document.createElement("p");
  separator.classList.add("date-separator");
  separator.textContent = utils.formatDateLabel(time);
  parent.appendChild(separator);
  if (container) {
    container.dataset.lastDate = getDateKey(time);
  }
}

export function initDom() {
  dom = {
    authScreen: document.getElementById("auth-screen"),
    chatScreen: document.getElementById("chat-screen"),
    authError: document.getElementById("auth-error"),
    usernameInput: document.getElementById("username-input"),
    passwordInput: document.getElementById("password-input"),
    loggedInAs: document.getElementById("logged-in-as"),
    connectionBanner: document.getElementById("connection-banner"),
    recipientInput: document.getElementById("recipient-input"),
    globalInput: document.getElementById("global-input"),
    privateInput: document.getElementById("private-input"),
    globalCounter: document.getElementById("global-char-counter"),
    privateCounter: document.getElementById("private-char-counter"),
    sendGlobal: document.getElementById("send-global"),
    sendPrivate: document.getElementById("send-private"),
    btnTime: document.getElementById("btn-time-format"),
    btnTheme: document.getElementById("btn-theme-toggle"),
    tabGlobal: document.getElementById("tab-global"),
    tabPrivate: document.getElementById("tab-private"),
    panelGlobal: document.getElementById("panel-global"),
    panelPrivate: document.getElementById("panel-private"),
    badgeGlobal: document.getElementById("global-tab-badge"),
    badgePrivate: document.getElementById("private-tab-badge"),
    globalMessages: document.getElementById("global-messages"),
    privateMessages: document.getElementById("private-messages"),
    globalTyping: document.getElementById("global-typing"),
    privateTyping: document.getElementById("private-typing"),
    onlineList: document.getElementById("online-list"),
    btnLogin: document.getElementById("btn-login"),
    btnRegister: document.getElementById("btn-register"),
    btnLogout: document.getElementById("btn-logout"),
    btnOpenChat: document.getElementById("btn-open-chat"),
    // Profile panel elements
    profilePanel: document.getElementById("profile-panel"),
    btnEditProfile: document.getElementById("btn-edit-profile"),
    profileDisplayName: document.getElementById("profile-display-name"),
    profileDetail: document.getElementById("profile-detail"),
    profileAvatarPreview: document.getElementById("profile-avatar-preview"),
    editDisplayName: document.getElementById("edit-display-name"),
    editBio: document.getElementById("edit-bio"),
    editStatus: document.getElementById("edit-status"),
    btnSaveProfile: document.getElementById("btn-save-profile"),
    btnCancelProfile: document.getElementById("btn-cancel-profile"),
    btnUploadAvatar: document.getElementById("btn-upload-avatar"),
    avatarFileInput: document.getElementById("avatar-file-input")
  };
  return dom;
}

export function getDom() {
  return dom;
}

export function refreshVisibleMeta() {
  if (state.getTimeFormat() !== "relative") return;
  const now = Date.now();
  document.querySelectorAll(".message .meta[data-time]").forEach((meta) => {
    const time = meta.getAttribute("data-time");
    if (!time || (now - new Date(time).getTime()) >= 86400000) return;
    const sender = meta.getAttribute("data-sender") || "";
    const isReceived = meta.getAttribute("data-type") === "received";
    meta.textContent = (isReceived && sender ? sender + " · " : "") + utils.displayTime(time, "relative");
    meta.title = utils.formatTime(time);
  });
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  utils.safeLocalStorageSet("chat_theme", theme);
  dom.btnTheme.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
}

export function initTheme() {
  if (!state.FEATURE_FLAGS.darkMode) return;
  const savedTheme = utils.safeLocalStorageGet("chat_theme");
  const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));
}

export function setConnectionBanner(text) {
  if (!text) {
    dom.connectionBanner.classList.add("hidden");
    dom.connectionBanner.textContent = "";
    return;
  }
  dom.connectionBanner.textContent = text;
  dom.connectionBanner.classList.remove("hidden");
}

export function toggleTimeFormat() {
  const newFormat = state.getTimeFormat() === "relative" ? "exact" : "relative";
  state.setTimeFormat(newFormat);
  utils.safeLocalStorageSet("chat_time_format", newFormat);
  dom.btnTime.textContent = newFormat === "relative" ? "Time: Relative" : "Time: Exact";
  refreshVisibleMeta();
}

export function appendMessage(containerId, sender, text, time, type, options = {}) {
  if (!sender || typeof text !== "string" || !time) return null;
  const container = containerId ? document.getElementById(containerId) : null;
  if (container) {
    const dateKey = getDateKey(time);
    if (container.dataset.lastDate !== dateKey) {
      appendDateSeparator(container, container, time);
    }
  }
  const bubble = document.createElement("div");
  bubble.classList.add("message", type);
  if (options.pending) bubble.classList.add("pending");
  if (options.clientId) bubble.dataset.clientId = options.clientId;

  // For received messages, show sender avatar
  if (type === "received") {
    // Determine display name and avatar URL for the sender
    const onlineMap = state.getOnlineUsersMap();
    const userData = onlineMap.get(sender);
    const displayName = userData ? userData.displayName : sender;
    const avatarUrl = userData ? userData.avatarUrl : null;
    const avatar = createAvatarElement(avatarUrl, displayName);
    bubble.appendChild(avatar);
  }

  const textDiv = document.createElement("div");
  textDiv.textContent = text;
  bubble.appendChild(textDiv);

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.setAttribute("aria-label", "Copy message text");
  copyBtn.onclick = () => utils.tryCopyText(text);
  bubble.appendChild(copyBtn);

  const metaDiv = document.createElement("div");
  metaDiv.classList.add("meta");
  metaDiv.setAttribute("data-time", time);
  metaDiv.setAttribute("data-type", type);
  metaDiv.setAttribute("data-sender", sender);
  metaDiv.textContent = (type === "received" ? sender + " · " : "") + utils.displayTime(time, state.getTimeFormat());
  metaDiv.title = utils.formatTime(time);
  bubble.appendChild(metaDiv);

  if (container) {
    container.appendChild(bubble);
    if (type === "sent") {
      utils.scrollToBottom(container);
    } else {
      utils.maybeScrollToBottom(container);
    }
    updateJumpButton(container);
  }
  return bubble;
}

export function appendSystem(containerId, text) {
  const container = document.getElementById(containerId);
  const p = document.createElement("p");
  p.classList.add("system-msg");
  p.textContent = text;
  container.appendChild(p);
  utils.maybeScrollToBottom(container);
  updateJumpButton(container);
}

export function appendHistoryBatch(containerId, history, mode = 'replace') {
  const container = document.getElementById(containerId);
  const fragment = document.createDocumentFragment();
  let lastDate = mode === 'prepend' ? container.dataset.lastDate || "" : "";
  history.forEach((msg) => {
    if (!msg || typeof msg.message !== "string") return;
    if (!msg.createdAt || Number.isNaN(new Date(msg.createdAt).getTime())) return;
    const dateKey = getDateKey(msg.createdAt);
    if (lastDate !== dateKey) {
      appendDateSeparator(fragment, container, msg.createdAt);
      lastDate = dateKey;
    }
    const bubble = appendMessage(null, msg.sender, msg.message, msg.createdAt, msg.sender === state.getCurrentUser() ? "sent" : "received");
    fragment.appendChild(bubble);
  });
  if (lastDate) {
    container.dataset.lastDate = lastDate;
  }
  if (mode === 'prepend') {
    const prevScrollHeight = container.scrollHeight;
    container.insertBefore(fragment, container.firstChild);
    container.scrollTop = container.scrollHeight - prevScrollHeight;
  } else {
    container.appendChild(fragment);
    utils.scrollToBottom(container);
  }
}

/**
 * Show or hide the "Load earlier messages" button at the top of a message container.
 */
export function updateLoadMoreButton(containerId, hasMore, loadCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let btn = container.querySelector('.load-more-btn');
  if (!hasMore) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.textContent = 'Load earlier messages';
    btn.type = 'button';
    container.insertBefore(btn, container.firstChild);
  }
  btn.onclick = loadCallback;
}

/**
 * Set up a scroll sentinel on a message container that triggers a load-more
 * callback when the user scrolls to the top. Only fires when hasMore is true
 * and no load is already in progress.
 */
export function setupScrollPagination(containerId, loadMore) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('scroll', () => {
    if (container.scrollTop <= 5 && !container.dataset.loading && container.dataset.hasMore === 'true') {
      loadMore();
    }
  });
}

/**
 * Mark a container as currently loading (prevents duplicate triggers).
 */
export function setLoading(containerId, loading) {
  const container = document.getElementById(containerId);
  if (container) {
    container.dataset.loading = loading ? 'true' : 'false';
  }
}

/**
 * Store whether more pages exist for a given container.
 */
export function setHasMore(containerId, hasMore) {
  const container = document.getElementById(containerId);
  if (container) {
    container.dataset.hasMore = hasMore ? 'true' : 'false';
  }
}

export function updateCharCounter(textarea, counterEl, sendButton) {
  const len = [...textarea.value].length;
  const remaining = utils.MAX_LEN - len;
  if (len > 0) {
    counterEl.textContent = remaining + " left";
    counterEl.className = "char-counter" + (remaining <= 50 ? " danger" : remaining <= 200 ? " warn" : "");
  } else {
    counterEl.textContent = "";
    counterEl.className = "char-counter";
  }
  sendButton.disabled = len === 0 || remaining < 0;
  textarea.setAttribute("aria-invalid", remaining < 0 ? "true" : "false");
}

export function renderTyping(channel) {
  const el = channel === "global" ? dom.globalTyping : dom.privateTyping;
  const users = state.getTypingUsers(channel);
  if (users.length === 0) el.textContent = "";
  else if (users.length === 1) el.textContent = users[0] + " is typing...";
  else el.textContent = users.slice(0, 2).join(", ") + " are typing...";
}

export function switchTab(tab) {
  state.setActiveTab(tab);
  const isGlobal = tab === "global";
  dom.panelGlobal.classList.toggle("hidden", !isGlobal);
  dom.panelPrivate.classList.toggle("hidden", isGlobal);
  dom.tabGlobal.classList.toggle("active", isGlobal);
  dom.tabPrivate.classList.toggle("active", !isGlobal);
  dom.tabGlobal.setAttribute("aria-selected", isGlobal ? "true" : "false");
  dom.tabPrivate.setAttribute("aria-selected", isGlobal ? "false" : "true");

  if (isGlobal) {
    state.setUnreadGlobal(0);
    dom.badgeGlobal.style.display = "none";
    dom.badgeGlobal.textContent = "";
  } else {
    state.setUnreadPrivate(0);
    if (dom.badgePrivate) {
      dom.badgePrivate.style.display = "none";
      dom.badgePrivate.textContent = "";
    }
  }
}

export function enableTabKeyboard() {
  const tabs = [dom.tabGlobal, dom.tabPrivate];
  tabs.forEach((tab, index) => {
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
        tabs[next].focus();
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        tabs[index].click();
      }
    });
  });
}

const STATUS_CLASS = {
  online: "online-dot online",
  away: "online-dot away",
  busy: "online-dot busy",
  offline: "online-dot offline"
};

function resolveUserEntry(entry) {
  if (typeof entry === 'string') {
    return { username: entry, displayName: entry, status: 'online', avatarUrl: null };
  }
  if (entry && typeof entry === 'object') {
    return {
      username: entry.username || '',
      displayName: entry.displayName || entry.username || '',
      status: entry.status || 'online',
      avatarUrl: entry.avatarUrl || null
    };
  }
  return null;
}

export function renderOnlineUsers(users) {
  dom.onlineList.innerHTML = "";
  if (!Array.isArray(users)) return;
  const fragment = document.createDocumentFragment();
  users.forEach((entry) => {
    const user = resolveUserEntry(entry);
    if (!user || !user.username) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("online-user");
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", "Start private chat with " + user.displayName);

    // Avatar thumbnail
    const avatar = createAvatarElement(user.avatarUrl, user.displayName);

    const dot = document.createElement("span");
    dot.className = STATUS_CLASS[user.status] || "online-dot";

    const name = document.createElement("span");
    name.textContent = user.displayName;
    name.title = user.username; // Show raw username as tooltip

    btn.appendChild(avatar);
    btn.appendChild(dot);
    btn.appendChild(name);
    btn.onclick = () => {
      if (user.username === state.getCurrentUser()) return;
      dom.recipientInput.value = user.username;
      switchTab("private");

      // Auto start chat when clicking online user
      dom.recipientInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    };
    btn.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        btn.click();
      }
    });
    fragment.appendChild(btn);
  });
  dom.onlineList.appendChild(fragment);
}

export function ensureJumpButton(containerId) {
  if (!state.FEATURE_FLAGS.jumpToLatest || state.hasJumpButton(containerId)) return;
  const container = document.getElementById(containerId);
  const btn = document.createElement("button");
  btn.className = "jump-to-latest hidden";
  btn.textContent = "New messages";
  btn.type = "button";
  btn.onclick = () => utils.scrollToBottom(container);
  container.appendChild(btn);
  state.setJumpButton(containerId, btn);
}

export function updateJumpButton(container) {
  const btn = state.getJumpButton(container.id);
  if (!btn) return;
  if (utils.isNearBottom(container)) btn.classList.add("hidden");
  else btn.classList.remove("hidden");
}

export function setupMessageContainer(container) {
  ensureJumpButton(container.id);
  container.addEventListener("scroll", () => updateJumpButton(container));
}

export function resetChatUi() {
  [dom.globalMessages, dom.privateMessages, dom.onlineList].forEach((el) => {
    el.innerHTML = "";
  });
  dom.recipientInput.value = "";
  dom.globalInput.value = "";
  dom.privateInput.value = "";
  utils.autoResize(dom.globalInput);
  utils.autoResize(dom.privateInput);
  updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
  updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
  switchTab("global");
  // Hide profile panel on logout
  if (dom.profilePanel) dom.profilePanel.classList.add("hidden");
}

export function showAuthError(message, isSuccess = false) {
  dom.authError.style.color = isSuccess ? "var(--ok)" : "var(--danger)";
  dom.authError.textContent = message;
}

export function showChatScreen() {
  dom.authScreen.classList.add("hidden");
  dom.chatScreen.classList.remove("hidden");
}

export function showAuthScreen() {
  dom.chatScreen.classList.add("hidden");
  dom.authScreen.classList.remove("hidden");
}

export function scrollPrivateToBottom() {
  if (dom.privateMessages) {
    utils.scrollToBottom(dom.privateMessages);
  }
}

// ── Profile Panel ──

/**
 * Refresh the profile panel summary (header area) with current state values.
 */
export function refreshProfileHeader() {
  if (!dom.profileDisplayName) return;
  const displayName = state.getCurrentDisplayName();
  const username = state.getCurrentUser();
  const bio = state.getCurrentBio();
  const avatarUrl = state.getCurrentAvatarUrl();

  dom.profileDisplayName.textContent = displayName || username;

  const parts = [];
  if (username) parts.push('@' + username);
  if (bio) parts.push(bio);
  dom.profileDetail.textContent = parts.join(' · ') || '';

  // Update summary avatar
  if (dom.profileAvatarPreview) {
    const newAvatar = createAvatarElement(avatarUrl, displayName || username);
    dom.profileAvatarPreview.replaceWith(newAvatar);
    dom.profileAvatarPreview = newAvatar;
  }
}

/**
 * Open the profile edit panel and populate fields with current values.
 */
export function showProfileEditor() {
  if (!dom.profilePanel) return;
  dom.profilePanel.classList.remove("hidden");
  dom.editDisplayName.value = state.getCurrentDisplayName();
  dom.editBio.value = state.getCurrentBio() || '';
  dom.editStatus.value = state.getCurrentStatus();
  // Update editor avatar preview
  const editorPreview = document.getElementById('editor-avatar-preview');
  if (editorPreview) {
    const newPreview = createAvatarElement(state.getCurrentAvatarUrl(), state.getCurrentDisplayName());
    editorPreview.replaceWith(newPreview);
    document.getElementById('editor-avatar-preview')?.replaceWith(newPreview);
  }
}

/**
 * Close the profile edit panel.
 */
export function hideProfileEditor() {
  if (!dom.profilePanel) return;
  dom.profilePanel.classList.add("hidden");
  // Reset file input
  if (dom.avatarFileInput) dom.avatarFileInput.value = '';
}

/**
 * Show a preview of the selected avatar file before upload.
 */
export function showAvatarPreview(file) {
  const previewContainer = document.getElementById('editor-avatar-preview');
  if (!previewContainer) return;
  if (!file) {
    // Reset to current
    const newPreview = createAvatarElement(state.getCurrentAvatarUrl(), state.getCurrentDisplayName());
    previewContainer.replaceWith(newPreview);
    return;
  }
  const url = URL.createObjectURL(file);
  const img = document.createElement('span');
  img.className = 'avatar';
  img.innerHTML = `<img class="avatar-img" src="${url}" alt="Avatar preview">`;
  previewContainer.replaceWith(img);
  // The caller will handle revoking the object URL after upload
}