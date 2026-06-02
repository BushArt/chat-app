/* eslint-env browser */
import * as utils from './modules/utils.js';
import * as state from './modules/state.js';
import * as api from './modules/api.js';
import * as optimistic from './modules/optimistic.js';
import * as socket from './modules/socket.js';
import { connect } from './modules/socket.js';
import * as ui from './modules/ui.js';
import * as recorder from './modules/recorder.js';

let dom;
let selectedAvatarFile = null;

// ---- File upload state per channel ----
const pendingAttachments = { global: null, private: null };

// Allowed MIME types for client-side pre-validation
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'video/mp4', 'video/webm'
]);
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

// ---- Auth functions ----
async function register() {
  const username = dom.usernameInput.value.trim();
  const password = dom.passwordInput.value;
  if (!username || !password) {
    ui.showAuthError("Please fill in both fields.");
    return;
  }
  try {
    const data = await api.register(username, password);
    state.setCurrentToken(data.token);
    state.setCurrentUser(data.username);
    state.setProfileFromResponse(data);
    utils.safeLocalStorageSet("chat_token", data.token);
    utils.safeLocalStorageSet("chat_user", data.username);
    dom.loggedInAs.textContent = "Logged in as: " + (data.displayName || data.username);
    ui.showChatScreen();
    ui.setConnectionBanner("Connecting to chat server...");
    socket.connect(data.token);
    loadGlobalHistory();
  } catch (err) {
    ui.showAuthError(err.message || "Could not connect to server.");
  }
}

async function login() {
  const username = dom.usernameInput.value.trim();
  const password = dom.passwordInput.value;
  if (!username || !password) {
    ui.showAuthError("Please fill in both fields.");
    return;
  }
  try {
    const data = await api.login(username, password);

    state.setCurrentToken(data.token);
    state.setCurrentUser(data.username);
    state.setProfileFromResponse(data);
    utils.safeLocalStorageSet("chat_token", data.token);
    utils.safeLocalStorageSet("chat_user", data.username);
    dom.loggedInAs.textContent = "Logged in as: " + (data.displayName || data.username);
    
    ui.showChatScreen();
    ui.setConnectionBanner("Connecting to chat server...");

    socket.connect(data.token);
    loadGlobalHistory();
  } catch (err) {
    ui.showAuthError(err.message || "Could not connect to server.");
  }
}

function logout() {
  socket.disconnect();
  utils.safeLocalStorageRemove("chat_token");
  utils.safeLocalStorageRemove("chat_user");
  state.resetAllState();
  ui.resetChatUi();
  ui.setConnectionBanner("");
  dom.usernameInput.value = "";
  dom.passwordInput.value = "";
  ui.showAuthError("");
  ui.showAuthScreen();
}

// ---- Pagination state ----
let globalCursor = null;
let privateCursor = null;

// ---- History loading ----
async function loadGlobalHistory() {
  dom.globalMessages.innerHTML = "";
  delete dom.globalMessages.dataset.lastDate;
  globalCursor = null;
  try {
    const data = await api.fetchGlobalHistory();
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      ui.appendSystem("global-messages", "Welcome to Global Chat! Say hello.");
      ui.setHasMore('global-messages', false);
      return;
    }
    ui.appendHistoryBatch("global-messages", data.messages);
    globalCursor = data.cursor;
    ui.setHasMore('global-messages', data.hasMore);
  } catch {
    ui.appendSystem("global-messages", "Could not load history.");
    ui.setHasMore('global-messages', false);
  }
}

async function loadMoreGlobal() {
  if (!globalCursor || dom.globalMessages.dataset.loading === 'true') return;
  ui.setLoading('global-messages', true);
  try {
    const data = await api.fetchGlobalHistory(globalCursor);
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      globalCursor = null;
      ui.setHasMore('global-messages', false);
      return;
    }
    ui.appendHistoryBatch("global-messages", data.messages, 'prepend');
    globalCursor = data.cursor;
    ui.setHasMore('global-messages', data.hasMore);
    ui.updateLoadMoreButton('global-messages', data.hasMore, loadMoreGlobal);
  } catch {
    // Silently fail — user can retry by scrolling up again
  } finally {
    ui.setLoading('global-messages', false);
  }
}

async function startChat() {
  const recipient = dom.recipientInput.value.trim();
  if (!recipient || recipient === state.getCurrentUser() || recipient !== dom.recipientInput.value) {
    ui.appendSystem("private-messages", "Invalid recipient username.");
    return;
  }
  // Validate username format and length (mirrors server validation)
  function isValidUsername(username) {
    if (typeof username !== 'string') return false;
    const codePoints = [...username].length;
    if (codePoints < 1 || codePoints > 30) return false;
    const allowed = /^[\w\-\u3001-\u9FFF\uA000-\uA4FF\uAC00-\uD7FF\uF900-\uFAFF\u2E80-\u2EFF\u31F0-\u31FF\u3040-\u30FF]+$/u;
    return allowed.test(username);
  }
  if (!isValidUsername(recipient)) {
    ui.appendSystem("private-messages", "Invalid recipient username.");
    return;
  }

  state.setCurrentRecipient(recipient);
  const roomId = utils.getRoomId(state.getCurrentUser(), recipient);
  state.setCurrentRoom(roomId);
  
  dom.privateMessages.innerHTML = "";
  delete dom.privateMessages.dataset.lastDate;
  privateCursor = null;
  state.clearTypingState("private");
  ui.renderTyping("private");
  
  socket.emitJoinRoom(roomId);
  ui.appendSystem("private-messages", "Now chatting with " + recipient);

  try {
    const data = await api.fetchPrivateHistory(state.getCurrentUser(), recipient);
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      ui.appendSystem("private-messages", "No messages yet. Say hello!");
      ui.setHasMore('private-messages', false);
    } else {
      ui.appendHistoryBatch("private-messages", data.messages);
      privateCursor = data.cursor;
      ui.setHasMore('private-messages', data.hasMore);
    }

    // Append any buffered messages
    const buffered = state.getBufferedMessages(roomId) || [];
    buffered.forEach((msg) => {
      const type = msg.sender === state.getCurrentUser() ? "sent" : "received";
      ui.appendMessage("private-messages", msg.sender, msg.message, msg.createdAt || new Date().toISOString(), type);
    });
    state.deleteBufferEntry(roomId);
  } catch {
    ui.appendSystem("private-messages", "Could not load history.");
  }
}

async function loadMorePrivate() {
  if (!privateCursor || dom.privateMessages.dataset.loading === 'true') return;
  ui.setLoading('private-messages', true);
  try {
    const data = await api.fetchPrivateHistory(state.getCurrentUser(), state.getCurrentRecipient(), privateCursor);
    if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
      privateCursor = null;
      ui.setHasMore('private-messages', false);
      return;
    }
    ui.appendHistoryBatch("private-messages", data.messages, 'prepend');
    privateCursor = data.cursor;
    ui.setHasMore('private-messages', data.hasMore);
    ui.updateLoadMoreButton('private-messages', data.hasMore, loadMorePrivate);
  } catch {
    // Silently fail — user can retry by scrolling up again
  } finally {
    ui.setLoading('private-messages', false);
  }
}

// ---- File upload helper ----
function setupFilePicker(btn, fileInput, channel) {
  btn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    // Client-side pre-validation
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      ui.appendSystem(channel === "global" ? "global-messages" : "private-messages",
        `File type "${file.type}" is not supported.`);
      fileInput.value = "";
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      ui.appendSystem(channel === "global" ? "global-messages" : "private-messages",
        `File exceeds the 25 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      fileInput.value = "";
      return;
    }

    // Show uploading state
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Uploading...";

    try {
      const room = channel === "global" ? null : state.getCurrentRoom();
      const receiver = channel === "global" ? null : state.getCurrentRecipient();
      const result = await api.uploadAttachment(file, room, receiver, channel === "global");
      
      // Store pending attachment
      pendingAttachments[channel] = result;
      state.setPendingAttachment(result);
      
      // Show preview in input area
      ui.showAttachmentPreview(channel, result);
      
      // Re-enable send button
      const sendBtn = channel === "global" ? dom.sendGlobal : dom.sendPrivate;
      const textarea = channel === "global" ? dom.globalInput : dom.privateInput;
      sendBtn.disabled = false;
      
    } catch (err) {
      ui.appendSystem(channel === "global" ? "global-messages" : "private-messages",
        "Upload failed: " + (err.message || "Unknown error"));
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
      fileInput.value = "";
    }
  });
}

function clearPendingAttachment(channel) {
  pendingAttachments[channel] = null;
  state.setPendingAttachment(null);
  ui.clearAttachmentPreview(channel);
}

// ---- Send message functions ----
function sendGlobalMessage() {
  if (state.isSendingGlobal()) return;
  const text = dom.globalInput.value.trim();
  const attachment = pendingAttachments.global || state.getPendingAttachment();
  if (!text && !attachment) return;
  if (text && [...text].length > utils.MAX_LEN) return;
  state.setSendingGlobal(true);

  const clientId = optimistic.addOptimisticMessage("global", text, attachment);
  
  const payload = { sender: state.getCurrentUser(), message: text, clientId };
  if (attachment) payload.attachment = attachment;
  socket.emitSendGlobalMessage(payload);
  socket.emitStopTyping("global");
  
  // Timeout optimistic message after 31s if no response
  const timeoutId = setTimeout(() => {
    // If the optimistic timeout was already cleared (message succeeded), skip
    if (!state.hasOptimisticTimeout(clientId)) return;
    state.deleteOptimisticTimeout(clientId);
    
    const pending = document.querySelector(`#global-messages .message.pending[data-client-id="${clientId}"]`);
    if (pending) {
      pending.remove();
      optimistic.clearOptimisticPending("global", clientId);
      ui.appendSystem("global-messages", "Message failed to send. Please try again.");
    }
  }, utils.OPTIMISTIC_TIMEOUT);
  
  state.setOptimisticTimeout(clientId, timeoutId);
  clearPendingAttachment("global");
  dom.globalInput.value = "";
  utils.autoResize(dom.globalInput);
  ui.updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
}

function sendPrivateMessage() {
  if (state.isSendingPrivate()) return;
  const text = dom.privateInput.value.trim();
  const attachment = pendingAttachments.private || state.getPendingAttachment();
  if (!text && !attachment) return;
  if (text && [...text].length > utils.MAX_LEN) return;
  if (!state.getCurrentRoom()) {
    ui.appendSystem("private-messages", "Open a chat first.");
    return;
  }
  state.setSendingPrivate(true);

  const clientId = optimistic.addOptimisticMessage("private", text, attachment);
  
  const payload = {
    sender: state.getCurrentUser(),
    receiver: state.getCurrentRecipient(),
    message: text,
    room: state.getCurrentRoom(),
    clientId
  };
  if (attachment) payload.attachment = attachment;
  socket.emitSendPrivateMessage(payload);
  socket.emitStopTyping(state.getCurrentRoom());
  
  // Timeout optimistic message after 31s if no response
  const timeoutId = setTimeout(() => {
    // If the optimistic timeout was already cleared (message succeeded), skip
    if (!state.hasOptimisticTimeout(clientId)) return;
    state.deleteOptimisticTimeout(clientId);
    
    const pending = document.querySelector(`#private-messages .message.pending[data-client-id="${clientId}"]`);
    if (pending) {
      pending.remove();
      optimistic.clearOptimisticPending("private", clientId);
      ui.appendSystem("private-messages", "Message failed to send. Please try again.");
    }
  }, utils.OPTIMISTIC_TIMEOUT);
  
  state.setOptimisticTimeout(clientId, timeoutId);
  clearPendingAttachment("private");
  dom.privateInput.value = "";
  utils.autoResize(dom.privateInput);
  ui.updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
}

// ---- Input setup ----
function setupTextarea(textarea, counter, sendButton, sendFn, roomGetter) {
  let isComposing = false;
  textarea.addEventListener("compositionstart", () => { isComposing = true; });
  textarea.addEventListener("compositionend", () => { isComposing = false; });

  const onInput = () => {
    utils.autoResize(textarea);
    ui.updateCharCounter(textarea, counter, sendButton);
    if (state.getCurrentUser() && textarea.value.trim()) {
      const room = roomGetter();
      if (room) socket.emitStartTyping(room);
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

async function restoreSession() {
  const savedToken = utils.safeLocalStorageGet("chat_token");
  const savedUser = utils.safeLocalStorageGet("chat_user");
  if (!savedToken || !savedUser) return;
  state.setCurrentToken(savedToken);
  state.setCurrentUser(savedUser);
  dom.loggedInAs.textContent = "Logged in as: " + savedUser;
  ui.showChatScreen();
  ui.setConnectionBanner("Connecting to chat server...");
  connect(savedToken);
  loadGlobalHistory();
  // Fetch profile data (not cached in localStorage)
  try {
    const profile = await api.fetchProfile();
    state.setProfileFromResponse(profile);
    dom.loggedInAs.textContent = "Logged in as: " + (profile.displayName || profile.username);
  } catch {
    // Non-critical: display name will fall back to username
  }
}

// ── Profile Editing ──
function openProfileEditor() {
  const isCurrentlyOpen = dom.profilePanel && !dom.profilePanel.classList.contains('hidden');
  if (isCurrentlyOpen) {
    // Save in-flight edits to staging and close panel (without discarding or persisting)
    state.setPendingProfileEdits({
      displayName: dom.editDisplayName.value,
      bio: dom.editBio.value,
      status: dom.editStatus.value,
      avatarFile: selectedAvatarFile
    });
    ui.hideProfileEditor();
    return;
  }
  // First open: populate from staging or state
  state.setPendingProfileEdits(state.getPendingProfileEdits() || null);
  ui.refreshProfileHeader();
  ui.showProfileEditor();
  selectedAvatarFile = null;
}

function closeProfileEditor() {
  ui.hideProfileEditor();
  dom.avatarFileInput.value = '';
  selectedAvatarFile = null;
  state.clearPendingProfileEdits();
}

async function saveProfile() {
  const displayName = dom.editDisplayName.value.trim();
  const bio = dom.editBio.value.trim();
  const status = dom.editStatus.value;

  const fields = {};
  if (displayName) fields.displayName = displayName;
  if (bio !== undefined) fields.bio = bio;
  if (status) fields.status = status;

  dom.btnSaveProfile.disabled = true;
  dom.btnSaveProfile.textContent = 'Saving...';

  try {
    const result = await api.updateProfile(fields, selectedAvatarFile);
    state.setProfileFromResponse(result);

    // Update header
    dom.loggedInAs.textContent = "Logged in as: " + (result.displayName || result.username);
    // Update profile header summary
    ui.refreshProfileHeader();
    closeProfileEditor();
  } catch (err) {
    ui.showAuthError(err.message || "Profile update failed.");
  } finally {
    dom.btnSaveProfile.disabled = false;
    dom.btnSaveProfile.textContent = 'Save';
  }
}

function setupKeyboardShortcuts() {
  dom.recipientInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startChat();
  });
}

// ── Voice Recording ──
function setupVoiceRecording(channel) {
  const voiceBtn = channel === 'global' ? dom.globalVoiceBtn : dom.privateVoiceBtn;
  if (!voiceBtn) return;

  // Update UI on state changes
  recorder.onStateChange((newState) => {
    ui.updateVoiceButton(channel, newState);
  });

  voiceBtn.addEventListener('click', () => {
    const currentState = recorder.getState();

    if (currentState === 'idle') {
      // Start recording
      recorder.startRecording(async (blob, filename, mimeType) => {
        // Show preview with Send / Discard buttons
        ui.showVoicePreview(channel, blob,
          // Send handler
          async () => {
            recorder.setSending();
            const file = new File([blob], filename, { type: mimeType });
            try {
              const room = channel === 'global' ? null : state.getCurrentRoom();
              const receiver = channel === 'global' ? null : state.getCurrentRecipient();
              const result = await api.uploadAttachment(file, room, receiver, channel === 'global');

              // Store as pending attachment and send
              pendingAttachments[channel] = result;
              state.setPendingAttachment(result);

              // Trigger send
              if (channel === 'global') {
                sendGlobalMessage();
              } else {
                sendPrivateMessage();
              }

              recorder.reset();
              ui.clearVoicePreview(channel);
            } catch (err) {
              ui.appendSystem(
                channel === 'global' ? 'global-messages' : 'private-messages',
                'Voice upload failed: ' + (err.message || 'Unknown error')
              );
              recorder.setPreview(); // Allow retry
            }
          },
          // Discard handler
          () => {
            recorder.discardRecording();
            ui.clearVoicePreview(channel);
          }
        );
      });
    } else if (currentState === 'recording') {
      // Stop recording
      recorder.stopRecording();
    }
  });
}

// ---- init ----
function init() {
  dom = ui.initDom();
  dom.btnTime.textContent = state.getTimeFormat() === "relative" ? "Time: Relative" : "Time: Exact";

  // Periodic refresh for relative times
  setInterval(ui.refreshVisibleMeta, 60000);

  // Attach event listeners
  dom.btnLogin.addEventListener("click", login);
  dom.btnRegister.addEventListener("click", register);
  dom.btnLogout.addEventListener("click", logout);
  dom.btnEditProfile.addEventListener("click", openProfileEditor);
  dom.btnSaveProfile.addEventListener("click", saveProfile);
  dom.btnCancelProfile.addEventListener("click", closeProfileEditor);

  // File attachment button wiring
  setupFilePicker(dom.globalFileBtn, dom.globalFileInput, "global");
  setupFilePicker(dom.privateFileBtn, dom.privateFileInput, "private");

  // Remove attachment preview on X click (delegated)
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("attach-preview-remove")) {
      const preview = e.target.closest(".attachment-preview");
      if (preview) {
        const channel = preview.id === "global-attachment-preview" ? "global" : "private";
        clearPendingAttachment(channel);
      }
    }
  });

  // ── Voice recording setup ──
  setupVoiceRecording('global');
  setupVoiceRecording('private');

  // File upload button wiring (Profile avatar)
  dom.btnUploadAvatar.addEventListener("click", () => dom.avatarFileInput.click());
    dom.avatarFileInput.addEventListener("change", () => {
    const file = dom.avatarFileInput.files[0];
    if (!file) return;
    selectedAvatarFile = file;
    ui.showAvatarPreview(file);
  });

  dom.btnTheme.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    ui.applyTheme(current === "dark" ? "light" : "dark");
  });
  dom.btnTime.addEventListener("click", ui.toggleTimeFormat);
  dom.btnOpenChat.addEventListener("click", startChat);
  dom.sendGlobal.addEventListener("click", sendGlobalMessage);
  dom.sendPrivate.addEventListener("click", sendPrivateMessage);
  dom.tabGlobal.addEventListener("click", () => ui.switchTab("global"));
  dom.tabPrivate.addEventListener("click", () => {
    ui.switchTab("private");
    if (state.getCurrentRoom()) {
      ui.scrollPrivateToBottom();
    }
  });

  ui.initTheme();
  ui.enableTabKeyboard();
  setupKeyboardShortcuts();

  setupTextarea(dom.globalInput, dom.globalCounter, dom.sendGlobal, sendGlobalMessage, () => "global");
  setupTextarea(dom.privateInput, dom.privateCounter, dom.sendPrivate, sendPrivateMessage, () => state.getCurrentRoom());
  
  ui.updateCharCounter(dom.globalInput, dom.globalCounter, dom.sendGlobal);
  ui.updateCharCounter(dom.privateInput, dom.privateCounter, dom.sendPrivate);
  
  ui.setupMessageContainer(dom.globalMessages);
  ui.setupMessageContainer(dom.privateMessages);
  ui.setupScrollPagination('global-messages', loadMoreGlobal);
  ui.setupScrollPagination('private-messages', loadMorePrivate);
  
  restoreSession();
}

document.addEventListener("DOMContentLoaded", init);