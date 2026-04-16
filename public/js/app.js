/* eslint-env browser */
/* global io */

// ---- state ----
const MAX_LEN = 1000;
const FEATURE_FLAGS = {
  darkMode: true,
  optimisticSend: true,
  jumpToLatest: true
};

let currentUser = null;
let currentToken = null;
let currentRoom = null;
let currentRecipient = null;
let activeTab = "global";
let unreadGlobal = 0;
let unreadPrivate = 0;
let sendingGlobal = false;
let sendingPrivate = false;
let timeFormat = localStorage.getItem("chat_time_format") || "relative";

const typingState = { global: new Set(), private: new Set() };
const typingTimers = {};
const optimisticByChannel = { global: [], private: [] };
const jumpButtons = {};
const privateMessagesBuffer = new Map();

// Socket intentionally keeps the same transport contract.
const socket = io({ autoConnect: false });

let dom;

function initDom() {
  return {
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
    btnOpenChat: document.getElementById("btn-open-chat")
  };
}

// ---- ui helpers ----
function getRoomId(a, b) {
  return [a, b].sort().join("_");
}

function formatTime(time) {
  const dt = new Date(time);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(time) {
  const diff = Math.floor((Date.now() - new Date(time)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
  return formatTime(time);
}

function displayTime(time) {
  return timeFormat === "relative" ? relativeTime(time) : formatTime(time);
}

function setConnectionBanner(text) {
  if (!text) {
    dom.connectionBanner.classList.add("hidden");
    dom.connectionBanner.textContent = "";
    return;
  }
  dom.connectionBanner.textContent = text;
  dom.connectionBanner.classList.remove("hidden");
}

function toggleTimeFormat() {
  timeFormat = timeFormat === "relative" ? "exact" : "relative";
  localStorage.setItem("chat_time_format", timeFormat);
  dom.btnTime.textContent = timeFormat === "relative" ? "Time: Relative" : "Time: Exact";
  refreshVisibleMeta();
}

function refreshVisibleMeta() {
  document.querySelectorAll(".message .meta[data-time]").forEach((meta) => {
    const time = meta.getAttribute("data-time");
    const sender = meta.getAttribute("data-sender") || "";
    const isReceived = meta.getAttribute("data-type") === "received";
    meta.textContent = (isReceived && sender ? sender + " · " : "") + displayTime(time);
    meta.title = formatTime(time);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("chat_theme", theme);
  dom.btnTheme.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
}

function initTheme() {
  if (!FEATURE_FLAGS.darkMode) return;
  const savedTheme = localStorage.getItem("chat_theme");
  const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

function isNearBottom(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 120;
}

function maybeScrollToBottom(container) {
  if (isNearBottom(container)) container.scrollTop = container.scrollHeight;
  updateJumpButton(container);
}

function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
  updateJumpButton(container);
}

function ensureJumpButton(containerId) {
  if (!FEATURE_FLAGS.jumpToLatest || jumpButtons[containerId]) return;
  const container = document.getElementById(containerId);
  const btn = document.createElement("button");
  btn.className = "jump-to-latest hidden";
  btn.textContent = "New messages";
  btn.type = "button";
  btn.onclick = () => scrollToBottom(container);
  container.appendChild(btn);
  jumpButtons[containerId] = btn;
}

function updateJumpButton(container) {
  const btn = jumpButtons[container.id];
  if (!btn) return;
  if (isNearBottom(container)) btn.classList.add("hidden");
  else btn.classList.remove("hidden");
}

function tryCopyText(text) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

function appendMessage(containerId, sender, text, time, type, options = {}) {
  if (!sender || typeof text !== "string" || !time) return null;
  const container = containerId ? document.getElementById(containerId) : null;
  const bubble = document.createElement("div");
  bubble.classList.add("message", type);
  if (options.pending) bubble.classList.add("pending");
  if (options.clientId) bubble.dataset.clientId = options.clientId;

  const textDiv = document.createElement("div");
  textDiv.textContent = text;
  bubble.appendChild(textDiv);

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.setAttribute("aria-label", "Copy message text");
  copyBtn.onclick = () => tryCopyText(text);
  bubble.appendChild(copyBtn);

  const metaDiv = document.createElement("div");
  metaDiv.classList.add("meta");
  metaDiv.setAttribute("data-time", time);
  metaDiv.setAttribute("data-type", type);
  metaDiv.setAttribute("data-sender", sender);
  metaDiv.textContent = (type === "received" ? sender + " · " : "") + displayTime(time);
  metaDiv.title = formatTime(time);
  bubble.appendChild(metaDiv);

  if (container) {
    container.appendChild(bubble);
    maybeScrollToBottom(container);
  }
  return bubble;
}

function appendSystem(containerId, text) {
  const container = document.getElementById(containerId);
  const p = document.createElement("p");
  p.classList.add("system-msg");
  p.textContent = text;
  container.appendChild(p);
  maybeScrollToBottom(container);
}

function appendHistoryBatch(containerId, history) {
  const container = document.getElementById(containerId);
  const fragment = document.createDocumentFragment();
  history.forEach((msg) => {
    if (!msg || typeof msg.message !== "string") return;
    const bubble = appendMessage(null, msg.sender, msg.message, msg.createdAt, msg.sender === currentUser ? "sent" : "received");
    fragment.appendChild(bubble);
  });
  container.appendChild(fragment);
  scrollToBottom(container);
}

function updateCharCounter(textarea, counterEl, sendButton) {
  const len = [...textarea.value].length;
  const remaining = MAX_LEN - len;
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

function showTyping(channel, username) {
  typingState[channel].add(username);
  renderTyping(channel);
}

function hideTyping(channel, username) {
  typingState[channel].delete(username);
  renderTyping(channel);
}

function renderTyping(channel) {
  const el = channel === "global" ? dom.globalTyping : dom.privateTyping;
  const users = Array.from(typingState[channel]);
  if (users.length === 0) el.textContent = "";
  else if (users.length === 1) el.textContent = users[0] + " is typing...";
  else el.textContent = users.slice(0, 2).join(", ") + " are typing...";
}

function handleTyping(room) {
  socket.emit("start_typing", { room });
  clearTimeout(typingTimers[room]);
  typingTimers[room] = setTimeout(() => socket.emit("stop_typing", { room }), 3000);
}

function clearTypingTimers() {
  Object.keys(typingTimers).forEach((room) => clearTimeout(typingTimers[room]));
}

function switchTab(tab) {
  activeTab = tab;
  const isGlobal = tab === "global";
  dom.panelGlobal.classList.toggle("hidden", !isGlobal);
  dom.panelPrivate.classList.toggle("hidden", isGlobal);
  dom.tabGlobal.classList.toggle("active", isGlobal);
  dom.tabPrivate.classList.toggle("active", !isGlobal);
  dom.tabGlobal.setAttribute("aria-selected", isGlobal ? "true" : "false");
  dom.tabPrivate.setAttribute("aria-selected", isGlobal ? "false" : "true");

  if (isGlobal) {
    unreadGlobal = 0;
    dom.badgeGlobal.style.display = "none";
    dom.badgeGlobal.textContent = "";
  } else {
    unreadPrivate = 0;
    if (dom.badgePrivate) {
      dom.badgePrivate.style.display = "none";
      dom.badgePrivate.textContent = "";
    }
  }
}

function enableTabKeyboard() {
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

function renderOnlineUsers(users) {
  dom.onlineList.innerHTML = "";
  if (!Array.isArray(users)) return;
  const fragment = document.createDocumentFragment();
  users.forEach((username) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("online-user");
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", "Start private chat with " + username);

    const dot = document.createElement("span");
    dot.classList.add("online-dot");

    const name = document.createElement("span");
    name.textContent = username;

    btn.appendChild(dot);
    btn.appendChild(name);
    btn.onclick = () => {
      if (username === currentUser) return;
      dom.recipientInput.value = username;
      switchTab("private");
      startChat();
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

// ---- auth api ----
async function register() {
  const username = dom.usernameInput.value.trim();
  const password = dom.passwordInput.value;
  if (!username || !password) {
    dom.authError.style.color = "var(--danger)";
    dom.authError.textContent = "Please fill in both fields.";
    return;
  }
  try {
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      dom.authError.style.color = "var(--danger)";
      dom.authError.textContent = data.error || "Registration failed.";
      return;
    }
    dom.authError.style.color = "var(--ok)";
    dom.authError.textContent = data.message || "Account created.";
  } catch {
    dom.authError.style.color = "var(--danger)";
    dom.authError.textContent = "Could not connect to server.";
  }
}

async function login() {
  const username = dom.usernameInput.value.trim();
  const password = dom.passwordInput.value;
  if (!username || !password) {
    dom.authError.style.color = "var(--danger)";
    dom.authError.textContent = "Please fill in both fields.";
    return;
  }
  try {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      dom.authError.style.color = "var(--danger)";
      dom.authError.textContent = data.error || "Login failed.";
      return;
    }

    currentToken = data.token;
    currentUser = data.username;
    localStorage.setItem("chat_token", currentToken);
    localStorage.setItem("chat_user", currentUser);
    dom.loggedInAs.textContent = "Logged in as: " + currentUser;
    dom.authScreen.classList.add("hidden");
    dom.chatScreen.classList.remove("hidden");
    setConnectionBanner("Connecting to chat server...");

    socket.auth = { token: currentToken };
    socket.connect();
    loadGlobalHistory();
  } catch {
    dom.authError.style.color = "var(--danger)";
    dom.authError.textContent = "Could not connect to server.";
  }
}

function resetChatUi() {
  currentUser = null;
  currentToken = null;
  currentRoom = null;
  currentRecipient = null;
  typingState.global.clear();
  typingState.private.clear();
  renderTyping("global");
  renderTyping("private");
  clearTypingTimers();
  optimisticByChannel.global = [];
  optimisticByChannel.private = [];
  privateMessagesBuffer.clear();
  unreadPrivate = 0;

  [dom.globalMessages, dom.privateMessages, dom.onlineList].forEach((el) => {
    el.innerHTML = "";
  });
  dom.recipientInput.value = "";
  dom.globalInput.value = "";
  dom.privateInput.value = "";
  autoResize(dom.globalInput);
  autoResize(dom.privateInput);
  updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
  updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
  switchTab("global");
}

function logout() {
  socket.auth = { token: null };
  socket.disconnect();
  localStorage.removeItem("chat_token");
  localStorage.removeItem("chat_user");
  resetChatUi();
  setConnectionBanner("");
  dom.usernameInput.value = "";
  dom.passwordInput.value = "";
  dom.authError.textContent = "";
  dom.authError.style.color = "var(--danger)";
  dom.chatScreen.classList.add("hidden");
  dom.authScreen.classList.remove("hidden");
}

// ---- history ----
async function loadGlobalHistory() {
  dom.globalMessages.innerHTML = "";
  try {
    const res = await fetch("/messages/global", {
      headers: { Authorization: "Bearer " + currentToken }
    });
    const history = await res.json();
    if (!Array.isArray(history) || history.length === 0) {
      appendSystem("global-messages", "Welcome to Global Chat! Say hello.");
      return;
    }
    appendHistoryBatch("global-messages", history);
  } catch {
    appendSystem("global-messages", "Could not load history.");
  }
}

async function startChat() {
  const recipient = dom.recipientInput.value.trim();
  if (!recipient || recipient === currentUser || recipient !== dom.recipientInput.value || /[^a-zA-Z0-9_-]/.test(recipient)) {
    appendSystem("private-messages", "Invalid recipient username.");
    return;
  }

  currentRecipient = recipient;
  currentRoom = getRoomId(currentUser, recipient);
  dom.privateMessages.innerHTML = "";
  typingState.private.clear();
  renderTyping("private");
  socket.emit("join_room", currentRoom);
  appendSystem("private-messages", "Now chatting with " + recipient);

  try {
    const res = await fetch("/messages/" + encodeURIComponent(currentUser) + "/" + encodeURIComponent(recipient), {
      headers: { Authorization: "Bearer " + currentToken }
    });
    const history = await res.json();
    if (!Array.isArray(history) || history.length === 0) {
      appendSystem("private-messages", "No messages yet. Say hello!");
      return;
    }
    appendHistoryBatch("private-messages", history);

    // Append any buffered messages
    const buffered = privateMessagesBuffer.get(currentRoom) || [];
    buffered.forEach((msg) => {
      const type = msg.sender === currentUser ? "sent" : "received";
      appendMessage("private-messages", msg.sender, msg.message, msg.createdAt || new Date().toISOString(), type);
    });
    privateMessagesBuffer.delete(currentRoom);
  } catch {
    appendSystem("private-messages", "Could not load history.");
  }
}

// ---- send ----
function createClientId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addOptimisticMessage(channel, text) {
  if (!FEATURE_FLAGS.optimisticSend) return null;
  const clientId = createClientId();
  const containerId = channel === "global" ? "global-messages" : "private-messages";
  appendMessage(containerId, currentUser, text, new Date().toISOString(), "sent", { pending: true, clientId });
  optimisticByChannel[channel].push({ clientId, text });
  return clientId;
}

function resolveOptimistic(channel, incoming) {
  if (!FEATURE_FLAGS.optimisticSend) return false;
  const queue = optimisticByChannel[channel];
  if (!Array.isArray(queue) || queue.length === 0) return false;

  const clientId = incoming?.clientId;
  let idx = -1;
  if (clientId) {
    idx = queue.findIndex((entry) => entry.clientId === clientId);
  }
  if (idx === -1) {
    idx = queue.findIndex((entry) => entry.text === incoming.message);
  }
  if (idx === -1) return false;

  queue.splice(idx, 1);
  const container = channel === "global" ? dom.globalMessages : dom.privateMessages;
  const selector = clientId ? `.message.pending[data-client-id="${clientId}"]` : ".message.pending";
  const pending = container.querySelector(selector);
  if (!pending) return false;
  pending.classList.remove("pending");
  pending.removeAttribute("data-client-id");

  const meta = pending.querySelector(".meta");
  if (meta && incoming.createdAt) {
    meta.dataset.time = incoming.createdAt;
    meta.textContent = displayTime(incoming.createdAt);
    meta.title = formatTime(incoming.createdAt);
  }

  return true;
}

function sendGlobalMessage() {
  if (sendingGlobal) return;
  const text = dom.globalInput.value.trim();
  if (!text || [...text].length > MAX_LEN) return;
  sendingGlobal = true;

  const clientId = addOptimisticMessage("global", text);
  socket.emit("send_global_message", { sender: currentUser, message: text, clientId });
  socket.emit("stop_typing", { room: "global" });
  clearTimeout(typingTimers.global);
  dom.globalInput.value = "";
  autoResize(dom.globalInput);
  updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
}

function sendPrivateMessage() {
  if (sendingPrivate) return;
  const text = dom.privateInput.value.trim();
  if (!text || [...text].length > MAX_LEN) return;
  if (!currentRoom) {
    appendSystem("private-messages", "Open a chat first.");
    return;
  }
  sendingPrivate = true;

  const clientId = addOptimisticMessage("private", text);
  socket.emit("send_message", {
    sender: currentUser,
    receiver: currentRecipient,
    message: text,
    room: currentRoom,
    clientId
  });
  socket.emit("stop_typing", { room: currentRoom });
  clearTimeout(typingTimers[currentRoom]);
  dom.privateInput.value = "";
  autoResize(dom.privateInput);
  updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
}

// ---- socket events ----
socket.on("receive_global_message", (data) => {
  if (!data || typeof data.message !== "string") return;
  const type = data.sender === currentUser ? "sent" : "received";
  if (!(type === "sent" && resolveOptimistic("global", data))) {
    appendMessage("global-messages", data.sender, data.message, data.createdAt || new Date().toISOString(), type);
  }

  if (data.sender === currentUser) {
    sendingGlobal = false;
  }

  if (activeTab !== "global" && data.sender !== currentUser) {
    unreadGlobal += 1;
    dom.badgeGlobal.textContent = String(unreadGlobal);
    dom.badgeGlobal.style.display = "inline";
  }
});

socket.on("receive_message", (data) => {
  if (!data || typeof data.message !== "string") return;
  const type = data.sender === currentUser ? "sent" : "received";
  if (data.room === currentRoom) {
    if (!(type === "sent" && resolveOptimistic("private", data))) {
      appendMessage("private-messages", data.sender, data.message, data.createdAt || new Date().toISOString(), type);
    }
    if (data.sender === currentUser) {
      sendingPrivate = false;
    }
  } else {
    // Buffer message for later
    if (!privateMessagesBuffer.has(data.room)) {
      privateMessagesBuffer.set(data.room, []);
    }
    privateMessagesBuffer.get(data.room).push(data);
    // Show unread badge on private tab
    unreadPrivate += 1;
    dom.badgePrivate = dom.badgePrivate || document.getElementById("private-tab-badge");
    if (!dom.badgePrivate) {
      // Create badge if not exists
      const badge = document.createElement("span");
      badge.id = "private-tab-badge";
      badge.className = "tab-badge";
      dom.tabPrivate.appendChild(badge);
      dom.badgePrivate = badge;
    }
    dom.badgePrivate.textContent = String(unreadPrivate);
    dom.badgePrivate.style.display = "inline";
  }
});

socket.on("user_typing", ({ username, room }) => {
  if (!username || username === currentUser) return;
  if (room === "global") showTyping("global", username);
  else if (room === currentRoom) showTyping("private", username);
});

socket.on("user_stopped_typing", ({ username, room }) => {
  if (!username) return;
  if (room === "global") hideTyping("global", username);
  else if (room === currentRoom) hideTyping("private", username);
});

socket.on("error_message", ({ error }) => {
  const panelId = activeTab === "global" ? "global-messages" : "private-messages";
  appendSystem(panelId, "Warning: " + (error || "Message could not be sent."));
});

socket.on("online_users", renderOnlineUsers);

socket.on("connect", () => {
  setConnectionBanner("");
});

socket.on("disconnect", () => {
  setConnectionBanner("Disconnected. Reconnecting...");
});

socket.on("connect_error", (err) => {
  setConnectionBanner("Connection issue: " + err.message);
  if (currentUser) {
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_user");
    resetChatUi();
    socket.auth = { token: null };
    dom.chatScreen.classList.add("hidden");
    dom.authScreen.classList.remove("hidden");
    dom.authError.textContent = "Session expired. Please log in again.";
  }
});

// ---- input setup ----
function setupTextarea(textarea, counter, sendButton, sendFn, roomGetter) {
  let isComposing = false;
  textarea.addEventListener("compositionstart", () => { isComposing = true; });
  textarea.addEventListener("compositionend", () => { isComposing = false; });

  const onInput = () => {
    autoResize(textarea);
    updateCharCounter(textarea, counter, sendButton);
    if (currentUser && textarea.value.trim()) {
      const room = roomGetter();
      if (room) handleTyping(room);
    }
  };
  textarea.addEventListener("input", onInput);

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (isComposing) return;
      event.preventDefault();
      sendFn();
    }
  });
}

function setupMessageContainer(container) {
  ensureJumpButton(container.id);
  container.addEventListener("scroll", () => updateJumpButton(container));
}

function restoreSession() {
  const savedToken = localStorage.getItem("chat_token");
  const savedUser = localStorage.getItem("chat_user");
  if (!savedToken || !savedUser) return;
  currentToken = savedToken;
  currentUser = savedUser;
  dom.loggedInAs.textContent = "Logged in as: " + currentUser;
  dom.authScreen.classList.add("hidden");
  dom.chatScreen.classList.remove("hidden");
  setConnectionBanner("Connecting to chat server...");
  socket.auth = { token: currentToken };
  socket.connect();
  loadGlobalHistory();
}

function setupKeyboardShortcuts() {
  dom.recipientInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startChat();
  });
}

// ---- init ----
function init() {
  dom = initDom();
  dom.btnTime.textContent = timeFormat === "relative" ? "Time: Relative" : "Time: Exact";

  // Periodic refresh for relative times
  setInterval(refreshVisibleMeta, 60000);

  // Attach event listeners
  dom.btnLogin.addEventListener("click", login);
  dom.btnRegister.addEventListener("click", register);
  dom.btnLogout.addEventListener("click", logout);
  dom.btnTheme.addEventListener("click", toggleTheme);
  dom.btnTime.addEventListener("click", toggleTimeFormat);
  dom.btnOpenChat.addEventListener("click", startChat);
  dom.sendGlobal.addEventListener("click", sendGlobalMessage);
  dom.sendPrivate.addEventListener("click", sendPrivateMessage);
  dom.tabGlobal.addEventListener("click", () => switchTab("global"));
  dom.tabPrivate.addEventListener("click", () => switchTab("private"));

  initTheme();
  enableTabKeyboard();
  setupKeyboardShortcuts();

  setupTextarea(dom.globalInput, dom.globalCounter, dom.sendGlobal, sendGlobalMessage, () => "global");
  setupTextarea(dom.privateInput, dom.privateCounter, dom.sendPrivate, sendPrivateMessage, () => currentRoom);
  updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
  updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
  setupMessageContainer(dom.globalMessages);
  setupMessageContainer(dom.privateMessages);
  restoreSession();
}

document.addEventListener("DOMContentLoaded", init);
