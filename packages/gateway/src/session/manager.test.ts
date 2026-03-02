import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionManager } from "./manager.js";

describe("SessionManager", () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager();
  });

  afterEach(() => {
    sm.shutdown();
  });

  describe("getOrCreate", () => {
    it("creates a new session", () => {
      const session = sm.getOrCreate("user-1", "web");
      expect(session.id).toBeTruthy();
      expect(session.actorId).toBe("user-1");
      expect(session.origin).toBe("web");
      expect(session.messages).toEqual([]);
    });

    it("returns same session for same actorId", () => {
      const s1 = sm.getOrCreate("user-1", "web");
      const s2 = sm.getOrCreate("user-1", "telegram");
      expect(s1.id).toBe(s2.id);
    });

    it("creates different sessions for different actors", () => {
      const s1 = sm.getOrCreate("user-1", "web");
      const s2 = sm.getOrCreate("user-2", "web");
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe("shared session (web + telegram)", () => {
    it("telegram and web share the same session", () => {
      const telegram = sm.getOrCreate("actor-x", "telegram");
      const web = sm.getOrCreate("actor-x", "web");
      expect(telegram.id).toBe(web.id);

      sm.addMessage(telegram.id, "user", "hello from telegram");
      expect(web.messages).toHaveLength(1);
      expect(web.messages[0].content).toBe("hello from telegram");
    });
  });

  describe("getByActor", () => {
    it("finds session by actorId", () => {
      const s = sm.getOrCreate("user-abc", "web");
      expect(sm.getByActor("user-abc")?.id).toBe(s.id);
    });

    it("returns undefined for unknown actor", () => {
      expect(sm.getByActor("ghost")).toBeUndefined();
    });
  });

  describe("addMessage", () => {
    it("appends messages to session", () => {
      const s = sm.getOrCreate("user-1", "web");
      sm.addMessage(s.id, "user", "hi");
      sm.addMessage(s.id, "assistant", "hello!");

      expect(s.messages).toHaveLength(2);
      expect(s.messages[0].role).toBe("user");
      expect(s.messages[1].role).toBe("assistant");
      expect(s.messages[0].ts).toBeGreaterThan(0);
    });

    it("ignores messages for unknown session", () => {
      sm.addMessage("nonexistent", "user", "hi");
      // Should not throw
    });
  });

  describe("write lock", () => {
    it("acquires and releases lock", () => {
      const s = sm.getOrCreate("user-1", "web");
      expect(sm.acquireLock(s.id)).toBe(true);
      expect(sm.acquireLock(s.id)).toBe(false); // Already locked
      sm.releaseLock(s.id);
      expect(sm.acquireLock(s.id)).toBe(true); // Can lock again
    });

    it("returns false for unknown session", () => {
      expect(sm.acquireLock("nonexistent")).toBe(false);
    });
  });

  describe("isDuplicate (debouncing)", () => {
    it("detects duplicate messages within window", () => {
      expect(sm.isDuplicate("user-1", "hello")).toBe(false);
      expect(sm.isDuplicate("user-1", "hello")).toBe(true);
    });

    it("allows different content", () => {
      expect(sm.isDuplicate("user-1", "msg-a")).toBe(false);
      expect(sm.isDuplicate("user-1", "msg-b")).toBe(false);
    });

    it("allows same content from different actors", () => {
      expect(sm.isDuplicate("user-1", "hello")).toBe(false);
      expect(sm.isDuplicate("user-2", "hello")).toBe(false);
    });
  });

  describe("destroy", () => {
    it("removes session and index", () => {
      const s = sm.getOrCreate("user-1", "web");
      sm.destroy(s.id);
      expect(sm.getByActor("user-1")).toBeUndefined();
      expect(sm.get(s.id)).toBeUndefined();
    });
  });

  describe("listActive", () => {
    it("lists all sessions", () => {
      sm.getOrCreate("user-1", "web");
      sm.getOrCreate("user-2", "telegram");
      expect(sm.listActive()).toHaveLength(2);
    });
  });
});
