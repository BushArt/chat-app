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

export async function updateProfile(fields) {
  const res = await fetch("/auth/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + state.getCurrentToken()
    },
    body: JSON.stringify(fields)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Profile update failed.");
  return data;
}