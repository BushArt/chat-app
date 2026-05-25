# Chat Application — Phased Feature Plan
**Version:** 1.0.0
**Date:** May 2026
**Based on:** Design Infrastructure Document v1.0.0, Architecture Review, Feature Plan

---

## Table of Contents

1. Executive Summary
2. Guiding Principles
3. Pre-Phase: Foundation Hardening
4. Phase 1 — User Profiles (Display Name, Bio, Status)
5. Phase 2 — Avatars
6. Phase 3 — File Attachments
7. Phase 4 — Voice Messages
8. Phase 5 — Test Suite Extensions
9. Cross-Phase Concerns
10. Risk Register
11. Dependency Map
12. Definition of Done

---

## 1. Executive Summary

The chat application currently supports real-time global and private messaging, JWT authentication, presence tracking, and typing indicators. It has a complete test suite and no support for media, attachments, or user profiles beyond a username.

This plan introduces four user-facing feature phases — Profiles, Avatars, File Attachments, and Voice Messages — preceded by a foundation-hardening pre-phase that addresses a small set of known security shortcomings that would otherwise be inherited by every subsequent phase.

Each phase is self-contained and delivers shippable value independently. No phase requires the next to be complete before it can be deployed. The sequencing is designed so that infrastructure investment in one phase reduces the cost of the next: cloud storage configured in Phase 2 is reused by Phases 3 and 4; the upload endpoint introduced in Phase 3 is extended rather than replaced in Phase 4.

The plan is written to be consistent with the existing architecture: the monolithic Node.js/Express/Socket.IO/MongoDB stack, vanilla frontend ES modules, and the constraint that the filesystem is ephemeral (Railway or equivalent PaaS deployment).

---

## 2. Guiding Principles

**Additive, not disruptive.** Every phase extends existing interfaces (models, routes, socket event payloads, client state) rather than replacing them. Text-only message flows must continue to work unchanged throughout all phases.

**Back-pressure on complexity.** Features are introduced in the order that minimizes the number of new infrastructure dependencies introduced at once. Profiles require only a database schema change. Avatars add one cloud service. Attachments reuse it. Voice adds only a client-side API.

**Security by default.** New upload endpoints inherit JWT enforcement from the existing `middleware/auth.js`. File type allowlists, size limits, and authenticated download patterns are specified as requirements, not afterthoughts.

**Test coverage as a gate.** The test suite is already in place. Each feature phase specifies the test extensions required before that phase is considered complete. No phase ships without meaningful coverage of its new code paths added to the existing suite.

**Backward compatibility of socket events.** All additions to `receive_global_message` and `receive_message` payloads are optional fields. Clients that do not yet handle the new fields must not break.

---

## 3. Pre-Phase: Foundation Hardening

**Goal:** Resolve the known gaps documented in the Design Infrastructure Document before any feature work begins. This phase produces no user-visible features. It produces a more secure and complete baseline on top of the existing tested codebase.

**Duration estimate:** 1 sprint.

---

### 3.1 Security Header Gaps

**Content-Security-Policy.** The Design Infrastructure Document notes that CSP is not set. Add a CSP header in `middleware/security.js` that restricts script sources to `'self'` and the Socket.IO client path. This is a one-line addition to an existing middleware function and has no feature dependencies.

**JWT revocation.** The Design Infrastructure Document notes that logged-out tokens remain valid for 24 hours. For now, add server-side token issuance timestamp tracking to `models/User.js` as a `lastLogout` date field. During JWT verification in `middleware/auth.js`, reject tokens whose `iat` (issued-at) claim predates `lastLogout`. This does not require Redis; it uses one additional MongoDB read per authenticated request, which is acceptable at current scale.

**Socket typing rate limiting.** The Design Infrastructure Document notes that `join_room` and typing events are not rate-limited. Add a lightweight counter in the `handleStartTyping` handler that discards events beyond 30 per minute per socket. This prevents typing indicator flooding without adding new dependencies.

**Acceptance criteria:**

- `curl -I` of any page shows `Content-Security-Policy` header present.
- A token used after its issuing user has logged out returns 403.
- A socket flooding `start_typing` at more than 30/min receives no broadcast for excess events.
- Existing security middleware tests are extended to cover the new CSP assertion.

---

### 3.2 Message Pagination

The Design Infrastructure Document identifies the hard-coded history limits (100 global, 50 private) and the absence of pagination as a known limitation. Before any phase adds richer message payloads (attachments), the history endpoints should support cursor-based pagination to avoid stranded older content.

**Actions:**

Add an optional `before` query parameter to `GET /messages/global` and `GET /messages/:user1/:user2`. When present, `before` is a MongoDB ObjectId or ISO timestamp; the query adds a `createdAt < before` filter and returns the previous page of results. The default (no `before`) behavior is unchanged: return the most recent N messages.

Update the client's `api.js` to pass `before` when the user scrolls to the top of the message list. Add a "load earlier messages" trigger in `ui.js` (a button or scroll sentinel).

**Acceptance criteria:**

- `GET /messages/global?before=<id>` returns the correct page of messages older than that cursor.
- The client shows older messages when the user scrolls to the top of a full history.
- Existing message route integration tests are extended to cover the `before` parameter.

---

## 4. Phase 1 — User Profiles

**Goal:** Allow users to set a display name, a short bio/status line, and a personal status indicator (online, away, busy). Store this metadata on the User model and expose it through REST endpoints. Surface it in the chat UI next to usernames.

**Dependencies:** Pre-phase complete.

**Duration estimate:** 1 sprint.

**Infrastructure added:** None. This phase requires only a database schema change and new REST routes.

---

### 4.1 Data Model Changes

**`models/User.js` additions:**

| Field | Type | Default | Constraints |
|---|---|---|---|
| `displayName` | String | `username` (set at registration) | Max 50 codepoints, same character set as username plus spaces and punctuation |
| `bio` | String | `""` | Max 160 codepoints |
| `status` | String enum | `"online"` | Allowed values: `"online"`, `"away"`, `"busy"`, `"offline"` |

`displayName` is populated at registration time to equal the `username`. The `username` field remains the immutable, unique identifier used in room names, JWT payloads, and message records. `displayName` is the mutable, human-readable label shown in the UI.

The `status` field is server-managed: it is set to `"online"` when the user connects a socket, and to `"offline"` when all connections close. Users can manually set `"away"` or `"busy"` through the profile update endpoint; the server will override the value back to `"online"` on next connection.

**`models/Message.js` addition:**

| Field | Type | Default |
|---|---|---|
| `senderDisplayName` | String | `""` |

This is denormalized at write time (populated from `User.displayName` at the moment the message is saved). This ensures that if a user later changes their display name, historical messages still show the name that was in use when they were sent.

> **Indexing note:** `senderDisplayName` is for display only — it is not used in queries (messages are queried by `sender`, `receiver`, `isGlobal`, and `createdAt`). The existing compound index on `{ sender: 1, receiver: 1, createdAt: 1 }` and the index on `{ isGlobal: 1, createdAt: 1 }` cover all read paths. No new index is needed for this field.

---

### 4.2 New REST Endpoints

**POST /auth/login (extended)**

The existing login response (`routes/auth.js:156`) returns only `{ token, username }`. Extend it to include the profile object, avoiding an extra round-trip on every login:

```json
{
  "token": "eyJ...",
  "username": "alice",
  "displayName": "Alice Chen",
  "bio": "Just here to chat.",
  "status": "online",
  "avatarUrl": null,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

The client can populate `state.js` from this response immediately and skip the `GET /auth/me` call on login. The `GET /auth/me` endpoint remains available for session restore (page refresh).

**POST /auth/register (extended)**

Similarly extend the registration response (currently `{ message }`) to return the same profile object, so the client has display data immediately after account creation without an extra round-trip.

**GET /auth/me**

Requires JWT. Returns the current user's profile:

```json
{
  "username": "alice",
  "displayName": "Alice Chen",
  "bio": "Just here to chat.",
  "status": "online",
  "createdAt": "2026-01-15T10:00:00Z"
}
```

No password field is ever included in this response.

**PUT /auth/profile**

Requires JWT. Accepts JSON body with any subset of `{ displayName, bio, status }`. Fields not included in the request are not modified.

Validation rules:
- `displayName`: trimmed, 1–50 codepoints, same Unicode-aware regex as `username` but with spaces and common punctuation additionally allowed.
- `bio`: trimmed, max 160 codepoints, no HTML.
- `status`: must be one of `"online"`, `"away"`, `"busy"`. (Clients cannot set `"offline"` directly; that is server-managed on disconnect.)

Returns the updated profile object on success (same shape as `GET /auth/me`).

Rate limiting: 20 profile update requests per hour per IP to prevent abuse.

---

### 4.3 Socket Integration

When a user updates their status via `PUT /auth/profile`, the server should notify connected clients so the online user list can reflect the change in real time. The existing `online_users` event already broadcasts an array of usernames; extend it to carry profile metadata.

**Updated `online_users` payload:**

Change from `string[]` to an array of objects:

```json
[
  { "username": "alice", "displayName": "Alice Chen", "status": "online" },
  { "username": "bob", "displayName": "Bob", "status": "away" }
]
```

This is a breaking change to the event shape. The client's `socket.js` handler for `online_users` must be updated to handle both the old array-of-strings shape (for backward compatibility during a rolling deploy) and the new array-of-objects shape. Additionally, the `renderOnlineUsers()` function in `ui.js:248` must be updated: it currently iterates `users.forEach(username => ...)` treating each element as a string; after Phase 1 it must detect the format and extract `username`, `displayName`, and `status` from objects.

Add a `profile_updated` socket event emitted to all sockets after a successful `PUT /auth/profile`, carrying `{ username, displayName, status }`. This allows the client to update a specific user's display in the user list without waiting for a full presence event.

---

### 4.4 Frontend Changes

**`api.js`:** Add `fetchProfile()` and `updateProfile(fields)`.

**`state.js`:** Add `currentDisplayName`, `currentBio`, `currentStatus` to session state. Add `onlineUsersMap` (a Map of username → `{ displayName, status }`) to replace the current `onlineUsersList` array. Update getters/setters accordingly.

**`ui.js`:**
- In the online user list, show `displayName` instead of `username` (with `username` as a tooltip or sub-label).
- Show status indicator dots (green/yellow/red) next to each user in the online list.
- Add a profile edit panel (accessible from the current user's display in the header). The panel is a simple form with inputs for `displayName`, `bio`, and a `status` dropdown. Submitting calls `updateProfile()` and updates local state.
- In message bubbles, show `senderDisplayName` instead of `sender` (username) where available.

**`app.js`:**
- Update the `login()` function to populate `state.js` profile fields from the extended login response (which now includes `displayName`, `bio`, `status`, `avatarUrl`), eliminating the immediate round-trip to `GET /auth/me`.
- Call `fetchProfile()` after session restore (the `restoreSession()` function at line 231) to fetch profile data that is not cached in localStorage. Without this, a page refresh will leave the user without `displayName`, `bio`, `avatarUrl` until they log out and back in.
- Update the `register()` function to populate profile fields from the extended registration response.

---

### 4.5 Phase 1 Test Requirements

**Extend `__tests__/unit/models/User.test.js`:**
- `displayName` defaults to `username` on save.
- `bio` defaults to empty string.
- `status` defaults to `"online"`.
- `displayName` exceeding 50 codepoints fails validation.
- `bio` exceeding 160 codepoints fails validation.
- `status` set to an invalid value fails validation.

**Extend `__tests__/integration/routes/auth.routes.test.js`:**
- `GET /auth/me` returns 401 without JWT.
- `GET /auth/me` returns the profile object with correct fields.
- `GET /auth/me` never includes a `password` field.
- `PUT /auth/profile` returns 400 when `displayName` is empty after trim.
- `PUT /auth/profile` returns 400 when `status` is `"offline"`.
- `PUT /auth/profile` returns 400 when `bio` exceeds 160 codepoints.
- `PUT /auth/profile` with only `bio` does not overwrite `displayName`.
- `PUT /auth/profile` returns the updated profile on success.

**Extend `__tests__/integration/sockets/connection.test.js`:**
- `online_users` payload after Phase 1 is an array of objects with `username`, `displayName`, `status`.
- After `PUT /auth/profile`, all connected clients receive `profile_updated`.

**Extend `__tests__/client/state.client.test.js`:**
- `setCurrentDisplayName` and `getCurrentDisplayName` round-trip correctly.
- `onlineUsersMap` updates correctly when `profile_updated` is processed.

---

## 5. Phase 2 — Avatars

**Goal:** Allow users to upload a profile picture. Store it in Cloudinary. Display it next to messages and in the online user list.

**Dependencies:** Phase 1 complete. Cloudinary account configured.

**Duration estimate:** 1 sprint.

**Infrastructure added:** Cloudinary (cloud image/audio storage). `multer` for multipart parsing.

---

### 5.1 Infrastructure Setup

**Cloudinary account and configuration:**

Create `config/cloudinary.js`:

```javascript
const cloudinary = require('cloudinary').v2;
cloudinary.config(); // reads CLOUDINARY_URL from environment
module.exports = cloudinary;
```

Add `CLOUDINARY_URL` to the required environment variables validated in `config/env.js`. The process must exit on startup if this variable is absent in production.

Add to `.env.example`:

```
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

**multer configuration:**

Install `multer`. Configure it to use memory storage (not disk storage, since the filesystem is ephemeral). Set a file size limit of 5 MB for avatars. The file buffer is passed directly to Cloudinary's upload stream.

Create a shared `middleware/upload.js` that exports pre-configured multer instances. This module is reused in Phase 3 for attachment uploads; configuring it once here reduces Phase 3 effort.

```javascript
// middleware/upload.js
const multer = require('multer');
const storage = multer.memoryStorage();

const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const attachmentUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB, for Phase 3
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

module.exports = { avatarUpload, attachmentUpload };
```

---

### 5.2 Data Model Changes

**`models/User.js` addition:**

| Field | Type | Default |
|---|---|---|
| `avatarUrl` | String | `null` |

The URL stored is the Cloudinary delivery URL (HTTPS). The Cloudinary public ID is not stored separately; if needed, it can be derived from the URL.

---

### 5.3 Combined Profile/Avatar Route

Rather than a separate `POST /auth/avatar` endpoint, the avatar upload is integrated into `PUT /auth/profile`. The route accepts `multipart/form-data` with optional text fields (`displayName`, `bio`, `status`) and an optional `avatar` file field.

If no `avatar` file is included, the route behaves exactly as the Phase 1 JSON endpoint (preserving the existing `avatarUrl`). If an `avatar` file is included, it is uploaded to Cloudinary and the returned URL overwrites `avatarUrl`.

This consolidation means the client only needs one endpoint for all profile changes.

**Route implementation notes:**

The multer `avatarUpload.single('avatar')` middleware runs first. If no file is present, `req.file` is undefined and the route proceeds with text-field-only update logic. If `req.file` is present, the buffer is uploaded to Cloudinary:

```javascript
const result = await cloudinary.uploader.upload_stream(
  { folder: 'chat-app/avatars', public_id: `user_${req.user.username}`, overwrite: true },
  callback
).end(req.file.buffer);
```

Using the username as the Cloudinary public ID (with `overwrite: true`) means repeated uploads replace the previous avatar rather than accumulating orphaned files.

The updated `GET /auth/me` response and `profile_updated` socket event both include `avatarUrl`.

---

### 5.4 Socket Integration

Extend `profile_updated` to include `avatarUrl`:

```json
{ "username": "alice", "displayName": "Alice Chen", "status": "online", "avatarUrl": "https://res.cloudinary.com/..." }
```

Extend `online_users` payload objects to include `avatarUrl`.

---

### 5.5 Frontend Changes

**`api.js`:** Update `updateProfile()` to accept an optional `avatarFile` parameter. When present, construct a `FormData` object and send as `multipart/form-data`. When absent, continue sending as JSON.

**`state.js`:** Add `currentAvatarUrl` to session state. Add `avatarUrl` to the entries stored in `onlineUsersMap`.

**`ui.js`:**
- Render avatar `<img>` elements in message bubbles (left of the bubble, showing the sender's avatar).
- Render avatar thumbnails in the online user list.
- In the profile edit panel, show the current avatar with an "Upload new photo" button that triggers a file input. Show a local preview (`URL.createObjectURL`) before the upload completes.
- Handle missing avatars gracefully: when `avatarUrl` is null, render a CSS circle with the first character (codepoint) of `displayName` as the initial. Use a fixed background color (or derive it deterministically from the username). Do not use external services like Gravatar or UI Avatars.
- Profile picture section in the profile edit panel: show a preview circle styled identically to the message bubble avatars (same CSS class).

---

### 5.6 Phase 2 Test Requirements

**New unit tests (`__tests__/unit/middleware/upload.test.js`):**
- `avatarUpload` filter accepts `image/jpeg`, `image/png`, `image/webp`, rejects `application/pdf` and `text/html`.
- `attachmentUpload` filter accepts `audio/webm` and `application/pdf`, rejects `text/html`.

**Extend `__tests__/integration/routes/auth.routes.test.js`:**
- `PUT /auth/profile` with a valid image file returns 200 and an `avatarUrl` in the response (mock Cloudinary upload to return a fixed URL).
- `PUT /auth/profile` with a file exceeding 5 MB returns 400.
- `PUT /auth/profile` with a disallowed MIME type (e.g., `application/pdf`) returns 400.
- `PUT /auth/profile` with no file does not overwrite an existing `avatarUrl`.
- Cloudinary upload failure (mock to reject) returns 500 with an `error` field.

**Extend `__tests__/client/`:**
- `api.js` `updateProfile()` sends `multipart/form-data` when an avatar file is provided.
- `ui.js` renders an initial placeholder when `avatarUrl` is null.

---

## 6. Phase 3 — File Attachments

**Goal:** Allow users to attach images, documents, and other files to messages in both global and private chat. Files are uploaded via REST before being referenced in a socket message event.

**Dependencies:** Phase 2 complete (Cloudinary configured, `middleware/upload.js` exists, `attachmentUpload` multer instance ready).

**Duration estimate:** 1–2 sprints.

**Infrastructure added:** No new infrastructure. Reuses Cloudinary and multer from Phase 2.

---

### 6.1 Data Model Changes

**`models/Message.js` addition:**

Add an optional `attachment` subdocument using an explicit Mongoose subdocument schema:

```javascript
const attachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'audio', 'file'] },
  filename: String,
  url: String,
  mimetype: String,
  size: Number // bytes
}, { _id: false }); // no separate _id for attachment subdocuments

// Add to messageSchema:
// attachment: { type: attachmentSchema, default: null }
```

> **Why `_id: false`?** Each `attachment` is always accessed as part of its parent `Message`. A separate `_id` on every attachment would consume index space with no query benefit.

All fields in `attachment` are optional at the model level; validation is enforced at the route level. A message must have at least one of `message` (non-empty string) or `attachment` (with `url` present). A message may have both (a file with a text caption).

---

### 6.2 New REST Endpoint

**POST /messages/upload**

Requires JWT. Accepts `multipart/form-data` with:
- `file` — the binary file (required).
- `room` — the room ID or `"global"` (required, for authorization checking).
- `receiver` — username of the recipient, if private (required when `room` is not `"global"`).
- `isGlobal` — `"true"` or `"false"` string (required).

Authorization check: if `isGlobal` is false, the requesting user must be `sender` or `receiver` in the conversation (same logic as `GET /messages/:user1/:user2`).

Processing steps:
1. Parse the multipart form with `attachmentUpload.single('file')`.
2. Validate MIME type against the allowlist.
3. Validate file size (≤ 25 MB).
4. Generate a safe public ID: `chat-app/attachments/<uuid>`.
5. Upload the buffer to Cloudinary with `resource_type: 'auto'` (handles images, audio, and raw files).
6. Receive the Cloudinary response: `secure_url`, `original_filename`, `format`, `bytes`.
7. Return the attachment metadata to the client:

```json
{
  "type": "image",
  "filename": "screenshot.png",
  "url": "https://res.cloudinary.com/...",
  "mimetype": "image/png",
  "size": 204800
}
```

The client then includes this attachment object in the subsequent `send_global_message` or `send_message` socket event payload.

**Rate limiting:** 20 upload requests per 15 minutes per IP (separate from the auth limiter).

---

### 6.3 Socket Event Changes

**`send_global_message` and `send_message` payloads** gain an optional `attachment` field:

```json
{
  "message": "Check this out",
  "clientId": "abc123",
  "attachment": {
    "type": "image",
    "filename": "screenshot.png",
    "url": "https://res.cloudinary.com/...",
    "mimetype": "image/png",
    "size": 204800
  }
}
```

If `attachment` is present but `message` is an empty string, the message body is treated as an attachment-only message (caption is blank). The existing non-null/non-empty validation for `message` is relaxed to: at least one of `message` or `attachment.url` must be present.

**Server-side handler changes (`sockets/handlers/globalMessage.js`, `sockets/handlers/privateMessage.js`):**
- Validate `data.attachment` structure if present: `type` must be one of the allowed enum values, `url` must be a non-empty string, `size` must be a positive number.
- Persist `attachment` on the saved `Message` document.
- Include `attachment` in the broadcast payloads (`receive_global_message`, `receive_message`).

**Client-side socket handler changes (`public/js/modules/socket.js`):**
- Update the `receive_global_message` handler (line 23) and `receive_message` handler (line 47) which currently check `typeof data.message !== 'string'` and bail out. After Phase 3, an attachment-only message will have `data.message === ""` and will be silently dropped. Change these guards to: `if (typeof data.message !== 'string' && !data.attachment?.url) return`
- When rendering messages with attachments, pass `data.attachment` through to `ui.appendMessage()` via the `options` parameter.

**Private attachment security:** The Cloudinary URL itself is publicly accessible by anyone who knows it (Cloudinary's default). For Phase 3, this is acceptable for non-sensitive use cases. If private attachment URLs are required in a future phase, Cloudinary signed URLs (with expiry) can be generated at download time via the authenticated download route.

---

### 6.4 Frontend Changes

**`api.js`:** Add `uploadAttachment(file, room, receiver, isGlobal)` that posts to `POST /messages/upload` with a `FormData` object. Add client-side MIME type and file size pre-validation (matching the server's allowlist) so the user gets immediate feedback before uploading.

**`state.js`:** No schema changes needed. The `optimisticByChannel` entries can carry an optional `attachment` field for in-flight attachment messages.

**`ui.js`:** Update `appendMessage(containerId, sender, text, time, type, options = {})` with the following extended options schema:

```javascript
// options schema after Phase 3:
{
  pending: boolean,           // shows pending indicator
  clientId: string,           // for optimistic timeout tracking
  senderDisplayName: string,  // display name instead of username in meta line
  attachment: {               // attachment metadata
    type: 'image' | 'audio' | 'file',
    filename: string,
    url: string,
    mimetype: string,
    size: number
  }
}
```

When `options.attachment` is present:
- Render the attachment element below the text `<div>` inside the bubble (before the copy button).
- For `type: "image"`: render an `<img>` with `loading="lazy"`, max-width constrained, click to open full size.
- For `type: "audio"`: render an `<audio controls>` element with the Cloudinary URL as `src`.
- For `type: "file"`: render a download link showing the filename and a file icon sized by type.
- If both text and attachment are present, text appears above the attachment.

Add a file picker button in the message input area. On file selection:
1. Validate MIME type and size client-side (before uploading) with a user-facing error for violations.
2. Call `uploadAttachment()`. Show a progress indicator during upload.
3. On success, store the returned attachment metadata in a pending state.
4. Enable the send button. The user may optionally type a caption. The send button should be enabled when either the text input is non-empty OR an attachment is pending.
5. On send, include the attachment object in the socket emit payload.

**`app.js`:** Update the client-side send guards in `sendGlobalMessage()` (line 136) and `sendPrivateMessage()` (line 167). Currently they check `if (!text || ...) return;` which blocks sending when the text input is empty. After Phase 3, this guard must also allow sending when `pendingAttachment` is present:

```javascript
// New send guard logic:
const text = dom.globalInput.value.trim();
const hasAttachment = state.getPendingAttachment() !== null;
if (!text && !hasAttachment) return;
if (text && [...text].length > utils.MAX_LEN) return;
```

Add `pendingAttachment` state to `state.js` (a simple variable with getter/setter), and clear it after a successful send.

**`optimistic.js`:** Extend `addOptimisticMessage` to accept an optional `attachment` parameter and render it in the pending bubble (image thumbnail or filename link with a "pending" overlay).

---

### 6.5 Phase 3 Test Requirements

**Extend `__tests__/unit/sockets/handlers/globalMessage.test.js` and `privateMessage.test.js`:**
- `globalMessage` handler: persists `attachment` when present and valid.
- `globalMessage` handler: rejects payload when both `message` is empty and `attachment` is absent.
- `globalMessage` handler: rejects `attachment` when `type` is not in the allowed enum.
- Same tests mirrored for `privateMessage` handler.

**Extend `__tests__/integration/routes/messages.routes.test.js`:**
- `POST /messages/upload` returns 401 without JWT.
- `POST /messages/upload` returns 400 when no file is attached.
- `POST /messages/upload` returns 400 for a disallowed MIME type.
- `POST /messages/upload` returns 400 for a file exceeding 25 MB.
- `POST /messages/upload` returns 403 when the user is not a participant in the private conversation.
- `POST /messages/upload` returns 200 with attachment metadata on success (mock Cloudinary).
- `POST /messages/upload` returns 500 on Cloudinary failure (mock to reject).

**Extend `__tests__/integration/sockets/globalMessage.socket.test.js` and `privateMessage.socket.test.js`:**
- A message sent with a valid `attachment` results in `receive_global_message` that includes the attachment fields.
- A text-only message (no `attachment`) is unaffected.
- A payload with neither `message` nor `attachment` is rejected without broadcast.

**Extend `__tests__/e2e/messaging.e2e.test.js`:**
- A user can upload a file, then send a message referencing it, and the receiver receives the attachment URL.
- The attachment is persisted in MongoDB with the correct metadata.

---

## 7. Phase 4 — Voice Messages

**Goal:** Allow users to record short audio messages (up to 2 minutes) directly in the browser and send them as a special `audio` attachment type.

**Dependencies:** Phase 3 complete (upload endpoint exists, audio MIME types already in the allowlist).

**Duration estimate:** 2 sprints. The `MediaRecorder` state machine and cross-browser compatibility work (Chrome, Firefox, Safari each have different MIME support) typically take longer than a single iteration for a side project.

**Infrastructure added:** No new server infrastructure. All new logic is client-side (`MediaRecorder` API). The existing upload endpoint handles audio files identically to other attachments.

---

### 7.1 Server-Side Changes (Minimal)

No new endpoints or schema changes are required. Audio voice messages are a subtype of the `attachment` object introduced in Phase 3: `type: "audio"`, with `mimetype` set to `audio/webm;codecs=opus` or `audio/mp4`.

The server-side upload endpoint already accepts `audio/webm`, `audio/mp4`, and `audio/mpeg` in the MIME allowlist (configured in `middleware/upload.js` during Phase 2).

The socket handlers already accept and broadcast `attachment` objects.

The only server-side addition is a size limit check specific to audio: voice messages are limited to 10 MB (not the 25 MB limit for general attachments). Add a `maxVoiceSize` constant to `config/env.js` and validate it in the upload route when `mimetype` starts with `audio/`.

---

### 7.2 New Client Module: `recorder.js`

Create `public/js/modules/recorder.js`. This module encapsulates all `MediaRecorder` API interaction.

**Format selection:**

```javascript
function getSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus', // Chrome, Edge, Firefox
    'audio/webm',
    'audio/mp4',              // Safari
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}
```

**State machine:**

The recorder follows a strict state machine with five states: `idle`, `requesting` (permission prompt), `recording`, `preview`, `sending`. Invalid state transitions are silently ignored (no throws).

```
idle
  → requesting   (user taps record button)
    → recording  (permission granted)
    → idle        (permission denied; show error)
  recording
    → preview    (user taps stop, or 2-minute limit reached)
  preview
    → recording  (user taps re-record)
    → sending    (user taps send)
    → idle        (user taps discard)
  sending
    → idle        (upload complete, message sent)
    → preview     (upload failed; allow retry)
```

**Recording enforcement:**

Set a `maxDuration` of 120 seconds. A `setTimeout` stops the recording automatically when the limit is reached. A visual countdown timer (in `ui.js`) shows the remaining time.

**Collected chunks:**

`MediaRecorder.ondataavailable` accumulates `Blob` chunks into an array. `MediaRecorder.onstop` creates a final `Blob` from the chunks, derives a filename (`voice-<timestamp>.webm`), and calls a configurable `onRecordingReady(blob, filename, mimeType)` callback.

**Exported interface:**

```javascript
export { startRecording, stopRecording, discardRecording, getState, onStateChange };
```

`onStateChange` accepts a callback that receives the new state string on every transition. `ui.js` subscribes to this to update the record button appearance.

---

### 7.3 Frontend Integration

**`ui.js`:** Add the voice record button to the message input area (alongside the file picker added in Phase 3). The button appearance cycles through state-appropriate icons and labels:
- `idle`: microphone icon.
- `requesting`: spinner.
- `recording`: pulsing red dot + elapsed timer + stop button.
- `preview`: waveform or audio player + send/discard buttons.
- `sending`: spinner.

On entering `preview` state, render an `<audio controls>` element with an `objectURL` of the recorded blob so the user can listen before sending.

**`app.js`:** Wire the record button to `recorder.startRecording()` and `recorder.stopRecording()`. In the `onRecordingReady` callback:
1. Call `uploadAttachment(blob, room, receiver, isGlobal)` (same function used for file attachments).
2. On success, emit the socket message with `attachment.type = "audio"`.
3. On failure, return to `preview` state with an error notice.

---

### 7.4 Phase 4 Test Requirements

Because `MediaRecorder` is not available in Node.js or jsdom without polyfilling, all voice recording tests use manual mocks.

**New client unit tests (`__tests__/client/recorder.client.test.js`):**

Mock `window.MediaRecorder` with a jest mock class that simulates:
- `start()` transitions state to `recording`.
- `stop()` fires the `onstop` callback with a mock Blob.
- `isTypeSupported()` returns `true` for `audio/webm;codecs=opus`.

Test cases:
- `startRecording()` requests microphone permission (`navigator.mediaDevices.getUserMedia` mock).
- `startRecording()` transitions to `recording` state after permission granted.
- `startRecording()` transitions back to `idle` state after permission denied.
- `stopRecording()` while in `recording` state transitions to `preview`.
- `stopRecording()` while in `idle` state is a no-op (no throw).
- `discardRecording()` while in `preview` state transitions to `idle`.
- After `maxDuration` elapses (advance fake timer), the recording stops automatically and transitions to `preview`.
- `onRecordingReady` callback is called with the blob, a filename string, and a mimeType string.
- State machine ignores invalid transitions (e.g., `stopRecording()` in `idle` state).

**No E2E voice tests.** Real audio recording requires browser automation (Playwright/Cypress) with microphone access, which is outside the current test infrastructure. Voice recording is marked as browser-manual-test only in the CI plan.

---

## 8. Phase 5 — Test Suite Extensions

**Goal:** Extend the test suite to cover all new code paths introduced in Phases 1–4. This phase is not a separate deployment; it is a continuous obligation tracked as a checklist item at the end of each prior phase. This section consolidates the test requirements from all phases and adds the end-to-end suite that runs against a live database.

**Duration:** Ongoing, distributed across Phases 1–4.

---

### 8.1 End-to-End Suite (Phase 6 from Test Coverage Plan)

The E2E tests defined in the Test Coverage Plan (`__tests__/e2e/`) require a live MongoDB connection and are the last to be written. Once the database-touching logic in Phases 1–3 is stable, implement:

**`auth.e2e.test.js`** (per Test Coverage Plan §9.1, extended for Phase 1):
- Standard registration/login flows.
- `GET /auth/me` returns correct profile after registration.
- `PUT /auth/profile` persists changes to MongoDB.
- Case-insensitive uniqueness for usernames.

**`messaging.e2e.test.js`** (per Test Coverage Plan §9.2, extended for Phases 1–3):
- Global and private message flows with real MongoDB persistence.
- `senderDisplayName` on persisted messages matches the user's `displayName` at send time.
- File attachment URL is persisted in the `attachment` subdocument.
- History endpoints return messages with attachment fields when present.
- History limits (100 global, 50 private) enforced against a seeded database.

### 8.2 Coverage Thresholds After All Phases

Add new directories to the coverage configuration as they are created:

| New Directory / File | Target Statement Coverage |
|---|---|
| `config/cloudinary.js` | 70% |
| `middleware/upload.js` | 95% |
| `routes/messages.js` (upload endpoint) | 90% |
| `public/js/modules/recorder.js` | 80% |

---

## 9. Cross-Phase Concerns

### Backward Compatibility

Every socket event payload change in this plan is additive. New fields (`attachment`, `avatarUrl`, `displayName`) are optional. The client must handle message objects that lack these fields without throwing. The `online_users` event shape change (Phase 1, string array → object array) is the only non-additive change; it is managed with a client-side format detection guard.

### JWT and Dynamic Profiles

The existing JWT payload contains only `{ id, username }` (see `routes/auth.js:156-158`). The plan does **not** embed `displayName`, `avatarUrl`, or any other profile field in the JWT. This is intentional:

- Profile data is fetched dynamically via `GET /auth/me` after login and after session restore.
- The `profile_updated` socket event pushes profile changes to connected clients without requiring a token reissue.
- Embedding mutable fields (like `displayName`) in JWTs would require reissuing tokens on every profile change, adding complexity with no benefit — JWTs are not the source of truth for display data.

The client must always treat the JWT as an identity credential only, and fetch display data from the profile endpoint. This design keeps the JWT small (fits in a URL header) and avoids stale display name issues during the 24-hour token lifetime.

### Error Handling

All three new REST endpoints (`GET /auth/me`, `PUT /auth/profile`, `POST /messages/upload`) must return structured error responses:

```json
{ "error": "Human-readable description" }
```

Cloudinary failures (network error, quota exceeded) should be caught and return HTTP 500 with a generic message. The raw Cloudinary error must not be forwarded to the client.

### Logging

**Note:** The codebase already uses Winston with structured JSON output (`utils/logger.js` uses `winston` with `format.json()`). No logging library migration is needed. The recommendation to adopt pino (from the original design document) is superseded.

However, during Phase 2 and Phase 3, ensure that new code paths (Cloudinary uploads, multer rejections, profile updates) use the existing `utils/logger` with proper structured fields. Add the following logging events:

| Event | Location | Fields |
|---|---|---|
| `upload_start` | `POST /messages/upload` | `username`, `filename`, `size`, `mimetype` |
| `upload_success` | `POST /messages/upload` | `username`, `cloudinary_public_id`, `duration_ms` |
| `upload_failure` | `POST /messages/upload` | `username`, `error`, `mimetype` |
| `avatar_upload` | `PUT /auth/profile` | `username`, `success`, `size` |
| `profile_update` | `PUT /auth/profile` | `username`, `changed_fields: []` |

### New npm Dependencies

Each phase introduces the following npm packages. These should be tracked in `package.json` as they are added:

| Phase | Package | Type | Purpose |
|---|---|---|---|
| 2 | `multer` | production | Multipart form parsing for file uploads |
| 2 | `cloudinary` | production | Cloudinary SDK for image/audio/file uploads |
| 3 | (none new) | — | Reuses multer and cloudinary from Phase 2 |

No new npm packages are introduced in Phases 1 or 4.

### Environment Variables

Each phase's new environment variables must be:
1. Added to `config/env.js` validation.
2. Added to `.env.example` with placeholder values.
3. Added as CI secrets for the affected environments.

| Phase | New Variable | Required in Production |
|---|---|---|
| 2 | `CLOUDINARY_URL` | Yes |

### Database Migrations

MongoDB with Mongoose does not require formal migrations for additive schema changes (new optional fields). Existing documents simply lack the new fields; Mongoose populates them with default values on subsequent reads. Ensure all new fields have explicit defaults in the schema so that queries against older documents do not return `undefined`.

### Deployment Considerations

The ephemeral filesystem on Railway (and similar PaaS platforms) means that `multer`'s memory storage strategy must be used throughout. Any code path that writes to the local filesystem for uploaded files will silently fail on redeploy. `middleware/upload.js` is configured with `memoryStorage()` for this reason, and this must not be changed.

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cloudinary free tier quota exceeded by upload volume | Medium | Medium | Set a per-user upload quota enforced at the route level; monitor Cloudinary dashboard. Add quota error handling that returns HTTP 429 with a clear message. |
| `MediaRecorder` API not supported on target browsers | Low | Medium | The `getSupportedMimeType()` function in `recorder.js` tests all candidate types at runtime. If none are supported, the record button is hidden entirely rather than shown as broken. |
| Large audio files causing memory pressure on the server | Low | High | The 10 MB audio size limit reduces this risk. `multer` memory storage holds the buffer for the duration of a single request, not persistently. Node.js memory monitoring should be added to server observability. |
| Rolling deploy during `online_users` event format change | Medium | Low | The client handles both old (string array) and new (object array) formats with a runtime type check: `if (typeof users[0] === 'string')`. This guard can be removed after all clients have updated. |
| Phase 1 `displayName` in `senderDisplayName` creates read-repair complexity | Low | Low | `senderDisplayName` is write-time-denormalized. No read-repair is needed. Historical messages simply show the name at time of send. Document this clearly in code comments. |
| bcrypt request cost scaling with profile update endpoint | Low | Low | `PUT /auth/profile` does not involve password hashing. bcrypt is only called in the auth routes. |
| Cloudinary public IDs derived from username allow enumeration of avatars | Medium | Low | Avatar Cloudinary IDs use the pattern `user_<username>`. Since usernames are already public in the chat, this adds no new enumeration surface. If private avatars are required in future, use random UUIDs as public IDs. |

---

## 11. Dependency Map

```
Pre-Phase
  └── Phase 1 (Profiles — no infra deps)
        └── Phase 2 (Avatars — adds Cloudinary + multer)
              └── Phase 3 (File Attachments — reuses Phase 2 infra)
                    └── Phase 4 (Voice Messages — reuses Phase 3 upload endpoint)

Phase 5 (Tests — parallel to all phases, gates each phase's completion)
```

A phase may not be deployed to production until:
1. All prior phases in the chain are complete.
2. The test requirements for that phase (as defined in this document) are implemented and passing.
3. Coverage thresholds continue to be met globally.

---

## 12. Definition of Done

A phase is **Done** when all of the following are true:

**Functionality:**
- All new endpoints, socket events, and UI interactions described in the phase specification work correctly.
- All changes are backward-compatible: existing features continue to work without modification.
- All new environment variables are documented in `.env.example` and validated in `config/env.js`.

**Testing:**
- All new unit tests specified in the phase's test requirements section are implemented and passing.
- All new integration tests specified in the phase's test requirements section are implemented and passing.
- Coverage thresholds for all modified directories continue to be met.
- `npm run test:ci` passes with zero failures and zero threshold violations.

**Security:**
- All new REST endpoints are protected by `middleware/auth.js` (JWT required).
- All new upload endpoints enforce MIME type allowlisting and file size limits.
- No raw third-party error messages (Cloudinary, Mongoose) are forwarded to the client.
- All new fields on User and Message schemas have explicit validation rules.

**Operations:**
- New environment variables are set in all deployment environments (staging, production).
- Cloud service quota limits are reviewed and alerting is configured.
- Any breaking changes to client/server contracts are handled with a compatibility shim or coordinated deployment.

**Documentation:**
- This plan document is updated with any deviations or decisions made during implementation.
- The `README.md` roadmap section is updated to reflect delivered phases (check off completed items, add remaining phases).
- Inline code comments explain non-obvious design decisions (e.g., the `senderDisplayName` denormalization rationale, the `online_users` backward-compatibility guard).

---

*End of Document*
