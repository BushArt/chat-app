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
```

- Get your `MONGO_URI` from MongoDB Atlas → Connect → Drivers
- `JWT_SECRET` can be any long random string — it signs your login tokens. Keep it secret and don't change it once users are live or all existing tokens will break.

**4. Start the server**
```bash
node server.js
```

**5. Open the app**

Visit `http://localhost:3000` in your browser.

> **Tip:** Install `nodemon` for auto-restart on file changes during development:
> ```bash
> npm install -g nodemon
> nodemon server.js
> ```

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
| GET | `/messages/global` | Fetch global chat history |
| GET | `/messages/:user1/:user2` | Fetch private message history between two users |

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

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing login tokens |
| `PORT` | Port the server runs on (default: 3000) |

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
- [ ] Read receipts
- [ ] Group chats
- [ ] Image sharing

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