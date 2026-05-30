/* eslint-env browser */
import { safeLocalStorageGet } from './utils.js';

export const FEATURE_FLAGS = {
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
let timeFormat = safeLocalStorageGet("chat_time_format") || "relative";

// Profile fields
let currentDisplayName = null;
let currentBio = null;
let currentStatus = null;
let currentCreatedAt = null;
let currentAvatarUrl = null;

const onlineUsersMap = new Map(); // username -> { displayName, status, avatarUrl }

const typingState = { global: new Set(), private: new Set() };
const typingTimers = {};
const optimisticByChannel = { global: [], private: [] };
const jumpButtons = {};
const privateMessagesBuffer = new Map();
const optimisticTimeouts = new Map();

// Getters
export function getCurrentUser() { return currentUser; }
export function getCurrentToken() { return currentToken; }
export function getCurrentRoom() { return currentRoom; }
export function getCurrentRecipient() { return currentRecipient; }
export function getActiveTab() { return activeTab; }
export function getUnreadGlobal() { return unreadGlobal; }
export function getUnreadPrivate() { return unreadPrivate; }
export function isSendingGlobal() { return sendingGlobal; }
export function isSendingPrivate() { return sendingPrivate; }
export function getTimeFormat() { return timeFormat; }

export function getCurrentDisplayName() { return currentDisplayName || currentUser; }
export function getCurrentBio() { return currentBio || ''; }
export function getCurrentStatus() { return currentStatus || 'online'; }
export function getCurrentCreatedAt() { return currentCreatedAt; }
export function getCurrentAvatarUrl() { return currentAvatarUrl || null; }

// Setters
export function setCurrentUser(value) { currentUser = value; }
export function setCurrentToken(value) { currentToken = value; }
export function setCurrentRoom(value) { currentRoom = value; }
export function setCurrentRecipient(value) { currentRecipient = value; }
export function setActiveTab(value) { activeTab = value; }
export function setUnreadGlobal(value) { unreadGlobal = value; }
export function setUnreadPrivate(value) { unreadPrivate = value; }
export function setSendingGlobal(value) { sendingGlobal = value; }
export function setSendingPrivate(value) { sendingPrivate = value; }
export function setTimeFormat(value) { timeFormat = value; }

export function setCurrentDisplayName(value) { currentDisplayName = value; }
export function setCurrentBio(value) { currentBio = value; }
export function setCurrentStatus(value) { currentStatus = value; }
export function setCurrentCreatedAt(value) { currentCreatedAt = value; }
export function setCurrentAvatarUrl(value) { currentAvatarUrl = value; }

/**
 * Populate all profile fields from a login/register/me response.
 */
export function setProfileFromResponse(data) {
  currentDisplayName = data.displayName || data.username || currentUser;
  currentBio = data.bio || '';
  currentStatus = data.status || 'online';
  currentCreatedAt = data.createdAt || null;
  currentAvatarUrl = data.avatarUrl || null;
}

/**
 * Get the onlineUsersMap object (read-only reference).
 */
export function getOnlineUsersMap() {
  return onlineUsersMap;
}

/**
 * Set the online user list from either the old string[] format or the new object[] format.
 */
export function setOnlineUsersFromList(list) {
  onlineUsersMap.clear();
  if (!Array.isArray(list)) return;
  list.forEach((entry) => {
    if (typeof entry === 'string') {
      // Old format: array of strings
      onlineUsersMap.set(entry, { username: entry, displayName: entry, status: 'online', avatarUrl: null });
    } else if (entry && typeof entry === 'object') {
      // New format: array of { username, displayName, status, avatarUrl }
      const username = entry.username;
      if (username) {
        onlineUsersMap.set(username, {
          username,
          displayName: entry.displayName || username,
          status: entry.status || 'online',
          avatarUrl: entry.avatarUrl || null
        });
      }
    }
  });
}

/**
 * Update a single entry in the onlineUsersMap (from profile_updated event).
 */
export function updateOnlineUser(username, displayName, status, avatarUrl) {
  if (!username) return;
  if (onlineUsersMap.has(username)) {
    const existing = onlineUsersMap.get(username);
    onlineUsersMap.set(username, {
      username,
      displayName: displayName !== undefined ? displayName : existing.displayName,
      status: status !== undefined ? status : existing.status,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : existing.avatarUrl
    });
  }
}

// Typing state
export function addTypingUser(channel, username) { typingState[channel].add(username); }
export function removeTypingUser(channel, username) { typingState[channel].delete(username); }
export function clearTypingState(channel) { typingState[channel].clear(); }
export function getTypingUsers(channel) { return Array.from(typingState[channel]); }

// Typing timers
export function setTypingTimer(room, timerId) { typingTimers[room] = timerId; }
export function clearTypingTimer(room) {
  if (typingTimers[room]) {
    clearTimeout(typingTimers[room]);
    delete typingTimers[room];
  }
}
export function clearAllTypingTimers() {
  Object.values(typingTimers).forEach(timerId => clearTimeout(timerId));
  Object.keys(typingTimers).forEach(key => delete typingTimers[key]);
}

// Optimistic queue
export function pushOptimisticMessage(channel, entry) { optimisticByChannel[channel].push(entry); }
export function findOptimisticIndex(channel, clientId, text) {
  let idx = optimisticByChannel[channel].findIndex((entry) => entry.clientId === clientId);
  if (idx === -1) idx = optimisticByChannel[channel].findIndex((entry) => entry.text === text);
  return idx;
}
export function spliceOptimistic(channel, index) { optimisticByChannel[channel].splice(index, 1); }
export function clearOptimisticChannel(channel) { optimisticByChannel[channel] = []; }

// Jump buttons
export function setJumpButton(containerId, button) { jumpButtons[containerId] = button; }
export function getJumpButton(containerId) { return jumpButtons[containerId]; }
export function hasJumpButton(containerId) { return !!jumpButtons[containerId]; }

// Message buffer
export function hasBufferedMessages(room) { return privateMessagesBuffer.has(room); }
export function getBufferedMessages(room) { return privateMessagesBuffer.get(room); }
export function touchBufferEntry(room) {
  if (privateMessagesBuffer.has(room)) {
    const existingBuffer = privateMessagesBuffer.get(room);
    privateMessagesBuffer.delete(room);
    privateMessagesBuffer.set(room, existingBuffer);
  }
}
export function createBufferEntry(room) { privateMessagesBuffer.set(room, []); }
export function deleteBufferEntry(room) { privateMessagesBuffer.delete(room); }
export function pushBufferedMessage(room, message) { privateMessagesBuffer.get(room).push(message); }
export function getBufferSize() { return privateMessagesBuffer.size; }
export function getOldestBufferKey() { return privateMessagesBuffer.keys().next().value; }
export function clearMessageBuffer() { privateMessagesBuffer.clear(); }

// Optimistic timeouts
export function hasOptimisticTimeout(clientId) { return optimisticTimeouts.has(clientId); }
export function getOptimisticTimeout(clientId) { return optimisticTimeouts.get(clientId); }
export function setOptimisticTimeout(clientId, timeoutId) { optimisticTimeouts.set(clientId, timeoutId); }
export function deleteOptimisticTimeout(clientId) {
  if (optimisticTimeouts.has(clientId)) {
    clearTimeout(optimisticTimeouts.get(clientId));
    optimisticTimeouts.delete(clientId);
  }
}
export function clearAllOptimisticTimeouts() {
  optimisticTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  optimisticTimeouts.clear();
}

// Full state reset
export function resetAllState() {
  currentUser = null;
  currentToken = null;
  currentRoom = null;
  currentRecipient = null;
  activeTab = "global";
  unreadGlobal = 0;
  unreadPrivate = 0;
  sendingGlobal = false;
  sendingPrivate = false;
  currentDisplayName = null;
  currentBio = null;
  currentStatus = null;
  currentCreatedAt = null;
  currentAvatarUrl = null;
  onlineUsersMap.clear();

  typingState.global.clear();
  typingState.private.clear();
  clearAllTypingTimers();
  clearOptimisticChannel("global");
  clearOptimisticChannel("private");
  clearMessageBuffer();
  clearAllOptimisticTimeouts();
  Object.keys(jumpButtons).forEach(key => delete jumpButtons[key]);
}