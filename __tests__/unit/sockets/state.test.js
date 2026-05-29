// Mock User model before requiring state.js, since getOnlineList() now queries the DB
jest.mock("../../../models/User", () => ({
  find: jest.fn().mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve([])
    })
  })
}));

const state = require("../../../sockets/state");

// Grab live references so we can reset between tests
const { onlineUsers, typingTimeouts } = state;

const User = require("../../../models/User");

beforeEach(() => {
  onlineUsers.clear();
  typingTimeouts.clear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("constants", () => {
  test("MAX_TYPING_ENTRIES equals 10000", () => {
    expect(state.MAX_TYPING_ENTRIES).toBe(10000);
  });

  test("TYPING_TIMEOUT equals 4000", () => {
    expect(state.TYPING_TIMEOUT).toBe(4000);
  });

  test("MAX_MESSAGE_LENGTH equals 1000", () => {
    expect(state.MAX_MESSAGE_LENGTH).toBe(1000);
  });

  test("all constants are numbers, not strings", () => {
    expect(typeof state.MAX_TYPING_ENTRIES).toBe("number");
    expect(typeof state.TYPING_TIMEOUT).toBe("number");
    expect(typeof state.MAX_MESSAGE_LENGTH).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// onlineUsers Map
// ---------------------------------------------------------------------------
describe("onlineUsers Map", () => {
  test("starts empty", () => {
    expect(onlineUsers.size).toBe(0);
  });

  test("supports set and get operations", () => {
    onlineUsers.set("alice", 1);
    expect(onlineUsers.get("alice")).toBe(1);
  });

  test("supports has", () => {
    onlineUsers.set("bob", 2);
    expect(onlineUsers.has("bob")).toBe(true);
    expect(onlineUsers.has("carol")).toBe(false);
  });

  test("supports delete", () => {
    onlineUsers.set("alice", 1);
    onlineUsers.delete("alice");
    expect(onlineUsers.has("alice")).toBe(false);
  });

  test("holds connection count (multi-tab)", () => {
    onlineUsers.set("alice", 2);
    expect(onlineUsers.get("alice")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getOnlineList
// ---------------------------------------------------------------------------
describe("getOnlineList", () => {
  test("returns empty array when onlineUsers is empty", async () => {
    const list = await state.getOnlineList();
    expect(list).toEqual([]);
  });

  test("returns array of profile objects when one user is online", async () => {
    User.find.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { username: "alice", displayName: "Alice", status: "online" }
        ])
      })
    });
    onlineUsers.set("alice", 1);
    const list = await state.getOnlineList();
    expect(list).toHaveLength(1);
    expect(list[0]).toHaveProperty("username", "alice");
    expect(list[0]).toHaveProperty("displayName", "Alice");
    expect(list[0]).toHaveProperty("status", "online");
  });

  test("returns profile objects for multiple users", async () => {
    User.find.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { username: "alice", displayName: "Alice", status: "online" },
          { username: "bob", displayName: "Bob", status: "away" }
        ])
      })
    });
    onlineUsers.set("alice", 1);
    onlineUsers.set("bob", 2);
    const list = await state.getOnlineList();
    expect(list).toHaveLength(2);
    expect(list.find(u => u.username === "bob").status).toBe("away");
  });

  test("falls back to username string array when DB query fails", async () => {
    User.find.mockImplementation(() => {
      throw new Error("DB error");
    });
    onlineUsers.set("alice", 1);
    onlineUsers.set("bob", 2);
    const list = await state.getOnlineList();
    // Fallback returns username strings
    expect(list).toEqual(["alice", "bob"]);
  });

  test("returns an Array (not a Map or Iterator)", async () => {
    onlineUsers.set("alice", 1);
    const list = await state.getOnlineList();
    expect(Array.isArray(list)).toBe(true);
  });

  test("does not mutate the onlineUsers Map", async () => {
    onlineUsers.set("alice", 1);
    const beforeSize = onlineUsers.size;
    await state.getOnlineList();
    expect(onlineUsers.size).toBe(beforeSize);
    expect(onlineUsers.get("alice")).toBe(1);
  });

  test("returned array length equals onlineUsers.size when DB succeeds", async () => {
    User.find.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { username: "alice", displayName: "Alice", status: "online" },
          { username: "bob", displayName: "Bob", status: "online" }
        ])
      })
    });
    onlineUsers.set("alice", 1);
    onlineUsers.set("bob", 2);
    const list = await state.getOnlineList();
    expect(list.length).toBe(onlineUsers.size);
  });
});

// ---------------------------------------------------------------------------
// typingTimeouts Map
// ---------------------------------------------------------------------------
describe("typingTimeouts Map", () => {
  test("starts empty", () => {
    expect(typingTimeouts.size).toBe(0);
  });

  test("keys of the form 'username:room' can be set and retrieved", () => {
    const timeoutId = setTimeout(() => {}, 1000);
    typingTimeouts.set("alice:global", timeoutId);
    expect(typingTimeouts.has("alice:global")).toBe(true);
    expect(typingTimeouts.get("alice:global")).toBe(timeoutId);
    clearTimeout(timeoutId);
  });

  test("supports deletion of entries", () => {
    const timeoutId = setTimeout(() => {}, 1000);
    typingTimeouts.set("bob:room1", timeoutId);
    typingTimeouts.delete("bob:room1");
    expect(typingTimeouts.has("bob:room1")).toBe(false);
    clearTimeout(timeoutId);
  });
});