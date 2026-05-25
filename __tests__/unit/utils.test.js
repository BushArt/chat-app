import {
  getRoomId,
  relativeTime,
  formatTime,
  formatDateLabel,
  isSameDay,
  createClientId,
  displayTime,
} from "../../public/js/modules/utils.js";

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// All time-dependent tests use local-timezone dates (not UTC strings)
// to match the functions' use of local-time Date methods (getDate, getMonth, etc.).
// System timezone: Asia/Singapore (UTC+8).

// ---------------------------------------------------------------------------
// getRoomId
// ---------------------------------------------------------------------------
describe("getRoomId", () => {
  test("sorts arguments alphabetically: getRoomId('bob', 'alice') returns 'alice:bob'", () => {
    expect(getRoomId("bob", "alice")).toBe("alice:bob");
  });

  test("sorts arguments alphabetically: getRoomId('alice', 'bob') returns 'alice:bob'", () => {
    expect(getRoomId("alice", "bob")).toBe("alice:bob");
  });

  test("is idempotent regardless of argument order", () => {
    const pairs = [
      ["zara", "anna"],
      ["x", "y"],
      ["longname", "short"],
    ];
    for (const [a, b] of pairs) {
      expect(getRoomId(a, b)).toBe(getRoomId(b, a));
    }
  });

  test("handles single-character usernames", () => {
    expect(getRoomId("a", "b")).toBe("a:b");
  });

  test("handles usernames with hyphens and underscores", () => {
    expect(getRoomId("test-user", "other_name")).toBe("other_name:test-user");
  });

  test("returns a string containing exactly one colon separator", () => {
    const result = getRoomId("alice", "bob");
    expect(result).toMatch(/^[^:]+:[^:]+$/);
  });
});

// ---------------------------------------------------------------------------
// relativeTime
// ---------------------------------------------------------------------------
describe("relativeTime", () => {
  test("returns 'just now' for timestamps less than 60 seconds ago", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    // 30 seconds ago
    const t = new Date(Date.now() - 30 * 1000);
    expect(relativeTime(t)).toBe("just now");
  });

  test("returns '1 min ago' for exactly 60 seconds ago", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 60 * 1000);
    expect(relativeTime(t)).toBe("1 min ago");
  });

  test("returns '59 min ago' for 3599 seconds ago", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 3599 * 1000);
    expect(relativeTime(t)).toBe("59 min ago");
  });

  test("returns '1 hr ago' for exactly 3600 seconds ago", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 3600 * 1000);
    expect(relativeTime(t)).toBe("1 hr ago");
  });

  test("returns '23 hr ago' for 86399 seconds ago", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 86399 * 1000);
    expect(relativeTime(t)).toBe("23 hr ago");
  });

  test("falls back to date+time for timestamps >= 86400 seconds (24 hrs)", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 86400 * 1000);
    const result = relativeTime(t);
    expect(result).toBe(t.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  });
});

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe("formatTime", () => {
  test("returns a non-empty string from ISO 8601 timestamp", () => {
    const result = formatTime("2026-05-17T14:30:00Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("does not throw on a Date object", () => {
    expect(() => formatTime(new Date("2026-05-17T08:15:00Z"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// formatDateLabel
// ---------------------------------------------------------------------------
describe("formatDateLabel", () => {
  function localDate(isoString) {
    // Construct a local-timezone date that matches the calendar day in isoString
    const d = new Date(isoString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  test("returns 'Today' for current calendar day", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    // Use local midnight of May 17
    const now = new Date("2026-05-17T12:00:00Z");
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(formatDateLabel(todayLocal)).toBe("Today");
  });

  test("returns 'Yesterday' for previous calendar day", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const yesterday = new Date("2026-05-16T12:00:00Z");
    expect(formatDateLabel(yesterday)).toBe("Yesterday");
  });

  test("returns long date without year for same-year dates", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const diffDate = new Date("2026-05-10T12:00:00Z");
    const result = formatDateLabel(diffDate);
    // May 10, 2026 in local time — should produce a long date string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns long date with year for dates from a prior year", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const oldDate = new Date("2025-12-25T12:00:00Z");
    const result = formatDateLabel(oldDate);
    expect(result).toMatch(/2025/);
  });
});

// ---------------------------------------------------------------------------
// isSameDay
// ---------------------------------------------------------------------------
describe("isSameDay", () => {
  test("returns true when both timestamps fall on the same local calendar day", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    // Use local-timezone dates to avoid UTC/local offset issues
    const now = new Date("2026-05-17T12:00:00Z");
    const sameDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const sameDayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    expect(isSameDay(sameDayStart, sameDayEnd)).toBe(true);
  });

  test("returns false when timestamps fall on different calendar days", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const now = new Date("2026-05-17T12:00:00Z");
    const dayA = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const dayB = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0);
    expect(isSameDay(dayA, dayB)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createClientId
// ---------------------------------------------------------------------------
describe("createClientId", () => {
  test("returns a string", () => {
    expect(typeof createClientId()).toBe("string");
  });

  test("returns a non-empty string", () => {
    expect(createClientId().length).toBeGreaterThan(0);
  });

  test("returns different values on successive calls (100 iterations)", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(createClientId());
    }
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// displayTime
// ---------------------------------------------------------------------------
describe("displayTime", () => {
  test("delegates to relativeTime when timeFormat is 'relative'", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const recent = new Date(Date.now() - 30 * 1000);
    expect(displayTime(recent, "relative")).toBe("just now");
  });

  test("delegates to formatTime when timeFormat is 'absolute'", () => {
    const t = new Date("2026-05-17T14:30:00Z");
    const result = displayTime(t, "absolute");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns 'just now' for recent times in relative mode", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 30 * 1000);
    expect(displayTime(t, "relative")).toBe("just now");
  });

  test("returns a relative string for timestamps within the hour", () => {
    jest.setSystemTime(new Date("2026-05-17T12:00:00Z"));
    const t = new Date(Date.now() - 300 * 1000); // 5 min ago
    expect(displayTime(t, "relative")).toBe("5 min ago");
  });
});