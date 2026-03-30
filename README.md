#  Chat App

A real-time chat application built with Node.js, Socket.IO, and MongoDB. Users can create accounts, log in, and send instant messages to each other with full message history.

---

## Features

- User registration and login with secure password hashing
- Real-time messaging using WebSockets (no page refresh needed)
- Message history stored in a database and loaded when a chat is opened
- Simple, clean chat UI that works in any modern browser

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Backend | Node.js, Express |
| Real-time | Socket.IO |
| Database | MongoDB (via Mongoose) |
| Auth | bcryptjs (password hashing), JSON Web Tokens |

---

## Project Structure

```
chat-app/
├── server.js           # Main server file — starts everything
├── .env                # Secret config values (never commit this)
├── models/
│   ├── User.js         # Database blueprint for users
│   └── Message.js      # Database blueprint for messages
├── routes/
│   └── auth.js         # Register and login routes
└── public/
    └── index.html      # Frontend — the entire chat UI
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

Create a file called `.env` in the root folder with the following:
```
MONGO_URI=mongodb+srv://yourname:yourpassword@cluster0.xxxxx.mongodb.net/chatapp
JWT_SECRET=replacethiswithanyverylongrandomstring
PORT=3000
```

- Get your `MONGO_URI` from MongoDB Atlas → Connect → Connect your application
- `JWT_SECRET` can be any long random string — it signs your login tokens

**4. Start the server**
```bash
node server.js
```

**5. Open the app**

Visit `http://localhost:3000` in your browser.

---

## How to Use

1. Open the app and click **Create Account** to register
2. Log in with your username and password
3. Type another user's username in the **Chat with:** field and click **Open Chat**
4. Start messaging — open a second browser window logged in as another user to test real-time

---

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create a new user account |
| POST | `/auth/login` | Log in and receive a JWT token |
| GET | `/messages/:user1/:user2` | Fetch message history between two users |

---

## How Real-Time Works

This app uses **Socket.IO** to maintain a persistent connection between the browser and server. When you send a message:

1. Your browser emits a `send_message` event to the server
2. The server saves the message to MongoDB
3. The server immediately emits `receive_message` to everyone in the chat room
4. Both users' screens update instantly — no refresh required

---

## Environment Variables

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing login tokens |
| `PORT` | Port the server runs on (default: 3000) |

> ⚠️ Never commit your `.env` file. It is listed in `.gitignore` and should stay there.

---

## Roadmap

- [ ] Typing indicators
- [ ] Online / offline status
- [ ] Group chats
- [ ] Image sharing
- [ ] Deploy to the internet

---

## Contributing

All changes must go through a Pull Request. Nobody pushes directly to main.

**One feature per branch. One branch at a time.**

### Steps

**1. Get the latest code**
```bash
git checkout main
git pull origin main
```

**2. Create a branch**
```bash
git checkout -b yourname/what-youre-building
```
Example: `maria/login-page`, `john/fix-chat-bug`

**3. Do your work, then commit**
```bash
git add .
git commit -m "describe what you did"
```

**4. Push and open a Pull Request**
```bash
git push origin yourname/what-youre-building
```
Then go to GitHub → click **Compare & pull request** → submit it.

**5. Wait for approval — never merge your own PR**


## License
 
MIT