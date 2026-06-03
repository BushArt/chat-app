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
 * Normalize MIME type by stripping codec parameters.
 * e.g. 'audio/webm;codecs=opus' → 'audio/webm'
 */
function normalizeMime(type) {
  return type.split(';')[0].trim().toLowerCase();
}

/**
 * Upload a file attachment. Returns attachment metadata on success.
 * @param {File} file
 * @param {string|null} room - private room ID (null for global)
 * @param {string|null} receiver - recipient username (null for global)
 * @param {boolean} isGlobal
 * @returns {Promise<{type: string, filename: string, url: string, mimetype: string, size: number}>}
 */
export async function uploadAttachment(file, room, receiver, isGlobal) {
  // Client-side pre-validation (normalize to handle codec parameters like audio/webm;codecs=opus)
  if (!ALLOWED_MIME_TYPES.has(normalizeMime(file.type))) {
    throw new Error(`File type "${file.type}" is not supported.`);
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File exceeds the 25 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const formData = new FormData();
  formData.append('file', file);
  // If audio, compute duration and send it to the server so it can be persisted.
  if (file.type && file.type.startsWith('audio/')) {
    // Compute duration using an Audio element and object URL
    try {
      const objectUrl = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        const audio = new Audio();
        let resolved = false;
        audio.preload = 'metadata';
        audio.src = objectUrl;
        audio.addEventListener('loadedmetadata', () => {
          try {
            const durationMs = Math.round((isFinite(audio.duration) && audio.duration > 0) ? audio.duration * 1000 : 0);
            formData.append('duration_ms', String(durationMs));
          } catch (e) {
            // ignore and continue
          }
          resolved = true;
          resolve();
        });
        audio.addEventListener('error', () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });
        // Safety timeout in case metadata never fires
        setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 2000);
      });
    } catch (e) {
      // ignore errors computing duration
    }
  }
  formData.append('isGlobal', isGlobal ? 'true' : 'false');
  formData.append('room', isGlobal ? 'global' : room);
  if (!isGlobal) {
    formData.append('receiver', receiver);
  }

  // Debug hook: if set, also POST a copy of the file to `/debug/capture`
  // so the server can write the exact bytes the browser sends to /tmp.
  try {
    if (window && window.__debugCaptureUploads) {
      try {
        const debugFd = new FormData();
        debugFd.append('file', file);
        // Fire-and-forget; don't block normal upload on debug capture.
        fetch('/debug/capture', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + state.getCurrentToken() },
          body: debugFd
        }).catch(() => {});
      } catch (e) {
        // Ignore debug capture failures
      }
    }
  } catch (e) {
    // ignore window access errors in non-browser contexts
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
