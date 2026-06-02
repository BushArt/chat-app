# 💬 Chat App

A real-time chat application built with Node.js, Socket.IO, and MongoDB. Users can create accounts, log in, and send instant messages globally or privately — with full message history and session persistence.

---

## Features

- User registration and login with secure password hashing
- Real-time messaging using WebSockets (no page refresh needed)
- Global chat room and private 1-on-1 messaging
- Message history stored in MongoDB and loaded when a chat is opened
- Session persistence — stay logged in after a page refresh
- Online users sidebar — click a name to open a private chat
- Typing indicators for global and private chats
- Character counter with 1000-character message limit
- Light/dark theme toggle and relative/exact timestamp toggle
- Mobile-responsive layout with scrollable online user list
- Optimistic message sending with pending-state UI
- Rate limiting on auth routes to prevent brute-force attacks
- XSS protection — all message content is safely rendered as plain text
- User profiles with display name, bio, and status (online/away/busy)
- Avatar upload with Cloudinary storage
- File attachments (images, documents, audio) in messages
- Voice message recording directly in the browser
- JWT token revocation on logout
- Cursor-based message pagination

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (ES modules) |
| Backend | Node.js, Express 5 |
| Real-time | Socket.IO |
| Database | MongoDB (via Mongoose) |
| Auth | bcryptjs (password hashing), JSON Web Tokens, localStorage |
| File Storage | Cloudinary (cloud image/audio/file hosting) |
| File Parsing | multer (multipart form handling, memory storage) |
| Logging | winston (structured JSON output) |
| Security | helmet, CORS, express-rate-limit |
| Testing | Jest, supertest, socket.io-client (unit, integration, E2E) |
| Hosting | Railway (ephemeral filesystem) |
| Database Host | MongoDB Atlas |
| Version Control | GitHub |

---

## Project Structure

```
chat-app/
├── server.js              # Main server file — starts everything
├── app.js                 # Express app setup — middleware, routes, error handling
├── .env                   # Secret config values (never commit this)
├── .env.example           # Template with placeholder values (commit this)
├── babel.config.json      # Babel configuration for ES module support in tests
├── package.json           # Dependencies, scripts, Jest configuration
├── config/
│   ├── cloudinary.js      # Cloudinary SDK configuration and upload helper
│   ├── db.js              # MongoDB connection setup
│   └── env.js             # Environment variable validation and access
├── middleware/
│   ├── auth.js            # JWT verification + token revocation check
│   ├── errorHandler.js    # Global Express error handler
│   ├── rateLimiter.js     # Generic in-memory rate limiter factory
│   ├── security.js        # Security headers (helmet, CSP, CORS)
│   └── upload.js          # multer config (avatar 5MB, attachment 25MB, memory storage)
├── models/
│   ├── User.js            # User schema (username, displayName, bio, status, avatarUrl, lastLogout)
│   └── Message.js         # Message schema (sender, receiver, message, attachment, senderDisplayName)
├── routes/
│   ├── auth.js            # Auth routes: register, login, logout, me, profile (with avatar upload)
│   └── messages.js        # Message routes: global/private history (paginated), file upload
├── sockets/
│   ├── index.js           # Socket.IO server setup, JWT auth middleware, handler wiring
│   ├── state.js           # In-memory state: online users, socket maps, typing timeouts
│   └── handlers/
│       ├── globalMessage.js   # Global message validation, persistence, broadcast
│       ├── privateMessage.js  # Private message validation, persistence, broadcast
│       ├── presence.js        # join_room, disconnect, online_users management
│       ├── sync.js            # Reconnection sync (missed messages since lastSeenAt)
│       └── typing.js          # Typing indicator start/stop with debounce
├── utils/
│   ├── HttpError.js       # Custom error class (message, statusCode, errorCode)
│   ├── logger.js          # Winston structured JSON logger
│   └── socketError.js     # Socket error emission helper
├── public/
│   ├── index.html         # Frontend — the entire chat UI
│   ├── css/
│   │   └── style.css      # Stylesheets (light/dark themes, responsive layout)
│   └── js/
│       ├── app.js         # Application entry point, event wiring, auth flows
│       └── modules/
│           ├── api.js     # REST API client (fetch wrappers for all endpoints)
│           ├── optimistic.js  # Optimistic message sending and resolution
│           ├── recorder.js    # MediaRecorder wrapper for voice messages
│           ├── socket.js  # Socket.IO client event handlers and emit wrappers
│           ├── state.js   # Client-side application state management
│           ├── ui.js      # DOM manipulation and rendering
│           └── utils.js   # Shared utilities (time formatting, scroll, copy)
└── __tests__/
    ├── unit/              # Unit tests (server + client)
    ├── client/            # Client-specific unit tests (state, recorder, socket)
    ├── integration/       # Integration tests (routes, sockets with real MongoDB)
    └── e2e/               # End-to-end tests (full server + MongoDB test database)
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v20 or higher
- A free [MongoDB Atlas](https://mongodb.com/atlas) account

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/chat-app.git
cd chat-app
```

**2. Install dependencies**
```bash
npm install
```

**3. Create your `.env` file**

Create a file called `.env` in the root folder:
```
MONGO_URI=mongodb+srv://yourname:yourpassword@cluster0.xxxxx.mongodb.net/chatapp
JWT_SECRET=replacethiswithanyverylongrandomstring
PORT=3000
TEST_MONGO_URI=mongodb+srv://yourname:yourpassword@cluster0.xxxxx.mongodb.net/chatapp_test
```

- Get your `MONGO_URI` from MongoDB Atlas → Connect → Drivers
- `JWT_SECRET` can be any long random string — it signs your login tokens. Keep it secret and don't change it once users are live or all existing tokens will break.
- `TEST_MONGO_URI` is required for end-to-end tests — point it at a **separate** test database. E2E tests will drop and recreate this database, so never use your production database here.

**4. Start the server**
```bash
node server.js
```

> **Tip (Windows only):** If you run into Cloudinary TLS certificate errors (`unable to verify the first certificate`), start the server with:
> ```bash
> NODE_OPTIONS=--use-system-ca node server.js
> ```

> **Tip:** Install `nodemon` for auto-restart on file changes during development:
> ```bash
> npm install -g nodemon
> nodemon server.js
> ```

**5. Open the app**

Visit `http://localhost:3000` in your browser.

### Running Tests

This project uses **Jest** with three test suites:

| Command | What it runs |
|---|---|
| `npm test` | All unit and integration tests (server + client) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage report (80% threshold) |
| `npm run test:e2e` | End-to-end tests (requires `TEST_MONGO_URI` in `.env`) |
| `npm run test:ci` | Full CI pipeline: server + client with coverage, then E2E |

**Coverage thresholds:** 80% statements, 75% branches, 80% functions, 80% lines (global). Per-directory thresholds apply to `config/cloudinary.js` (70%), `middleware/upload.js` (95%), and `public/js/modules/recorder.js` (80%).

---

## How to Use

1. Open the app and click **Create Account** to register
2. Log in — your session is saved so you stay logged in after a refresh
3. Use **Global Chat** to message everyone online
4. Click any name in the online sidebar, or type a username in the **Chat with:** field to open a private chat
5. Use the header controls to switch **Time format** and **Theme** if desired
6. Click **Log Out** to end your session

---

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create a new user account |
| POST | `/auth/login` | Log in and receive a JWT token |
| POST | `/auth/logout` | Log out and revoke all active tokens |
| GET | `/auth/me` | Get the current user's profile (JWT required) |
| PUT | `/auth/profile` | Update profile: displayName, bio, status, avatar (JWT required) |
| GET | `/messages/global` | Fetch global chat history (supports `?before=` pagination) |
| GET | `/messages/:user1/:user2` | Fetch private message history (supports `?before=` pagination) |
| POST | `/messages/upload` | Upload a file attachment (JWT required) |

---

## How Real-Time Works

This app uses **Socket.IO** to maintain a persistent connection between the browser and server. When you send a message:

1. Your browser emits a `send_message` or `send_global_message` event
2. The server validates the sender using the verified socket session (not client-supplied data)
3. The server saves the message to MongoDB
4. The server emits the message to everyone in the relevant room
5. Both users' screens update instantly — no refresh required

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `MONGO_URI` | MongoDB Atlas connection string | Yes |
| `JWT_SECRET` | Secret key for signing login tokens | Yes |
| `PORT` | Port the server runs on (default: 3000) | No |
| `CLOUDINARY_URL` | Cloudinary API URL for avatar/file uploads | Production only |
| `CLIENT_ORIGIN` | Allowed CORS origin (e.g., Railway URL) | Production only |
| `BCRYPT_ROUNDS` | bcrypt hashing rounds (default: 10) | No |
| `TEST_MONGO_URI` | Separate test database for E2E tests | E2E testing only |

> See `.env.example` for a template with placeholder values.

> ⚠️ Never commit your `.env` file. It is listed in `.gitignore` and should stay there.
> On Railway, set these same variables in the **Variables** tab of your service.

---

## Deployment

This app is deployed on **Railway** with **MongoDB Atlas** as the cloud database.

### How it works
- Code is pushed to GitHub
- Railway detects the push and redeploys automatically
- MongoDB Atlas stores all data in the cloud
- Users access the app via the Railway-generated URL

### Deploy your own
1. Push your code to GitHub
2. Sign up at [railway.app](https://railway.app) and create a new project from your repo
3. Add your environment variables in Railway → Variables tab
4. Go to Settings → Networking → Generate Domain
5. Share the URL — no server needed on your machine

---

## Error Handling

All API errors return a consistent JSON shape:

```json
{
  "error": "Human-readable description",
  "code": "machine_readable_code"
}
```

Socket errors are emitted as an `error_message` event with the same payload shape.

### HTTP Error Codes

| Code | Meaning | Typical Status |
|------|---------|---------------|
| `authentication_required` | Missing or malformed Authorization header | 401 |
| `invalid_token` | JWT is expired or malformed | 403 |
| `missing_credentials` | Username or password not provided | 400 |
| `invalid_username` | Username fails validation (length, characters) | 400 |
| `password_too_short` | Password < 6 characters | 400 |
| `password_too_long` | Password > 128 characters | 400 |
| `username_taken` | Username already exists (duplicate) | 400 |
| `invalid_credentials` | Username not found or password mismatch | 400 |
| `forbidden_access` | User is not a participant in the conversation | 403 |
| `rate_limited` | Too many requests in a short window | 429 |
| `jwt_secret_missing` | Server misconfiguration (no JWT_SECRET set) | 500 |
| `registration_failed` | Unexpected error during registration | 500 |
| `login_failed` | Unexpected error during login | 500 |
| `global_messages_fetch_failed` | Could not retrieve global chat history | 500 |
| `private_messages_fetch_failed` | Could not retrieve private message history | 500 |
| `missing_peer_or_room` | Sync request missing required fields | 400 |
| `invalid_room` | Sync: room name does not follow `user1_user2` format | 400 |
| `invalid_peer` | Cannot sync private messages with yourself | 400 |
| `global_message_failed` | Server error while sending a global message | 500 |
| `private_message_failed` | Server error while sending a private message | 500 |
| `global_sync_failed` | Server error during global sync | 500 |
| `private_sync_failed` | Server error during private sync | 500 |
| `token_revoked` | Token issued before user's last logout | 403 |
| `user_not_found` | User does not exist | 404 |
| `invalid_display_name` | Display name fails validation | 400 |
| `invalid_bio` | Bio fails validation (length or HTML) | 400 |
| `invalid_status` | Status is not online/away/busy | 400 |
| `no_fields` | Profile update with no valid fields | 400 |
| `profile_update_failed` | Server error during profile update | 500 |
| `avatar_upload_failed` | Cloudinary avatar upload failed | 500 |
| `no_file` | Upload request with no file attached | 400 |
| `room_required` | Upload request missing room field | 400 |
| `receiver_required` | Private upload missing receiver | 400 |
| `invalid_room` | Upload: room name does not follow `userA:userB` format | 400 |
| `forbidden_upload` | Uploading user is not a participant of the room | 403 |
| `invalid_receiver` | Receiver is not a participant of the room | 400 |
| `self_upload` | User attempted to upload a file to themselves | 400 |
| `voice_size_exceeded` | Audio file exceeds 10MB limit | 400 |
| `upload_failed` | Cloudinary file upload failed | 500 |
| `upload_error` | Server error during upload | 500 |
| `upload_rate_limited` | Too many upload requests | 429 |
| `invalid_pagination_cursor` | Invalid `before` query parameter | 400 |
| `logout_failed` | Server error during logout | 500 |
| `internal_error` | Default fallback code | 500 |

### Usage in Routes

```js
const HttpError = require('../utils/HttpError');

// Inside an async route handler:
if (!user) return next(new HttpError('User not found', 404, 'user_not_found'));

// Or throw — the error handler middleware will catch it:
throw new HttpError('Invalid input', 400, 'invalid_input');
```

### Usage in Socket Handlers

```js
const emitError = require('../../utils/socketError');
const HttpError = require('../../utils/HttpError');

// Inside a socket handler:
if (!valid) emitError(socket, 'error_message', new HttpError('Invalid data', 400, 'invalid_data'));
```

### Creating Custom Errors

```js
new HttpError(message, statusCode, errorCode)
```

- `message` — Human-readable string sent to the client.
- `statusCode` — HTTP status code (default: `500`).
- `errorCode` — Machine-readable string for programmatic handling (default: `'internal_error'`).

---

## Security

- Passwords are hashed with bcrypt before storing — never stored as plain text
- Auth routes are rate limited to 10 requests per IP per 15 minutes
- Profile updates are rate limited to 20 per hour per IP
- File uploads are rate limited to 20 per 15 minutes per IP
- Login errors use a vague message (`"Invalid username or password"`) to prevent username enumeration
- Socket messages are validated server-side — sender identity comes from the verified socket session, not client data
- Messages are capped at 1000 characters
- All message content is rendered with `textContent` (not `innerHTML`) to prevent XSS
- HTTP and Socket auth both require JWT; invalid/expired/revoked tokens are rejected
- JWT tokens are revoked on logout via `lastLogout` timestamp check
- File uploads enforce MIME type allowlisting (images, PDF, audio, text, zip) and size limits (5MB avatars, 25MB attachments, 10MB voice)
- `multer` uses memory storage (not disk) to work with Railway's ephemeral filesystem
- Content-Security-Policy header is set via helmet
- Cloudinary errors are never forwarded to the client — generic error messages are returned instead

---

## Roadmap

- [x] User registration and login
- [x] Global chat
- [x] Private messaging
- [x] Message history
- [x] Online users list
- [x] Session persistence (localStorage)
- [x] Rate limiting
- [x] XSS protection
- [x] Typing indicators
- [x] Dark mode
- [x] Relative/exact time toggle
- [x] Deployed to Railway
- [x] User profiles (display name, bio, status)
- [x] Avatar upload (Cloudinary)
- [x] File attachments (images, documents, audio)
- [x] Voice message recording
- [x] JWT token revocation on logout
- [x] Message pagination
- [x] Comprehensive test suite (unit, integration, E2E)
- [ ] Read receipts
- [ ] Group chats

---

## Contributing

All changes must go through a Pull Request. Nobody pushes directly to main.

**One feature per branch. One branch at a time.**

**1. Get the latest code**
```bash
git checkout main
git pull origin main
```

**2. Create a branch**
```bash
git checkout -b yourname/what-youre-building
```
Example: `maria/typing-indicator`, `john/fix-chat-bug`

**3. Do your work, then commit**
```bash
git add .
git commit -m "describe what you did"
git push origin yourname/what-youre-building
```

**4. Open a Pull Request on GitHub and wait for approval — never merge your own PR**

---

## License

MIT