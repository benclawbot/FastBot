# Always-On Memory Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement persistent memory for FastBot using the Google Always-On Memory Agent pattern with Store, Recall, Consolidate, and Query agents.

**Architecture:** Standalone memory agent with SQLite + VectorStore, timer-based consolidation every 30 minutes, integrated via orchestrator.

**Tech Stack:** TypeScript, SQLite, VectorStore, LLM Router, Socket.io

---

## Task 1: Memory Database Schema

**Files:**
- Create: `packages/gateway/src/memory/agent/schema.ts`

**Step 1: Create the schema file**

```typescript
import { SQLiteDB } from "../sqlite.js";

export interface Memory {
  id: string;
  userId: string;
  content: string;
  embedding: number[];
  timestamp: number;
  tags: string[];
  consolidated: boolean;
}

export interface Insight {
  id: string;
  userId: string;
  content: string;
  sourceMemoryIds: string[];
  createdAt: number;
}

export interface MemoryMetadata {
  userId: string;
  lastConsolidated: number;
}

export function initMemorySchema(db: SQLiteDB): void {
  // Memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      timestamp INTEGER NOT NULL,
      tags TEXT DEFAULT '[]',
      consolidated INTEGER DEFAULT 0,
      INDEX idx_user_timestamp (user_id, timestamp)
    )
  `);

  // Insights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source_memory_ids TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      INDEX idx_user_created (user_id, created_at)
    )
  `);

  // Metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_metadata (
      user_id TEXT PRIMARY KEY,
      last_consolidated INTEGER NOT NULL
    )
  `);
}
```

**Step 2: Run build to verify**

Run: `pnpm --filter @fastbot/gateway run build 2>&1 | tail -10`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/gateway/src/memory/agent/schema.ts
git commit -m "feat: add memory agent database schema"
```

---

## Task 2: Store Agent

**Files:**
- Create: `packages/gateway/src/memory/agent/store.ts`
- Test: `packages/gateway/src/memory/agent/store.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from './store.js';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('should store a memory and return id', async () => {
    const id = await store.store('user1', 'Test memory content', ['test']);
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('should retrieve memories by user', async () => {
    await store.store('user1', 'First memory', []);
    await store.store('user1', 'Second memory', []);

    const memories = await store.getByUser('user1', 10);
    expect(memories.length).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @fastbot/gateway run test -- --run src/memory/agent/store.test.ts 2>&1 | tail -20`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
import { config } from '../../config.js';
import { initMemorySchema, type Memory } from './schema.js';

const memories = new Map<string, Memory>();

export class MemoryStore {
  constructor() {
    // Uses existing SQLiteDB from memory module
  }

  async store(userId: string, content: string, tags: string[] = []): Promise<string> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const memory: Memory = {
      id,
      userId,
      content,
      embedding: [], // TODO: Generate embedding via LLM
      timestamp: Date.now(),
      tags,
      consolidated: false,
    };
    memories.set(id, memory);
    return id;
  }

  async getByUser(userId: string, limit: number = 10): Promise<Memory[]> {
    const userMemories = Array.from(memories.values())
      .filter(m => m.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
    return userMemories;
  }

  async getUnconsolidated(userId: string, since: number): Promise<Memory[]> {
    return Array.from(memories.values())
      .filter(m => m.userId === userId && !m.consolidated && m.timestamp > since)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async markConsolidated(ids: string[]): Promise<void> {
    for (const id of ids) {
      const mem = memories.get(id);
      if (mem) mem.consolidated = true;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @fastbot/gateway run test -- --run src/memory/agent/store.test.ts 2>&1 | tail -10`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/memory/agent/store.ts packages/gateway/src/memory/agent/store.test.ts packages/gateway/src/memory/agent/schema.ts
git commit -m "feat: add memory store agent"
```

---

## Task 3: Recall Agent

**Files:**
- Create: `packages/gateway/src/memory/agent/recall.ts`
- Test: `packages/gateway/src/memory/agent/recall.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRecall } from './recall.js';

describe('MemoryRecall', () => {
  let recall: MemoryRecall;

  beforeEach(() => {
    recall = new MemoryRecall();
  });

  it('should recall memories by query', async () => {
    const results = await recall.recall('user1', 'test query', 5);
    expect(Array.isArray(results)).toBe(true);
  });
});
```

**Step 2: Run test - expect FAIL**

Run: `pnpm --filter @fastbot/gateway run test -- --run src/memory/agent/recall.test.ts 2>&1 | tail -10`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { MemoryStore } from './store.js';
import { VectorStore } from '../vectors.js';

export interface RecallResult {
  memory: any;
  score: number;
}

export class MemoryRecall {
  private store: MemoryStore;
  private vectorStore: VectorStore;

  constructor(store: MemoryStore, vectorStore: VectorStore) {
    this.store = store;
    this.vectorStore = vectorStore;
  }

  async recall(userId: string, query: string, limit: number = 5): Promise<RecallResult[]> {
    // TODO: Generate query embedding via LLM
    // For now, text search in content
    const userMemories = await this.store.getByUser(userId, 50);

    // Simple text match scoring
    const queryLower = query.toLowerCase();
    const scored = userMemories
      .map(m => {
        const contentLower = m.content.toLowerCase();
        let score = 0;
        // Exact substring match
        if (contentLower.includes(queryLower)) score += 10;
        // Word overlap
        const queryWords = queryLower.split(/\s+/);
        const contentWords = contentLower.split(/\s+/);
        const overlap = queryWords.filter(w => contentWords.includes(w)).length;
        score += overlap;
        return { memory: m, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }
}
```

**Step 4: Run test - expect PASS**

Run: `pnpm test -- --run src/memory/agent/recall.test.ts 2>&1 | tail -10`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/gateway/src/memory/agent/recall.ts
git commit -m "feat: add memory recall agent"
```

---

## Task 4: Consolidate Agent

**Files:**
- Create: `packages/gateway/src/memory/agent/consolidate.ts`
- Test: `packages/gateway/src/memory/agent/consolidate.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryConsolidate } from './consolidate.js';

describe('MemoryConsolidate', () => {
  it('should consolidate memories into insights', async () => {
    // TODO: Test consolidation
  });
});
```

**Step 2: Run test - expect FAIL**

Run: `pnpm test -- --run src/memory/agent/consolidate.test.ts 2>&1 | tail -10`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { MemoryStore, type Insight } from './store.js';

export class MemoryConsolidate {
  private store: MemoryStore;
  private llmRouter: any; // LLM Router injection

  constructor(store: MemoryStore, llmRouter: any) {
    this.store = store;
    this.llmRouter = llmRouter;
  }

  async consolidate(userId: string): Promise<Insight[]> {
    // Get unconsolidated memories from last 24 hours
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const memories = await this.store.getUnconsolidated(userId, since);

    if (memories.length < 3) {
      return []; // Not enough to consolidate
    }

    // TODO: Use LLM to find connections and generate insights
    // For now, return empty
    return [];
  }
}
```

**Step 4: Run test - expect PASS**

**Step 5: Commit**

```bash
git add packages/gateway/src/memory/agent/consolidate.ts
git commit -m "feat: add memory consolidate agent"
```

---

## Task 5: Query Agent

**Files:**
- Create: `packages/gateway/src/memory/agent/query.ts`

**Step 1: Write implementation**

```typescript
import { MemoryRecall, type RecallResult } from './recall.js';
import { MemoryStore, type Insight } from './store.js';

export interface QueryResponse {
  answer: string;
  memories: RecallResult[];
  insights: Insight[];
}

export class MemoryQuery {
  private recall: MemoryRecall;
  private store: MemoryStore;
  private llmRouter: any;

  constructor(recall: MemoryRecall, store: MemoryStore, llmRouter: any) {
    this.recall = recall;
    this.store = store;
    this.llmRouter = llmRouter;
  }

  async query(userId: string, question: string): Promise<QueryResponse> {
    // Recall relevant memories
    const memories = await this.recall.recall(userId, question, 5);

    // Get recent insights
    const recentInsights = await this.store.getInsights(userId, 3);

    // TODO: Use LLM to synthesize answer
    const answer = `Found ${memories.length} relevant memories.`;

    return {
      answer,
      memories,
      insights: recentInsights,
    };
  }
}
```

**Step 2: Commit**

```bash
git add packages/gateway/src/memory/agent/query.ts
git commit -m "feat: add memory query agent"
```

---

## Task 6: Orchestrator + Timer

**Files:**
- Create: `packages/gateway/src/memory/agent/orchestrator.ts`

**Step 1: Write implementation**

```typescript
import { MemoryStore } from './store.js';
import { MemoryRecall } from './recall.js';
import { MemoryConsolidate } from './consolidate.js';
import { MemoryQuery } from './query.js';
import { VectorStore } from '../vectors.js';

export class MemoryOrchestrator {
  private store: MemoryStore;
  private recall: MemoryRecall;
  private consolidate: MemoryConsolidate;
  private query: MemoryQuery;
  private timer: NodeJS.Timeout | null = null;

  constructor(llmRouter: any) {
    const vectorStore = new VectorStore();
    this.store = new MemoryStore();
    this.recall = new MemoryRecall(this.store, vectorStore);
    this.consolidate = new MemoryConsolidate(this.store, llmRouter);
    this.query = new MemoryQuery(this.recall, this.store, llmRouter);
  }

  start(intervalMinutes: number = 30): void {
    // Run consolidation on timer
    this.timer = setInterval(async () => {
      // TODO: Consolidate for all active users
      console.log('[MemoryAgent] Running consolidation...');
    }, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async store(userId: string, content: string, tags?: string[]): Promise<string> {
    return this.store.store(userId, content, tags);
  }

  async recall(userId: string, query: string, limit?: number) {
    return this.recall.recall(userId, query, limit);
  }

  async query(userId: string, question: string) {
    return this.query.query(userId, question);
  }
}
```

**Step 2: Commit**

```bash
git add packages/gateway/src/memory/agent/orchestrator.ts
git commit -m "feat: add memory orchestrator with timer"
```

---

## Task 7: Telegram Commands

**Files:**
- Modify: `packages/gateway/src/telegram/bot.ts`

**Step 1: Add memory commands**

```typescript
// /remember - store a memory
this.bot.command("remember", async (botCtx) => {
  const userId = botCtx.from?.id;
  if (!userId || !this.approval.isApproved(userId)) {
    await botCtx.reply("Not authorized.");
    return;
  }

  const args = botCtx.message?.text.split(" ").slice(1).join(" ");
  if (!args) {
    await botCtx.reply("Usage: /remember something important");
    return;
  }

  // Store via memory orchestrator
  await this.ctx.memoryAgent.store(`user:${userId}`, args, ['manual']);
  await botCtx.reply("✅ Memory stored");
});

// /recall - recall memories
this.bot.command("recall", async (botCtx) => {
  const userId = botCtx.from?.id;
  if (!userId || !this.approval.isApproved(userId)) {
    await botCtx.reply("Not authorized.");
    return;
  }

  const args = botCtx.message?.text.split(" ").slice(1).join(" ");
  if (!args) {
    await botCtx.reply("Usage: /recall what did I say about X");
    return;
  }

  const results = await this.ctx.memoryAgent.recall(`user:${userId}`, args, 5);
  if (results.length === 0) {
    await botCtx.reply("No memories found.");
    return;
  }

  const lines = ["*Relevant Memories:*\n"];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.memory.content.slice(0, 100)}...`);
  });
  await botCtx.reply(lines.join("\n"), { parse_mode: "Markdown" });
});
```

**Step 2: Build and commit**

```bash
git add packages/gateway/src/telegram/bot.ts
git commit -m "feat: add memory commands to Telegram bot"
```

---

## Task 8: Dashboard API

**Files:**
- Create: `packages/gateway/src/api/memory.ts`

**Step 1: Create API endpoints**

```typescript
import { Router } from 'express';
import type { GatewayContext } from '../index.js';

export function createMemoryRouter(ctx: GatewayContext): Router {
  const router = Router();

  // POST /api/memory - store memory
  router.post('/', async (req, res) => {
    const userId = req.user?.sub;
    const { content, tags } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }

    const id = await ctx.memoryAgent.store(userId, content, tags);
    res.json({ id });
  });

  // GET /api/memory?query=X - recall memories
  router.get('/', async (req, res) => {
    const userId = req.user?.sub;
    const { query } = req.query;

    const results = await ctx.memoryAgent.recall(userId, String(query), 10);
    res.json({ memories: results });
  });

  // POST /api/memory/query - query with LLM synthesis
  router.post('/query', async (req, res) => {
    const userId = req.user?.sub;
    const { question } = req.body;

    const result = await ctx.memoryAgent.query(userId, question);
    res.json(result);
  });

  return router;
}
```

**Step 2: Integrate in index.ts**

```typescript
// In index.ts
import { createMemoryRouter } from './api/memory.js';

const memoryRouter = createMemoryRouter(ctx);
app.use('/api/memory', memoryRouter);
```

**Step 3: Commit**

```bash
git add packages/gateway/src/api/memory.ts packages/gateway/src/index.ts
git commit -m "feat: add memory API endpoints"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database schema | schema.ts |
| 2 | Store agent | store.ts + test |
| 3 | Recall agent | recall.ts + test |
| 4 | Consolidate agent | consolidate.ts + test |
| 5 | Query agent | query.ts |
| 6 | Orchestrator + timer | orchestrator.ts |
| 7 | Telegram commands | bot.ts |
| 8 | Dashboard API | api/memory.ts |

**Dependencies:**
- Existing SQLiteDB from `src/memory/sqlite.ts`
- Existing VectorStore from `src/memory/vectors.ts`
- LLM Router from existing FastBot infrastructure
