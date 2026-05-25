# Chat App Architecture Review

## Overview

This repository is a Node.js chat application using Express, Socket.IO, MongoDB, and a minimal browser client. It has separate server and client code, JWT-based authentication, global and private messaging, and a real-time presence/typing system.

## Project Structure

- `app.js` — Express app setup, middleware, static files, routes, and Socket.IO attachment
- `server.js` — database startup and HTTP server listen logic
- `config/` — environment and database configuration
- `routes/` — REST API endpoints for auth and messages
- `middleware/` — reusable request-level middleware (auth, security, rate limiting)
- `models/` — Mongoose schemas for `User` and `Message`
- `sockets/` — Socket.IO connection handling and realtime chat handlers
- `public/` — static frontend, including HTML, CSS, and client JS modules
- `utils/` — shared utilities such as logging
- `__tests__/` — unit, integration, and end-to-end test suites

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
  - Provides a lightweight health route: `/ping`

### Configuration
- `config/env.js` is required at startup before any server code runs.
- Express static assets are served from `public` with a `1d` cache lifetime.
- CORS is configured to allow `allowedOrigin` from env.

### Middleware
- `middleware/security.js` applies security headers for each response.
- `middleware/rateLimiter.js` provides a generic in-memory rate limiter used by APIs and socket handlers.
- `middleware/auth.js` protects message routes with JWT validation.

### Auth and user flows
- `routes/auth.js`
  - `POST /auth/register`
    - Validates username and password length
    - Restricts username characters to letters, digits, underscores, hyphens, and CJK ranges
    - Uses bcrypt for password hashing
    - Prevents duplicate usernames via case-insensitive lookup
  - `POST /auth/login`
    - Verifies credentials and issues a JWT valid for 24 hours
    - Uses vague error messages to limit username enumeration
  - `authLimiter` applies a 10-attempt limit per IP per 15 minutes

### Message APIs
- `routes/messages.js`
  - `GET /messages/global`
    - Returns the most recent 100 global messages
  - `GET /messages/:user1/:user2`
    - Returns the most recent 50 private messages for a valid conversation
    - Ensures the requesting user is one of the two participants
  - Uses per-IP middleware rate limiting via `middleware/rateLimiter`

### Socket architecture
- `sockets/index.js`
  - Uses Socket.IO middleware to authenticate socket connections via JWT stored in `handshake.auth.token`
  - Tracks online user counts in `sockets/state.js`
  - Automatically joins every connection to the `global` room
  - Emits online user list updates after client handlers are registered
  - Creates event handlers for presence, typing, global messages, private messages, and sync
- `sockets/state.js`\n  - Holds shared socket state objects: `onlineUsers`, `typingTimeouts`
  - Exports constants like `MAX_MESSAGE_LENGTH`
- `sockets/handlers/presence.js`
  - Handles `join_room` requests and disconnect cleanup
  - Validates room IDs and enforces room membership rules for private conversations
- `sockets/handlers/globalMessage.js`
  - Validates and sanitizes messages
  - Saves global messages to MongoDB
  - Emits `receive_global_message` to the `global` room
  - Sends ack callbacks when available
- `sockets/handlers/privateMessage.js`
  - Validates sender, receiver, and room structure
  - Ensures private room names follow a deterministic sorted pattern
  - Saves private messages and emits `receive_message` to the private room

## Frontend Architecture

### Client socket module
- `public/js/modules/socket.js`
  - Wraps a Socket.IO client instance and manages authentication token attachment
  - Defines listeners for:
    - `receive_global_message`
    - `receive_message`
    - `user_typing`
    - `user_stopped_typing`
    - `error_message`
    - `online_users`
    - `connect` / `disconnect` / `connect_error`
  - Emits events for typing, joining rooms, sending global messages, private messages, and sync
  - Implements reconnect handling by emitting `sync` when reconnected

### Client state module
- `public/js/modules/state.js`
  - Tracks UI state such as current user, room, active tab, unread counts, sending status, typing users, and optimistic messages
  - Provides a buffer for off-screen private messages, with LRU eviction behavior
  - Stores feature flags like `darkMode`, `optimisticSend`, and `jumpToLatest`
  - Supports a full reset when authentication fails or session expires

### Client behavior
- The frontend uses an optimistic messaging approach for global/private sends.
- It renders typing indicators and online user lists in real time.
- The client handles stale connections and expired sessions by resetting local state and forcing re-authentication.

## Key Patterns and Strengths

- Clear separation of concerns:
  - `app.js` for server setup
  - `routes/` for REST API
  - `sockets/` for realtime behavior
  - `public/js/modules/` for client logic
- Consistent use of JWT for both REST and websocket authentication
- Strong validation and sanitization on the backend
- Rate limiting implemented at multiple layers
- Real-time presence and typing support
- Client-side optimistic update strategy and message buffering

## Potential Technical Constraints

- Socket state is stored in memory, so horizontal scaling would require a shared adapter (Redis or another adapter) for Socket.IO and shared presence state.
- Private room membership is enforced by naming conventions, but current design still depends on the client to request the correct room name.
- The client uses browser globals and DOM module coupling, making future refactors to a SPA framework slightly more work.

## Suggested File for Ongoing Notes

This document is intended as the landing page for architecture findings. Future feature proposals can be added below or in a companion planning file.

## Next Step

Add feature proposals here, such as:
- threaded replies / message reactions
- rich media support (images, links, attachments)
- improved search and history navigation
- notifications and mentions
- multi-room/public channels
- end-to-end encryption / message privacy enhancements
