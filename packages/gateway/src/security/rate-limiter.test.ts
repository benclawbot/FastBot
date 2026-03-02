import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.shutdown();
  });

  it("allows requests within limit", () => {
    limiter = new RateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("user-1")).toBe(true);
    }
  });

  it("blocks requests over limit", () => {
    limiter = new RateLimiter(3, 60_000);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false); // 4th blocked
  });

  it("tracks users independently", () => {
    limiter = new RateLimiter(2, 60_000);
    expect(limiter.consume("user-a")).toBe(true);
    expect(limiter.consume("user-a")).toBe(true);
    expect(limiter.consume("user-a")).toBe(false);
    // user-b still has full quota
    expect(limiter.consume("user-b")).toBe(true);
    expect(limiter.consume("user-b")).toBe(true);
    expect(limiter.consume("user-b")).toBe(false);
  });

  it("refills tokens after interval", () => {
    vi.useFakeTimers();
    limiter = new RateLimiter(2, 1_000); // 2 tokens per 1 second

    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(true);
    expect(limiter.consume("user-1")).toBe(false);

    // Advance 1 second
    vi.advanceTimersByTime(1_000);
    expect(limiter.consume("user-1")).toBe(true);

    vi.useRealTimers();
  });

  it("remaining() shows correct count", () => {
    limiter = new RateLimiter(5, 60_000);
    expect(limiter.remaining("new-user")).toBe(5);
    limiter.consume("new-user");
    expect(limiter.remaining("new-user")).toBe(4);
    limiter.consume("new-user");
    expect(limiter.remaining("new-user")).toBe(3);
  });

  it("does not exceed max tokens on refill", () => {
    vi.useFakeTimers();
    limiter = new RateLimiter(3, 1_000);

    limiter.consume("user-1"); // 2 left
    vi.advanceTimersByTime(5_000); // 5 refills
    // Should cap at 3, not 2 + 15
    expect(limiter.remaining("user-1")).toBe(3);

    vi.useRealTimers();
  });
});
