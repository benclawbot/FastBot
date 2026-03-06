# Claudegram Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace FastBot's Telegram bot with Claudegram's implementation and make dashboard chat use Claude Agent SDK

**Architecture:** Use Claude Agent SDK (@anthropic-ai/claude-agent-sdk) as the core for both Telegram and Dashboard chat. Replace existing Telegram bot with Claudegram's telegram handler while preserving all existing FastBot features (LLM Router, Skills, Voice, Memory, Security, Cron).

**Tech Stack:** @anthropic-ai/claude-agent-sdk, Socket.io, grammY (for Telegram), Next.js

---

## Task 1: Install Claude Agent SDK

**Files:**
- Modify: `packages/gateway/package.json`

**Step 1: Add dependency**

Run: `cd packages/gateway && pnpm add @anthropic-ai/claude-agent-sdk`

**Step 2: Verify**

Run: `grep -q "claude-agent-sdk" package.json && echo "Installed"`
Expected: "Installed"

**Step 3: Commit**

```bash
git add packages/gateway/package.json pnpm-lock.yaml
git commit -m "feat: add Claude Agent SDK dependency"
```

---

## Task 2: Create Claude Agent Session Manager

**Files:**
- Create: `src/claude/session-manager.ts`
- Test: `src/claude/session-manager.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getSession, clearSession } from './session-manager.js';

describe('SessionManager', () => {
  beforeEach(() => {
    clearSession('test-user');
  });

  it('should create a new session', () => {
    const session = getSession('test-user');
    expect(session).toBeDefined();
    expect(session.workingDirectory).toBeDefined();
  });
});
```

**Step 2: Run test**

Run: `pnpm vitest run src/claude/session-manager.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface Session {
  claudeSessionId?: string;
  workingDirectory: string;
  messages: Array<{ role: string; content: string }>;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

const DEFAULT_WORKSPACE = process.env.WORKSPACE_DIR || process.cwd();

export function getSession(sessionKey: string): Session {
  let session = sessions.get(sessionKey);
  if (!session) {
    session = {
      workingDirectory: DEFAULT_WORKSPACE,
      messages: [],
      lastActivity: Date.now(),
    };
    sessions.set(sessionKey, session);
  }
  session.lastActivity = Date.now();
  return session;
}

export function clearSession(sessionKey: string): void {
  sessions.delete(sessionKey);
}

export function setClaudeSessionId(sessionKey: string, id: string): void {
  const session = getSession(sessionKey);
  session.claudeSessionId = id;
}
```

**Step 4: Run test**

Run: `pnpm vitest run src/claude/session-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/claude/session-manager.ts src/claude/session-manager.test.ts
git commit -m "feat: add Claude session manager"
```

---

## Task 3: Create Claude Agent Request Queue

**Files:**
- Create: `src/claude/request-queue.ts`
- Test: `src/claude/request-queue.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { setActiveQuery, clearActiveQuery, getActiveQuery } from './request-queue.js';

describe('RequestQueue', () => {
  it('should track active query', () => {
    setActiveQuery('user-1', { [Symbol.iterator]: () => ({ next: () => ({ done: true }) }) } as any);
    expect(getActiveQuery('user-1')).toBeDefined();
    clearActiveQuery('user-1');
    expect(getActiveQuery('user-1')).toBeUndefined();
  });
});
```

**Step 2: Run test - FAIL**

**Step 3: Write implementation**

```typescript
const activeQueries = new Map<string, any>();
const cancelledSessions = new Set<string>();

export function setActiveQuery(sessionKey: string, query: any): void {
  activeQueries.set(sessionKey, query);
}

export function clearActiveQuery(sessionKey: string): void {
  activeQueries.delete(sessionKey);
}

export function getActiveQuery(sessionKey: string): any {
  return activeQueries.get(sessionKey);
}

export function cancelSession(sessionKey: string): void {
  cancelledSessions.add(sessionKey);
  const query = activeQueries.get(sessionKey);
  if (query && typeof query.interrupt === 'function') {
    query.interrupt();
  }
}

export function isCancelled(sessionKey: string): boolean {
  return cancelledSessions.has(sessionKey);
}

export function uncancelSession(sessionKey: string): void {
  cancelledSessions.delete(sessionKey);
}
```

**Step 4: Run test - PASS**

**Step 5: Commit**

```bash
git add src/claude/request-queue.ts src/claude/request-queue.test.ts
git commit -m "feat: add request queue for Claude queries"
```

---

## Task 4: Create Claude Agent Watchdog

**Files:**
- Create: `src/claude/agent-watchdog.ts`
- Test: `src/claude/agent-watchdog.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentWatchdog } from './agent-watchdog.js';

describe('AgentWatchdog', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should warn after warning threshold', () => {
    const onWarning = vi.fn();
    const wd = new AgentWatchdog({ warnAfterSeconds: 5, onWarning });
    wd.start();
    vi.advanceTimersByTime(6000);
    expect(onWarning).toHaveBeenCalled();
    wd.stop();
  });
});
```

**Step 2: Run test - FAIL**

**Step 3: Write implementation**

```typescript
export class AgentWatchdog {
  private timer?: NodeJS.Timeout;
  private lastActivity = Date.now();

  constructor(private options: {
    warnAfterSeconds?: number;
    onWarning?: (sinceMsg: number, total: number) => void;
    onTimeout?: () => void;
    timeoutMs?: number;
  }) {}

  start(): void {
    this.lastActivity = Date.now();
    if (this.options.warnAfterSeconds) {
      this.timer = setInterval(() => {
        const elapsed = Date.now() - this.lastActivity;
        if (this.options.onWarning) {
          this.options.onWarning(elapsed, elapsed);
        }
      }, this.options.warnAfterSeconds * 1000);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  recordActivity(_type: string): void {
    this.lastActivity = Date.now();
  }
}
```

**Step 4: Run test - PASS**

**Step 5: Commit**

```bash
git add src/claude/agent-watchdog.ts src/claude/agent-watchdog.test.ts
git commit -m "feat: add Agent watchdog for long-running tasks"
```

---

## Task 5: Create Main Claude Agent Module

**Files:**
- Create: `src/claude/agent.ts`

**Step 1: Write implementation**

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getSession, setClaudeSessionId } from './session-manager.js';
import { setActiveQuery, clearActiveQuery } from './request-queue.js';

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  usage?: any;
}

export async function sendToAgent(
  sessionKey: string,
  message: string,
  options: {
    onProgress?: (text: string) => void;
    abortController?: AbortController;
    model?: string;
  } = {}
): Promise<AgentResponse> {
  const session = getSession(sessionKey);

  let fullText = '';
  const toolsUsed: string[] = [];

  try {
    const controller = options.abortController || new AbortController();
    const existingSessionId = session.claudeSessionId;

    const response = query({
      prompt: message,
      options: {
        cwd: session.workingDirectory,
        tools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task'],
        permissionMode: 'acceptEdits',
        abortController: controller,
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
        },
        model: options.model || 'opus',
        resume: existingSessionId,
      }
    });

    setActiveQuery(sessionKey, response);

    for await (const responseMessage of response) {
      if (controller.signal.aborted) break;

      if (responseMessage.type === 'assistant') {
        for (const block of responseMessage.message.content) {
          if (block.type === 'text') {
            fullText += block.text;
            options.onProgress?.(fullText);
          } else if (block.type === 'tool_use') {
            toolsUsed.push(block.name);
          }
        }
      } else if (responseMessage.type === 'result') {
        if (responseMessage.subtype === 'success' && 'session_id' in responseMessage) {
          setClaudeSessionId(sessionKey, responseMessage.session_id);
        }
      }
    }
  } finally {
    clearActiveQuery(sessionKey);
  }

  return { text: fullText || 'No response', toolsUsed };
}
```

**Step 2: Build and verify**

Run: `pnpm --filter @fastbot/gateway run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/claude/agent.ts
git commit -m "feat: add Claude Agent SDK integration"
```

---

## Task 6: Create MCP Tools Placeholder

**Files:**
- Create: `src/claude/mcp-tools.ts`

**Step 1: Write implementation**

```typescript
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

export function createMcpServers(): Record<string, McpServerConfig> {
  // Placeholder for MCP tools (Reddit, Medium, YouTube)
  return {};
}
```

**Step 2: Commit**

```bash
git add src/claude/mcp-tools.ts
git commit -m "feat: add MCP tools placeholder"
```

---

## Task 7: Create Claudegram Telegram Handler

**Files:**
- Create: `src/telegram/claudegram-handler.ts`

**Step 1: Write implementation**

```typescript
import { Bot } from 'grammy';
import { sendToAgent } from '../claude/agent.js';
import { cancelSession, isCancelled } from '../claude/request-queue.js';
import { getSession, clearSession } from '../claude/session-manager.js';

const BOT_TOKEN = process.env.SCB_TELEGRAM_TOKEN || '';

export function createClaudegramBot(): Bot {
  const bot = new Bot(BOT_TOKEN);

  bot.command('start', async (ctx) => {
    await ctx.reply('Welcome to FastBot! Claude Code is ready.');
  });

  bot.command('project', async (ctx) => {
    const session = getSession(String(ctx.from?.id));
    await ctx.reply(`Current project: ${session.workingDirectory}`);
  });

  bot.command('clear', async (ctx) => {
    clearSession(String(ctx.from?.id));
    await ctx.reply('Conversation cleared.');
  });

  bot.command('cancel', async (ctx) => {
    cancelSession(String(ctx.from?.id));
    await ctx.reply('Request cancelled.');
  });

  bot.command('model', async (ctx) => {
    const args = ctx.message?.text.split(' ');
    if (args?.[1]) {
      await ctx.reply(`Model set to: ${args[1]}`);
    } else {
      await ctx.reply('Usage: /model opus|sonnet|haiku');
    }
  });

  bot.on('message:text', async (ctx) => {
    const userId = String(ctx.from?.id);
    const text = ctx.message.text;

    if (text.startsWith('/')) return;
    if (isCancelled(userId)) {
      await ctx.reply('Previous request was cancelled.');
    }

    try {
      await ctx.replyWithChatAction('typing');

      const response = await sendToAgent(userId, text);
      await ctx.reply(response.text || 'No response');
    } catch (error) {
      await ctx.reply(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  return bot;
}
```

**Step 2: Commit**

```bash
git add src/telegram/claudegram-handler.ts
git commit -m "feat: add Claudegram Telegram handler"
```

---

## Task 8: Update Gateway to Use Claudegram Handler

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace Telegram initialization**

Find existing Telegram bot code in src/index.ts (around line 150) and replace with:

```typescript
import { createClaudegramBot } from './telegram/claudegram-handler.js';

try {
  const claudeBot = createClaudegramBot();
  claudeBot.start();
  log.info("Claudegram Telegram bot started");
} catch (err) {
  log.error({ err }, "Failed to start Claudegram bot");
}
```

**Step 2: Build**

Run: `pnpm --filter @fastbot/gateway run build`

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: integrate Claudegram Telegram handler"
```

---

## Task 9: Add Claude Handler to Gateway Socket.io

**Files:**
- Modify: `src/index.ts`

**Step 1: Add socket handler**

Add in socket handlers section:

```typescript
socket.on("claude:message", async (data: { actorId: string; content: string; model?: string }) => {
  if (!isAuthenticated(socket)) {
    socket.emit("chat:error", { error: "Authentication required" });
    return;
  }

  const session = sessions.getOrCreate(data.actorId, "web");
  sessions.addMessage(session.id, "user", data.content);

  io.to(session.id).emit("chat:message", {
    sessionId: session.id,
    role: "user",
    content: data.content,
    ts: Date.now(),
  });

  io.to(session.id).emit("chat:stream:start", { sessionId: session.id });

  try {
    const response = await sendToAgent(data.actorId, data.content, {
      model: data.model,
      onProgress: (text) => {
        io.to(session.id).emit("chat:stream:chunk", { sessionId: session.id, chunk: text });
      }
    });

    sessions.addMessage(session.id, "assistant", response.text);
    io.to(session.id).emit("chat:stream:end", { sessionId: session.id });
  } catch (err) {
    io.to(session.id).emit("chat:error", { error: err instanceof Error ? err.message : "Unknown error" });
    io.to(session.id).emit("chat:stream:end", { sessionId: session.id });
  }
});
```

**Step 2: Build**

Run: `pnpm --filter @fastbot/gateway run build`

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add Claude Agent socket handler"
```

---

## Task 10: Update Dashboard Chat to Use Claude Agent

**Files:**
- Modify: `packages/dashboard/app/chat/page.tsx`

**Step 1: Change socket emit**

Find sendMessage function and change:

```typescript
socket.emit("claude:message", {
  actorId: actorId.current,
  content: content.trim(),
  model: selectedModel || 'opus',
});
```

**Step 2: Add model selector UI**

Add a dropdown for model selection (opus/sonnet/haiku)

**Step 3: Build dashboard**

Run: `pnpm --filter @fastbot/dashboard run build`

**Step 4: Commit**

```bash
git add packages/dashboard/app/chat/page.tsx
git commit -m "feat: dashboard chat uses Claude Agent"
```

---

## Task 11: Add Configuration Support

**Files:**
- Modify: `src/config/defaults.ts` and `.env`

**Step 1: Add defaults**

```typescript
CLAUDE_EXECUTABLE_PATH: 'claude',
WORKSPACE_DIR: process.env.WORKSPACE_DIR || process.cwd(),
DANGEROUS_MODE: false,
```

**Step 2: Update .env example**

```
CLAUDE_EXECUTABLE_PATH=claude
WORKSPACE_DIR=/home/tom/projects
DANGEROUS_MODE=false
```

**Step 3: Commit**

```bash
git add src/config/defaults.ts .env.example
git commit -m "feat: add Claude Agent configuration"
```

---

## Task 12: End-to-End Testing

**Step 1: Start gateway**

Run: `pnpm --filter @fastbot/gateway run dev`

**Step 2: Test Telegram**

- /start - Should show welcome
- /project - Should show project
- /clear - Should clear
- /model opus - Should set model
- "Hello" - Should get Claude response

**Step 3: Test Dashboard**

- Open http://localhost:3100/chat
- Send message - Should get Claude response

**Step 4: Commit**

```bash
git commit -m "test: e2e testing completed"
```
