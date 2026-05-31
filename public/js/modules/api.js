/* eslint-env browser */
import * as state from './state.js';

export async function register(username, password) {
  const res = await fetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed.");
  return data;
}

export async function login(username, password) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed.");
  return data;
}

export async function fetchGlobalHistory(before) {
  const params = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await fetch(`/messages/global${params}`, {
    headers: { Authorization: "Bearer " + state.getCurrentToken() }
  });
  if (!res.ok) throw new Error('Network response was not ok');
  const ct = (res.headers && typeof res.headers.get === 'function') ? res.headers.get('content-type') : null;
  if (ct !== null && !String(ct).includes('application/json')) throw new Error('Invalid JSON response');
  return await res.json();
}

export async function fetchPrivateHistory(user1, user2, before) {
  const params = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await fetch(`/messages/${encodeURIComponent(user1)}/${encodeURIComponent(user2)}${params}`, {
    headers: { Authorization: "Bearer " + state.getCurrentToken() }
  });
  if (!res.ok) throw new Error('Network response was not ok');
  const ct = (res.headers && typeof res.headers.get === 'function') ? res.headers.get('content-type') : null;
  if (ct !== null && !String(ct).includes('application/json')) throw new Error('Invalid JSON response');
  return await res.json();
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
  'video/mp4', 'video/webm'
]);

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Upload a file attachment. Returns attachment metadata on success.
 * @param {File} file
 * @param {string|null} room - private room ID (null for global)
 * @param {string|null} receiver - recipient username (null for global)
 * @param {boolean} isGlobal
 * @returns {Promise<{type: string, filename: string, url: string, mimetype: string, size: number}>}
 */
export async function uploadAttachment(file, room, receiver, isGlobal) {
  // Client-side pre-validation
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`File type "${file.type}" is not supported.`);
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File exceeds the 25 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const formData = new FormData();
  formData.append('file', file);
  if (!isGlobal) {
    formData.append('receiver', receiver);
    formData.append('room', room);
  }

  const res = await fetch('/messages/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + state.getCurrentToken() },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed.');
  return data;
}

export async function fetchProfile() {
  const res = await fetch("/auth/me", {
    headers: { Authorization: "Bearer " + state.getCurrentToken() }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data && data.error) || "Failed to fetch profile.");
  }
  return await res.json();
}

export async function updateProfile(fields, avatarFile) {
  let body;
  let headers = {
    Authorization: "Bearer " + state.getCurrentToken()
  };

  if (avatarFile) {
    // Multipart form upload for avatar
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }
    formData.append('avatar', avatarFile);
    body = formData;
  } else {
    // JSON upload for text-only fields
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(fields);
  }

  const res = await fetch("/auth/profile", {
    method: "PUT",
    headers,
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Profile update failed.");
  return data;
}
