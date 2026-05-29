/**
 * Socket-level shared state
 * Single source of truth for all socket connection state
 * Live references are exported - DO NOT replace these objects
 */

const User = require('../models/User');

const onlineUsers = new Map(); // username -> Set of socket IDs
const typingTimeouts = new Map(); // key: `${username}:${room}` -> timeout
const typingTimeoutsByUser = new Map(); // username -> Set of composite keys

const MAX_TYPING_ENTRIES = 10000;
const TYPING_TIMEOUT = 4000;
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Returns an array of online user profile objects.
 * Queries the database for displayName and status.
 * Backward-compatible: if DB query fails, falls back to username-only strings.
 */
async function getOnlineList() {
  const usernames = Array.from(onlineUsers.keys());
  if (usernames.length === 0) return [];

  try {
    const users = await User.find({ username: { $in: usernames } })
      .select('username displayName status')
      .lean();

    return users.map(u => ({
      username: u.username,
      displayName: u.displayName || u.username,
      status: u.status || 'online'
    }));
  } catch {
    // Fall back to string array for backward compatibility
    return usernames;
  }
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