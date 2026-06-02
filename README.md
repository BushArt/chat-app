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
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Node.js, Express |
| Real-time | Socket.IO |
| Database | MongoDB (via Mongoose) |
| Auth | bcryptjs (password hashing), JSON Web Tokens, localStorage |
| Security | express-rate-limit |
| Hosting | Railway |
| Database Host | MongoDB Atlas |
| Version Control | GitHub |

---

## Project Structure

```
chat-app/
├── server.js              # Main server file — starts everything
├── app.js                 # Express app setup — middleware, routes, error handling
├── .env                   # Secret config values (never commit this)
├── babel.config.json      # Babel configuration for ES module support in tests
├── config/
│   ├── db.js              # MongoDB connection setup
│   └── env.js             # Environment variable validation and access
├── middleware/
│   ├── auth.js            # JWT verification middleware for routes
│   ├── rateLimiter.js     # Rate limiting config for auth routes
│   └── security.js        # Additional security middleware (helmet, cors, etc.)
├── models/
│   ├── User.js            # Database schema for users
│   └── Message.js         # Database schema for messages
├── routes/
│   ├── auth.js            # Register and login routes with rate limiting
│   └── messages.js        # Message retrieval routes (global + private history)
├── sockets/
│   ├── index.js           # Socket.IO server setup and event wiring
│   ├── state.js           # In-memory state: online users, socket maps
│   └── handlers/
│       └── ...            # Individual event handlers (message, typing, etc.)
├── utils/
│   └── logger.js          # Custom logger utility
├── public/
│   ├── index.html         # Frontend — the entire chat UI
│   ├── css/
│   │   └── ...            # Stylesheets
│   └── js/
│       └── ...            # Client-side JavaScript
└── __tests__/
    ├── unit/              # Unit tests
    ├── integration/       # Integration tests
    └── e2e/               # End-to-end tests
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
| `invalid_room` | Room name does not follow `user1_user2` format | 400 |
| `invalid_peer` | Cannot sync private messages with yourself | 400 |
| `global_message_failed` | Server error while sending a global message | 500 |
| `private_message_failed` | Server error while sending a private message | 500 |
| `global_sync_failed` | Server error during global sync | 500 |
| `private_sync_failed` | Server error during private sync | 500 |
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
- Login errors use a vague message (`"Invalid username or password"`) to prevent username enumeration
- Socket messages are validated server-side — sender identity comes from the verified socket session, not client data
- Messages are capped at 1000 characters
- All message content is rendered with `textContent` (not `innerHTML`) to prevent XSS
- HTTP and Socket auth both require JWT; invalid/expired tokens are rejected

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