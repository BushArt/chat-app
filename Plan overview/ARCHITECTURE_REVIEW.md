# Chat App Architecture Review

## Overview

This repository is a Node.js chat application using Express, Socket.IO, MongoDB, and a minimal browser client. It has separate server and client code, JWT-based authentication, global and private messaging, real-time presence/typing, user profiles with avatars, file attachments, and voice message recording.

**Current version:** 1.0.0 (all Phase 1–4 features implemented, Phase 5 test coverage at 86.64% statements)

---

## Project Structure

- `app.js` — Express app setup, middleware, static files, routes, and Socket.IO attachment
- `server.js` — database startup and HTTP server listen logic
- `config/` — environment validation, database configuration, Cloudinary SDK setup
- `middleware/` — reusable request-level middleware (auth, security, rate limiting, upload, error handling)
- `models/` — Mongoose schemas for `User` and `Message`
- `routes/` — REST API endpoints for auth (with profiles/avatars) and messages (with file uploads)
- `sockets/` — Socket.IO connection handling and realtime chat handlers
- `public/` — static frontend (HTML, CSS, and ES module client JS)
- `utils/` — shared utilities (logging, error classes, socket error helpers)
- `__tests__/` — unit, client, integration, and end-to-end test suites

---

## Backend Architecture

### Entry points

- `server.js`
  - Connects to the database via `connectDatabase()` from `app.js`
  - Starts the HTTP server on `process.env.PORT || 3000`
  - Logs server startup via `utils/logger`

- `app.js`
  - Configures Express middleware and static file serving
  - Creates an HTTP server and Socket.IO server instance
  - Loads socket handlers from `./sockets`
  - Mounts route handlers:
    - `/auth` -> `routes/auth.js`
    - `/messages` -> `routes/messages.js`
  - Mounts global error handler from `middleware/errorHandler.js`
  - Provides a lightweight health route: `/ping`

### Configuration

- `config/env.js` — required at startup before any server code runs. Validates required environment variables and exits on failure. Exports `allowedOrigin`, `MAX_VOICE_SIZE`.
- `config/cloudinary.js` — Cloudinary v2 SDK configuration. Reads `CLOUDINARY_URL` from environment. Exports `uploadToCloudinary(buffer, options)` helper.
- `config/db.js` — Mongoose connection with retry logic.
- Express static assets are served from `public` with a `1d` cache lifetime.
- CORS is configured to allow `allowedOrigin` from env.

### Middleware

- `middleware/security.js` — applies security headers (helmet, CSP, CORS, HSTS) for each response.
- `middleware/rateLimiter.js` — generic in-memory rate limiter factory used by APIs and socket handlers.
- `middleware/auth.js` — JWT verification middleware. Validates Bearer token, checks `lastLogout` timestamp for token revocation. Used on all protected routes.
- `middleware/upload.js` — multer configuration with memory storage. Exports `avatarUpload` (5MB, images only) and `attachmentUpload` (25MB, images/PDF/audio/text/zip).
- `middleware/errorHandler.js` — global Express error handler. Converts `HttpError` instances to JSON responses, handles multer errors, and logs unexpected errors.

### Auth and user flows

- `routes/auth.js`
  - `POST /auth/register`
    - Validates username (1-30 chars, Unicode-aware regex including CJK) and password (6-128 chars)
    - Uses bcrypt for password hashing (configurable rounds via `BCRYPT_ROUNDS`)
    - Prevents duplicate usernames via case-insensitive lookup
    - Returns profile object with JWT token
  - `POST /auth/login`
    - Verifies credentials and issues a JWT valid for 24 hours
    - Uses vague error messages to prevent username enumeration
    - Returns profile object with JWT token
  - `POST /auth/logout` — sets `lastLogout` timestamp to revoke all existing tokens
  - `GET /auth/me` — returns current user's profile (no password)
  - `PUT /auth/profile` — updates displayName, bio, status, avatar. Accepts JSON or multipart/form-data (with avatar file). Rate limited to 20/hour/IP.
  - `authLimiter` applies a 10-attempt limit per IP per 15 minutes
  - `profileLimiter` applies a 20-attempt limit per IP per hour

### Message APIs

- `routes/messages.js`
  - `POST /messages/upload` — uploads file to Cloudinary, returns attachment metadata. Validates MIME type, file size (25MB general, 10MB voice), and authorization. Rate limited to 20/15min/IP.
  - `GET /messages/global` — returns paginated global messages (100 per page). Supports `?before=` cursor parameter.
  - `GET /messages/:user1/:user2` — returns paginated private messages (50 per page). Ensures the requesting user is one of the two participants.
  - Uses per-IP middleware rate limiting via `middleware/rateLimiter`

### Models

- `models/User.js`
  - `username` (String, required, unique) — immutable identifier used in JWT, room names, message records
  - `password` (String, required) — bcrypt hash
  - `displayName` (String, default: username) — mutable display name shown in UI (max 50 codepoints)
  - `bio` (String, default: "") — short status line (max 160 codepoints)
  - `status` (String enum: online/away/busy/offline, default: online) — server-managed on connect/disconnect, user-settable via profile update
  - `avatarUrl` (String, default: null) — Cloudinary URL for profile picture
  - `lastLogout` (Date, default: null) — used for JWT token revocation
  - Pre-save hook: sets `displayName` to `username` if not provided

- `models/Message.js`
  - `sender` (String, required) — username of sender
  - `receiver` (String, default: null) — null means global message
  - `message` (String, conditionally required) — can be empty if attachment is present
  - `isGlobal` (Boolean, default: false)
  - `clientId` (String, default: null) — for optimistic message resolution
  - `senderDisplayName` (String, default: "") — denormalized at write time from User.displayName
  - `attachment` (subdocument, default: null) — type/filename/url/mimetype/size
  - Indexes: `{ isGlobal: 1, createdAt: 1 }`, `{ sender: 1, receiver: 1, createdAt: 1 }`

### Socket architecture

- `sockets/index.js`
  - Uses Socket.IO middleware to authenticate socket connections via JWT stored in `handshake.auth.token`
  - Checks `lastLogout` for token revocation during socket auth
  - Tracks online user counts in `sockets/state.js`
  - Automatically joins every connection to the `global` room
  - Emits online user list updates after client handlers are registered
  - Creates event handlers for presence, typing, global messages, private messages, and sync

- `sockets/state.js`
  - Holds shared socket state objects: `onlineUsers`, `typingTimeouts`, `socketUsernames`
  - Exports constants like `MAX_MESSAGE_LENGTH`

- `sockets/handlers/presence.js`
  - Handles `join_room` requests and disconnect cleanup
  - Validates room IDs and enforces room membership rules for private conversations
  - Broadcasts `online_users` event with profile metadata (username, displayName, status, avatarUrl)

- `sockets/handlers/globalMessage.js`
  - Validates and sanitizes messages (max 1000 chars)
  - Validates attachment structure if present
  - Saves global messages to MongoDB with `senderDisplayName`
  - Emits `receive_global_message` to the `global` room
  - Sends ack callbacks when available

- `sockets/handlers/privateMessage.js`
  - Validates sender, receiver, and room structure
  - Ensures private room names follow a deterministic sorted pattern (`user1:user2`)
  - Validates attachment structure if present
  - Saves private messages and emits `receive_message` to the private room

- `sockets/handlers/sync.js`
  - Handles reconnection sync — client sends `lastSeenAt` timestamp
  - Returns missed messages since that timestamp
  - Supports both global and private sync
  - Rate limited per connection

- `sockets/handlers/typing.js`
  - Handles `start_typing` and `stop_typing` events
  - Debounces typing indicators (300ms)
  - Auto-clears typing after 3 seconds of inactivity

### Utils

- `utils/HttpError.js` — custom error class with `message`, `statusCode`, and `errorCode` properties
- `utils/logger.js` — winston logger with JSON format, console transport, and structured event logging
- `utils/socketError.js` — helper to emit error events to socket clients with consistent format

---

## Frontend Architecture

### Client modules

- `public/js/app.js`
  - Application entry point — wires DOM events, auth flows, socket connection
  - Handles login, register, logout, session restore
  - Manages global and private message sending (text + attachments + voice)
  - Integrates recorder module for voice messages

- `public/js/modules/api.js`
  - REST API client — fetch wrappers for all endpoints
  - `register()`, `login()`, `fetchProfile()`, `updateProfile(fields, avatarFile)`
  - `fetchGlobalHistory(before)`, `fetchPrivateHistory(user1, user2, before)`
  - `uploadAttachment(file, room, receiver, isGlobal)` — with client-side MIME and size validation

- `public/js/modules/state.js`
  - Tracks UI state: currentUser, currentRoom, activeTab, unreadCounts, sendingStatus
  - Manages typing users, optimistic messages, message buffer (LRU eviction)
  - Profile state: currentDisplayName, currentBio, currentStatus, currentAvatarUrl
  - Online users map (username → {displayName, status, avatarUrl})
  - Feature flags: darkMode, optimisticSend, jumpToLatest

- `public/js/modules/socket.js`
  - Wraps Socket.IO client with JWT auth
  - Event listeners: receive_global_message, receive_message, user_typing, user_stopped_typing, error_message, online_users, profile_updated, connect, disconnect, connect_error, reconnect
  - Exported emit functions: connect, disconnect, emitStartTyping, emitStopTyping, emitJoinRoom, emitSendGlobalMessage, emitSendPrivateMessage
  - Reconnect handling: emits `sync` with lastSeenAt from DOM

- `public/js/modules/ui.js`
  - DOM manipulation and rendering
  - Message bubbles with avatars, attachments, copy button
  - Online user list with status dots and avatar thumbnails
  - Profile panel (view + edit mode) with avatar preview
  - Attachment preview (file icon + filename + remove button)
  - Voice recording UI (record button states, preview player, send/discard)
  - Character counter, typing indicators, tab switching
  - Date separators, jump-to-latest button, scroll pagination

- `public/js/modules/recorder.js`
  - MediaRecorder API wrapper with state machine (idle → requesting → recording → preview → sending → idle)
  - Auto-detects supported MIME type (webm/mp4/ogg)
  - 120-second max duration with auto-stop
  - Exports: startRecording, stopRecording, discardRecording, getState, onStateChange

- `public/js/modules/optimistic.js`
  - Optimistic message sending — renders pending message immediately
  - Resolves pending messages when server confirms (via clientId matching)
  - Timeout handling for failed sends

- `public/js/modules/utils.js`
  - Shared utilities: time formatting (relative/exact), date labels
  - Scroll helpers: scrollToBottom, maybeScrollToBottom, isNearBottom
  - autoResize for textareas, tryCopyText, safeLocalStorageGet/Set

### Client behavior

- **Optimistic messaging:** Messages render immediately with pending state, resolved when server confirms via clientId.
- **Message buffering:** Private messages for off-screen rooms are buffered with LRU eviction (max 10 rooms).
- **Session restore:** On page load, restores JWT from localStorage, fetches profile, reconnects socket.
- **Stale connection handling:** Detects disconnect, shows banner, auto-reconnects and syncs missed messages.

---

## Key Patterns and Strengths

- **Clear separation of concerns:**
  - `app.js` for server setup
  - `routes/` for REST API
  - `sockets/` for realtime behavior
  - `public/js/modules/` for client logic
- **Consistent JWT auth** for both REST and WebSocket connections
- **Token revocation** via `lastLogout` timestamp check
- **Strong validation and sanitization** on the backend
- **Multi-layer rate limiting:** auth (10/15min), profile (20/hr), uploads (20/15min), socket messages (per-connection)
- **Cloudinary integration** for all file storage (avatars, attachments, voice)
- **Memory storage** for multer (Railway ephemeral filesystem compatibility)
- **Write-time denormalization** of `senderDisplayName` (no read-repair needed)
- **Backward-compatible socket events:** `online_users` handles both string[] and object[] formats
- **Client-side pre-validation** of file MIME types and sizes before upload
- **Structured error handling:** `HttpError` class with machine-readable error codes
- **Comprehensive test coverage:** unit, integration, and E2E suites with 86.64% statement coverage

---

## Potential Technical Constraints

- **In-memory state:** Socket state (online users, typing, rate limiters) is stored in memory. Horizontal scaling requires Redis adapter for Socket.IO and shared presence state.
- **Private room naming:** Room membership is enforced by deterministic sorted username pattern (`user1:user2`), but depends on client requesting correct room name.
- **Browser globals:** Client uses browser globals and DOM module coupling, making future refactors to a SPA framework more involved.
- **Cloudinary public URLs:** Attachment URLs are publicly accessible. Private attachment URLs would require signed URLs with expiry.
- **No per-user storage quota:** Rate limiting exists per-request, but no cumulative daily/total upload quota per user.
- **Ephemeral filesystem:** Railway deployment means no local file persistence. All uploads go to Cloudinary.

---

## Test Infrastructure

- **Framework:** Jest with projects for server (node), server-sockets (node, serial), client (jsdom), and e2e (node with MongoDB or in-memory fallback)
- **Test suites:**
  - `__tests__/unit/` — server-side unit tests (models, middleware, routes, sockets, config, utils)
  - `__tests__/unit/public/` — client module unit tests (state, ui, api, recorder, socket)
  - `__tests__/client/` — client integration and behavioral regression tests (`app.integration.test.js`, `ui.behavior.test.js`, `visual.regressions.test.js`)
  - `__tests__/integration/routes/` — auth route tests (mocked User) and `auth.routes.db.test.js` (real MongoDB via mongodb-memory-server)
  - `__tests__/integration/sockets/` — socket.io integration (serial `server-sockets` project, `maxWorkers: 1`)
  - `__tests__/e2e/` — end-to-end tests; uses `TEST_MONGO_URI` when set, otherwise `mongodb-memory-server` via `__tests__/e2e/mongoMemory.js`
  - `__tests__/browser/` — Playwright browser smoke tests (real DOM/CSS rendering)
- **Coverage thresholds:** 80% statements, 75% branches, 80% functions, 80% lines (global)
- **Per-directory thresholds:** cloudinary.js (70%), upload.js (95%), recorder.js (80%)
- **Scripts:**
  - `npm test` — server + client, then server-sockets in band
  - `npm run test:watch` — Jest watch mode
  - `npm run test:coverage` — coverage for all Jest projects
  - `npm run test:e2e` — E2E suite only
  - `npm run test:regressions` — visual + behavioral UI defect regressions
  - `npm run test:browser` — Playwright smoke tests
  - `npm run test:ci` — full CI pipeline (coverage + E2E)
- **CI:** GitHub Actions workflow (`.github/workflows/test.yml`) runs `test:ci` and a parallel `browser` job for Playwright; `TEST_MONGO_URI` secret is optional when memory-server fallback is used

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Always | Secret key for signing JWT tokens |
| `MONGO_URI` | Production/dev | MongoDB connection string |
| `TEST_MONGO_URI` | E2E testing (optional) | Separate test database; E2E falls back to mongodb-memory-server when unset |
| `CLOUDINARY_URL` | Production | Cloudinary API URL for file storage |
| `CLIENT_ORIGIN` | Production | Allowed CORS origin |
| `BCRYPT_ROUNDS` | Optional | bcrypt hashing rounds (default: 10) |
| `PORT` | Optional | Server port (default: 3000) |

---

## Suggested File for Ongoing Notes

This document is intended as the landing page for architecture findings. Future feature proposals can be added below or in a companion planning file.

## Next Step

Add feature proposals here, such as:
- threaded replies / message reactions
- improved search and history navigation
- notifications and mentions
- multi-room/public channels
- end-to-end encryption / message privacy enhancements
- read receipts
- group chats