const state = require("../../../sockets/state");

// Grab live references so we can reset between tests
const { onlineUsers, typingTimeouts } = state;

beforeEach(() => {
  onlineUsers.clear();
  typingTimeouts.clear();
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
  test("returns empty array when onlineUsers is empty", () => {
    expect(state.getOnlineList()).toEqual([]);
  });

  test("returns array with username when one user is online", () => {
    onlineUsers.set("alice", 1);
    expect(state.getOnlineList()).toEqual(["alice"]);
  });

  test("returns array of all usernames when multiple users are online", () => {
    onlineUsers.set("alice", 1);
    onlineUsers.set("bob", 2);
    onlineUsers.set("carol", 1);
    const list = state.getOnlineList();
    expect(list).toContain("alice");
    expect(list).toContain("bob");
    expect(list).toContain("carol");
    expect(list.length).toBe(3);
  });

  test("returns an Array (not a Map or Iterator)", () => {
    onlineUsers.set("alice", 1);
    expect(Array.isArray(state.getOnlineList())).toBe(true);
  });

  test("does not mutate the onlineUsers Map", () => {
    onlineUsers.set("alice", 1);
    const beforeSize = onlineUsers.size;
    state.getOnlineList();
    expect(onlineUsers.size).toBe(beforeSize);
    expect(onlineUsers.get("alice")).toBe(1);
  });

  test("returned array length equals onlineUsers.size", () => {
    onlineUsers.set("alice", 1);
    onlineUsers.set("bob", 2);
    expect(state.getOnlineList().length).toBe(onlineUsers.size);
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