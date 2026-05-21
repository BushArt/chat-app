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

export async function fetchGlobalHistory() {
  const res = await fetch("/messages/global", {
    headers: { Authorization: "Bearer " + state.getCurrentToken() }
  });
  if (!res.ok) throw new Error('Network response was not ok');
  const ct = (res.headers && typeof res.headers.get === 'function') ? res.headers.get('content-type') : null;
  if (ct !== null && !String(ct).includes('application/json')) throw new Error('Invalid JSON response');
  return await res.json();
}

export async function fetchPrivateHistory(user1, user2) {
  const res = await fetch(`/messages/${encodeURIComponent(user1)}/${encodeURIComponent(user2)}`, {
    headers: { Authorization: "Bearer " + state.getCurrentToken() }
  });
  if (!res.ok) throw new Error('Network response was not ok');
  const ct = (res.headers && typeof res.headers.get === 'function') ? res.headers.get('content-type') : null;
  if (ct !== null && !String(ct).includes('application/json')) throw new Error('Invalid JSON response');
  return await res.json();
}
