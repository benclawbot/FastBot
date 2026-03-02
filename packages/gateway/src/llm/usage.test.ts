import { describe, it, expect, beforeEach } from "vitest";
import { UsageTracker } from "./usage.js";

describe("UsageTracker", () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  describe("record", () => {
    it("records a usage event", () => {
      const rec = tracker.record("anthropic", "claude-sonnet-4-20250514", 1000, 500, "s1");
      expect(rec.provider).toBe("anthropic");
      expect(rec.model).toBe("claude-sonnet-4-20250514");
      expect(rec.tokensIn).toBe(1000);
      expect(rec.tokensOut).toBe(500);
      expect(rec.costUsd).toBeGreaterThan(0);
      expect(rec.sessionId).toBe("s1");
      expect(rec.timestamp).toBeGreaterThan(0);
    });

    it("calculates cost based on model pricing", () => {
      // claude-sonnet-4-20250514: $3/1M in, $15/1M out
      const rec = tracker.record(
        "anthropic",
        "claude-sonnet-4-20250514",
        1_000_000,
        1_000_000,
        "s1"
      );
      expect(rec.costUsd).toBeCloseTo(3 + 15);
    });

    it("uses default cost for unknown models", () => {
      const rec = tracker.record("custom", "my-model", 1000, 500, "s1");
      expect(rec.costUsd).toBeGreaterThan(0);
    });
  });

  describe("totals", () => {
    it("sums all records", () => {
      tracker.record("anthropic", "claude-sonnet-4-20250514", 100, 50, "s1");
      tracker.record("openai", "gpt-4o", 200, 100, "s2");

      const t = tracker.totals();
      expect(t.tokensIn).toBe(300);
      expect(t.tokensOut).toBe(150);
      expect(t.calls).toBe(2);
      expect(t.costUsd).toBeGreaterThan(0);
    });

    it("returns zeros for no records", () => {
      const t = tracker.totals();
      expect(t.tokensIn).toBe(0);
      expect(t.tokensOut).toBe(0);
      expect(t.costUsd).toBe(0);
      expect(t.calls).toBe(0);
    });
  });

  describe("byProvider", () => {
    it("groups by provider", () => {
      tracker.record("anthropic", "claude-sonnet-4-20250514", 100, 50, "s1");
      tracker.record("anthropic", "claude-sonnet-4-20250514", 200, 100, "s1");
      tracker.record("openai", "gpt-4o", 300, 150, "s2");

      const bp = tracker.byProvider();
      expect(bp["anthropic"].tokensIn).toBe(300);
      expect(bp["anthropic"].calls).toBe(2);
      expect(bp["openai"].tokensIn).toBe(300);
      expect(bp["openai"].calls).toBe(1);
    });
  });

  describe("bySession", () => {
    it("filters by session", () => {
      tracker.record("anthropic", "claude-sonnet-4-20250514", 100, 50, "sess-a");
      tracker.record("anthropic", "claude-sonnet-4-20250514", 200, 100, "sess-b");
      tracker.record("openai", "gpt-4o", 300, 150, "sess-a");

      const sa = tracker.bySession("sess-a");
      expect(sa.tokensIn).toBe(400);
      expect(sa.calls).toBe(2);

      const sb = tracker.bySession("sess-b");
      expect(sb.tokensIn).toBe(200);
      expect(sb.calls).toBe(1);
    });

    it("returns zeros for unknown session", () => {
      const s = tracker.bySession("ghost");
      expect(s.tokensIn).toBe(0);
      expect(s.calls).toBe(0);
    });
  });

  describe("clear", () => {
    it("removes all records", () => {
      tracker.record("a", "m", 100, 50, "s");
      tracker.record("b", "m", 200, 100, "s");
      tracker.clear();
      expect(tracker.totals().calls).toBe(0);
      expect(tracker.allRecords()).toHaveLength(0);
    });
  });

  describe("allRecords", () => {
    it("returns a copy of records", () => {
      tracker.record("a", "m", 100, 50, "s");
      const recs = tracker.allRecords();
      expect(recs).toHaveLength(1);
      // Ensure it's a copy
      recs.push({} as any);
      expect(tracker.allRecords()).toHaveLength(1);
    });
  });
});
