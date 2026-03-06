/**
 * Tests for MemoryConsolidate agent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryConsolidate } from "./consolidate.js";
import { MemoryStore } from "./store.js";
import { SQLiteDB } from "../sqlite.js";
import { type Memory } from "./schema.js";

describe("MemoryConsolidate", () => {
  let db: SQLiteDB;
  let store: MemoryStore;
  let consolidate: MemoryConsolidate;

  beforeEach(async () => {
    db = new SQLiteDB(":memory:");
    await db.init();
    store = new MemoryStore(db);
    consolidate = new MemoryConsolidate(store);
  });

  it("should return empty array when fewer than 3 unconsolidated memories", async () => {
    // Add only 2 memories (less than minimum)
    const memories: Omit<Memory, "consolidated">[] = [
      {
        id: "1",
        userId: "user1",
        content: "I love cooking",
        embedding: null,
        timestamp: Date.now() - 1000,
        tags: ["cooking"],
      },
      {
        id: "2",
        userId: "user1",
        content: "My favorite food is pizza",
        embedding: null,
        timestamp: Date.now() - 2000,
        tags: ["food"],
      },
    ];

    for (const m of memories) {
      store.add(m);
    }

    const insights = await consolidate.consolidate("user1");

    expect(insights).toHaveLength(0);
  });

  it("should return empty array when no unconsolidated memories", async () => {
    const insights = await consolidate.consolidate("user1");

    expect(insights).toHaveLength(0);
  });

  it("should create insight when 3 or more unconsolidated memories exist", async () => {
    // Add 3 memories
    const memories: Omit<Memory, "consolidated">[] = [
      {
        id: "1",
        userId: "user2",
        content: "I love cooking Italian food",
        embedding: null,
        timestamp: Date.now() - 1000,
        tags: ["cooking", "italian"],
      },
      {
        id: "2",
        userId: "user2",
        content: "My favorite color is blue",
        embedding: null,
        timestamp: Date.now() - 2000,
        tags: ["preferences", "color"],
      },
      {
        id: "3",
        userId: "user2",
        content: "I went hiking in the mountains",
        embedding: null,
        timestamp: Date.now() - 3000,
        tags: ["hiking", "outdoors"],
      },
    ];

    for (const m of memories) {
      store.add(m);
    }

    const insights = await consolidate.consolidate("user2");

    expect(insights).toHaveLength(1);
    expect(insights[0]?.userId).toBe("user2");
    expect(insights[0]?.sourceMemoryIds).toHaveLength(3);
    expect(insights[0]?.content).toContain("Consolidated insights");
  });

  it("should mark memories as consolidated after creating insight", async () => {
    const memories: Omit<Memory, "consolidated">[] = [
      { id: "1", userId: "user3", content: "Memory 1", embedding: null, timestamp: Date.now() - 1000, tags: [] },
      { id: "2", userId: "user3", content: "Memory 2", embedding: null, timestamp: Date.now() - 2000, tags: [] },
      { id: "3", userId: "user3", content: "Memory 3", embedding: null, timestamp: Date.now() - 3000, tags: [] },
    ];

    for (const m of memories) {
      store.add(m);
    }

    await consolidate.consolidate("user3");

    // Check that memories are now marked as consolidated
    const unconsolidated = store.getUnconsolidated("user3", 0);
    expect(unconsolidated).toHaveLength(0);
  });

  it("should only consolidate memories from the last 24 hours", async () => {
    // Add 2 recent memories and 1 old memory (older than 24 hours)
    const memories: Omit<Memory, "consolidated">[] = [
      {
        id: "1",
        userId: "user4",
        content: "Recent memory 1",
        embedding: null,
        timestamp: Date.now() - 1000,
        tags: [],
      },
      {
        id: "2",
        userId: "user4",
        content: "Recent memory 2",
        embedding: null,
        timestamp: Date.now() - 2000,
        tags: [],
      },
      {
        id: "3",
        userId: "user4",
        content: "Old memory from 2 days ago",
        embedding: null,
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        tags: [],
      },
    ];

    for (const m of memories) {
      store.add(m);
    }

    const insights = await consolidate.consolidate("user4");

    // Only 2 recent memories - not enough for insight
    expect(insights).toHaveLength(0);
  });

  it("should only process memories for the specified user", async () => {
    // Add memories for different users
    const memories: Omit<Memory, "consolidated">[] = [
      { id: "1", userId: "userA", content: "User A memory 1", embedding: null, timestamp: Date.now() - 1000, tags: [] },
      { id: "2", userId: "userA", content: "User A memory 2", embedding: null, timestamp: Date.now() - 2000, tags: [] },
      { id: "3", userId: "userA", content: "User A memory 3", embedding: null, timestamp: Date.now() - 3000, tags: [] },
      { id: "4", userId: "userB", content: "User B memory 1", embedding: null, timestamp: Date.now() - 4000, tags: [] },
    ];

    for (const m of memories) {
      store.add(m);
    }

    // Consolidate for userA only
    const insights = await consolidate.consolidate("userA");

    expect(insights).toHaveLength(1);
    expect(insights[0]?.sourceMemoryIds).toContain("1");
    expect(insights[0]?.sourceMemoryIds).toContain("2");
    expect(insights[0]?.sourceMemoryIds).toContain("3");
    expect(insights[0]?.sourceMemoryIds).not.toContain("4");
  });

  it("should not include already consolidated memories", async () => {
    // Add 2 fresh memories and 1 already consolidated memory
    const memories: Omit<Memory, "consolidated">[] = [
      { id: "1", userId: "user5", content: "Fresh memory 1", embedding: null, timestamp: Date.now() - 1000, tags: [] },
      { id: "2", userId: "user5", content: "Fresh memory 2", embedding: null, timestamp: Date.now() - 2000, tags: [] },
      { id: "3", userId: "user5", content: "Already consolidated", embedding: null, timestamp: Date.now() - 3000, tags: [] },
    ];

    for (const m of memories) {
      store.add(m);
    }

    // Mark one as already consolidated
    store.markConsolidated("3");

    const insights = await consolidate.consolidate("user5");

    // Only 2 unconsolidated memories - not enough
    expect(insights).toHaveLength(0);
  });
});
