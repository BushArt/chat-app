/**
 * Socket-level shared state
 * Single source of truth for all socket connection state
 * Live references are exported - DO NOT replace these objects
 */

const onlineUsers = new Map(); // username -> Set of socket IDs
const typingTimeouts = new Map(); // key: `${username}:${room}` -> timeout
const typingTimeoutsByUser = new Map(); // username -> Set of composite keys

const MAX_TYPING_ENTRIES = 10000;
const TYPING_TIMEOUT = 4000;
const MAX_MESSAGE_LENGTH = 1000;

function getOnlineList() {
  return Array.from(onlineUsers.keys());
}

module.exports = {
  onlineUsers,
  typingTimeouts,
  typingTimeoutsByUser,
  MAX_TYPING_ENTRIES,
  TYPING_TIMEOUT,
  MAX_MESSAGE_LENGTH,
  getOnlineList
};