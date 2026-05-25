/* eslint-env browser */
/* global io */
import * as state from './state.js';
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as optimistic from './optimistic.js';

function createNoopSocket() {
  return {
    auth: { token: null },
    on: () => {},
    emit: () => {},
    connect: () => {},
    disconnect: () => {}
  };
}

const socket = typeof io === "function" ? io({ autoConnect: false }) : createNoopSocket();
const hasSocketIoClient = typeof io === "function";

// ---- Socket Event Listeners ----
socket.on("receive_global_message", (data) => {
  if (!data || typeof data.message !== "string") return;
  const type = data.sender === state.getCurrentUser() ? "sent" : "received";
  
  // ✅ FINAL FAILSAFE: Always cancel timeout for our messages - NO EXCEPTIONS
  if (type === "sent" && data.clientId && state.hasOptimisticTimeout(data.clientId)) {
    state.deleteOptimisticTimeout(data.clientId);
  }
  if (!(type === "sent" && optimistic.resolveOptimistic("global", data))) {
    ui.appendMessage("global-messages", data.sender, data.message, data.createdAt || new Date().toISOString(), type);
  }

  if (data.sender === state.getCurrentUser()) {
    state.setSendingGlobal(false);
  }

  if (state.getActiveTab() !== "global" && data.sender !== state.getCurrentUser()) {
    state.setUnreadGlobal(state.getUnreadGlobal() + 1);
    const dom = ui.getDom();
    dom.badgeGlobal.textContent = String(state.getUnreadGlobal());
    dom.badgeGlobal.style.display = "inline";
  }
});

socket.on("receive_message", (data) => {
  if (!data || typeof data.message !== "string") return;
  const type = data.sender === state.getCurrentUser() ? "sent" : "received";
  
  // ✅ FINAL FAILSAFE: Always cancel timeout for our messages - NO EXCEPTIONS
  if (type === "sent" && data.clientId && state.hasOptimisticTimeout(data.clientId)) {
    state.deleteOptimisticTimeout(data.clientId);
  }
  if (data.room === state.getCurrentRoom()) {
    if (!(type === "sent" && optimistic.resolveOptimistic("private", data))) {
      ui.appendMessage("private-messages", data.sender, data.message, data.createdAt || new Date().toISOString(), type);
    }
    if (data.sender === state.getCurrentUser()) {
      state.setSendingPrivate(false);
    }
  } else {
    // Buffer message for later with true LRU eviction
    if (state.hasBufferedMessages(data.room)) {
      state.touchBufferEntry(data.room);
    } else {
      if (state.getBufferSize() >= utils.MAX_BUFFERED_ROOMS) {
        const oldestKey = state.getOldestBufferKey();
        state.deleteBufferEntry(oldestKey);
      }
      state.createBufferEntry(data.room);
    }
    state.pushBufferedMessage(data.room, data);
    // Show unread badge on private tab
    state.setUnreadPrivate(state.getUnreadPrivate() + 1);
    const dom = ui.getDom();
    dom.badgePrivate = dom.badgePrivate || document.getElementById("private-tab-badge");
    if (!dom.badgePrivate) {
      // Create badge if not exists
      const badge = document.createElement("span");
      badge.id = "private-tab-badge";
      badge.className = "tab-badge";
      dom.tabPrivate.appendChild(badge);
      dom.badgePrivate = badge;
    }
    dom.badgePrivate.textContent = String(state.getUnreadPrivate());
    dom.badgePrivate.style.display = "inline";
  }
});

socket.on("user_typing", ({ username, room }) => {
  if (!username || username === state.getCurrentUser()) return;
  if (room === "global") {
    state.addTypingUser("global", username);
    ui.renderTyping("global");
  }
  else if (room === state.getCurrentRoom()) {
    state.addTypingUser("private", username);
    ui.renderTyping("private");
  }
});

socket.on("user_stopped_typing", ({ username, room }) => {
  if (!username) return;
  if (room === "global") {
    state.removeTypingUser("global", username);
    ui.renderTyping("global");
  }
  else if (room === state.getCurrentRoom()) {
    state.removeTypingUser("private", username);
    ui.renderTyping("private");
  }
});

socket.on("error_message", ({ error }) => {
  const panelId = state.getActiveTab() === "global" ? "global-messages" : "private-messages";
  ui.appendSystem(panelId, "Warning: " + (error || "Message could not be sent."));
  // Clear sending flags on error
  state.setSendingGlobal(false);
  state.setSendingPrivate(false);
});

socket.on("online_users", ui.renderOnlineUsers);

socket.on("connect", () => {
  ui.setConnectionBanner("");
});

// On reconnect, ask server for missed messages (best-effort)
socket.on('reconnect', () => {
  try {
    // try to determine last seen message timestamp from DOM
    const list = document.querySelector('#global-messages');
    let lastSeen = null;
    if (list) {
      const last = list.querySelector('.message .meta[data-time]');
      if (last) lastSeen = last.dataset.time || null;
    }
    socket.emit('sync', { lastSeenAt: lastSeen });
  } catch (e) {
    // best-effort only
  }
});

socket.on("disconnect", () => {
  ui.setConnectionBanner("Disconnected. Reconnecting...");
  // Clear sending flags on disconnect to prevent permanent lockup
  state.setSendingGlobal(false);
  state.setSendingPrivate(false);
  
  // Clear all pending optimistic timeouts
  state.clearAllOptimisticTimeouts();
});

socket.on("connect_error", (err) => {
  ui.setConnectionBanner("Connection issue: " + err.message);
  state.setSendingGlobal(false);
  state.setSendingPrivate(false);
});

// ---- Exported emit functions ----
export function connect(token) {
  if (!hasSocketIoClient) {
    ui.setConnectionBanner("Connection issue: Socket.IO client failed to load.");
    return;
  }
  socket.auth = { token };
  socket.connect();
}

export function disconnect() {
  socket.auth = { token: null };
  socket.disconnect();
}

export function emitStartTyping(room) {
  if (!room) return;
  state.clearTypingTimer(room);
  const timerId = setTimeout(() => {
    socket.emit("start_typing", { room });
    // Store the auto-stop timer so clearTypingTimer can cancel it too
    const stopTimerId = setTimeout(() => {
      socket.emit("stop_typing", { room });
      state.clearTypingTimer(room);
    }, 3000);
    state.setTypingTimer(room, stopTimerId);
  }, utils.TYPING_DEBOUNCE_MS);
  state.setTypingTimer(room, timerId);
}

export function emitStopTyping(room) {
  if (!room) return;
  socket.emit("stop_typing", { room });
  state.clearTypingTimer(room);
}

export function emitJoinRoom(roomId) {
  socket.emit("join_room", roomId);
}

export function emitSendGlobalMessage(data) {
  socket.emit("send_global_message", data);
}

export function emitSendPrivateMessage(data) {
  socket.emit("send_message", data);
}

export default socket;