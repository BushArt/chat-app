const makeRateLimiter = require("../../../middleware/rateLimiter");

describe("makeRateLimiter factory", () => {
  test("returns a function when called", () => {
    const limiter = makeRateLimiter();
    expect(typeof limiter).toBe("function");
  });

  describe("rate limit behavior (10 per 5s window)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("returns true for the first 10 calls", () => {
      const limiter = makeRateLimiter();
      for (let i = 0; i < 10; i++) {
        expect(limiter()).toBe(true);
      }
    });

    test("returns false for the 11th call", () => {
      const limiter = makeRateLimiter();
      for (let i = 0; i < 10; i++) limiter();
      expect(limiter()).toBe(false);
    });

    test("returns false for subsequent calls within the window", () => {
      const limiter = makeRateLimiter();
      for (let i = 0; i < 10; i++) limiter();
      expect(limiter()).toBe(false);
      expect(limiter()).toBe(false);
      expect(limiter()).toBe(false);
    });

    test("resets after the window duration (5000ms) elapses", () => {
      const limiter = makeRateLimiter();
      for (let i = 0; i < 10; i++) limiter();
      expect(limiter()).toBe(false);

      jest.advanceTimersByTime(5000);

      // Should now allow another message
      expect(limiter()).toBe(true);
    });

    test("starts a new window after reset", () => {
      const limiter = makeRateLimiter();
      for (let i = 0; i < 10; i++) limiter();

      jest.advanceTimersByTime(5000);

      expect(limiter()).toBe(true); // first after reset
      for (let i = 0; i < 9; i++) limiter();
      expect(limiter()).toBe(false); // 11th in new window
    });

    test("two independent instances do not share state", () => {
      const limiterA = makeRateLimiter();
      const limiterB = makeRateLimiter();

      // Exhaust limiter A
      for (let i = 0; i < 10; i++) limiterA();
      expect(limiterA()).toBe(false);

      // Limiter B is still fresh
      expect(limiterB()).toBe(true);
      for (let i = 0; i < 9; i++) limiterB();
      expect(limiterB()).toBe(false);
    });
  });

  describe("cleanup", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("returned function has a .cleanup method", () => {
      const limiter = makeRateLimiter();
      expect(typeof limiter.cleanup).toBe("function");
    });

    test(".cleanup clears the internal timer", () => {
      const limiter = makeRateLimiter();
      limiter(); // starts the timer
      limiter.cleanup();

      // Advance past the window — cleanup cancelled the timer so it never fires
      jest.advanceTimersByTime(5000);
      expect(jest.getTimerCount()).toBe(0);
    });

    test("cleanup on unused limiter does not throw", () => {
      const limiter = makeRateLimiter();
      expect(() => limiter.cleanup()).not.toThrow();
    });

    test("cleanup called multiple times does not throw", () => {
      const limiter = makeRateLimiter();
      limiter();
      limiter.cleanup();
      expect(() => limiter.cleanup()).not.toThrow();
    });
  });
});