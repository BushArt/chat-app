/* eslint-env browser */

export const MAX_LEN = 1000;
export const TYPING_DEBOUNCE_MS = 200;
export const OPTIMISTIC_TIMEOUT = 31000;
export const MAX_BUFFERED_ROOMS = 50;

export function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function getRoomId(a, b) {
  return [a, b].sort().join(":");
}

export function formatTime(time) {
  const dt = new Date(time);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(time) {
  const diff = Math.floor((Date.now() - new Date(time)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + " min ago";
  if (diff < 86400) return Math.floor(diff / 3600) + " hr ago";
  return new Date(time).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function displayTime(time, timeFormat) {
  return timeFormat === "relative" ? relativeTime(time) : formatTime(time);
}

export function isSameDay(timeA, timeB) {
  const dateA = new Date(timeA);
  const dateB = new Date(timeB);
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

export function formatDateLabel(time) {
  const date = new Date(time);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((todayStart - targetStart) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function createClientId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function tryCopyText(text) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

export function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

export function isNearBottom(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 120;
}

export function maybeScrollToBottom(container) {
  if (isNearBottom(container)) container.scrollTop = container.scrollHeight;
}

export function scrollToBottom(container) {
  container.scrollTop = container.scrollHeight;
}