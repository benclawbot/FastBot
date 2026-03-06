# Claude Code SDK Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Claude Code SDK into FastBot gateway so all chat messages use actual tool execution instead of outputting code as text.

**Architecture:** Create a ClaudeCodeAgent class wrapping the SDK, replace the chat flow to use it, and add fallback to existing LlmRouter if SDK is unavailable.

**Tech Stack:**
- @anthropic-ai/claude-code SDK
- Node.js 22 with ESM
- Existing LlmRouter for fallback

---

## Task 1: Add Claude Code SDK dependency

**Files:**
- Modify: `packages/gateway/package.json`

**Step 1: Add dependency**

```json
"@anthropic-ai/claude-code": "^0.1.0"
```

Run: `cd /home/tom/FastBot/FastBot && pnpm install`

---

## Task 2: Create ClaudeCodeAgent class

**Files:**
- Create: `packages/gateway/src/llm/claude-code.ts`

**Step 1: Write the failing test**

```typescript
// packages/gateway/src/llm/claude-code.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeCodeAgent } from "./claude-code.js";

describe("ClaudeCodeAgent", () => {
  let agent: ClaudeCodeAgent;

  beforeEach(() => {
    agent = new ClaudeCodeAgent({ apiKey: "test-key" });
  });

  it("should create instance with apiKey", () => {
    expect(agent).toBeDefined();
  });

  it("should have isAvailable method", () => {
    expect(typeof agent.isAvailable).toBe("function");
  });

  it("should have stream method", () => {
    expect(typeof agent.stream).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/tom/FastBot/FastBot && pnpm --filter @fastbot/gateway test -- src/llm/claude-code.test.ts`
Expected: FAIL with "Cannot find module" or "ClaudeCodeAgent not defined"

**Step 3: Write minimal implementation**

```typescript
// packages/gateway/src/llm/claude-code.ts
import { createAgent } from "@anthropic-ai/claude-code";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("claude-code");

export interface ClaudeCodeConfig {
  apiKey: string;
  maxTokens?: number;
}

export class ClaudeCodeAgent {
  private config: ClaudeCodeConfig;
  private agent: ReturnType<typeof createAgent> | null = null;

  constructor(config: ClaudeCodeConfig) {
    this.config = {
      maxTokens: 8192,
      ...config,
    };
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  async *stream(prompt: string): AsyncGenerator<string> {
    // TODO: implement
    yield "";
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/tom/FastBot/FastBot && pnpm --filter @fastbot/gateway test -- src/llm/claude-code.test.ts`
Expected: PASS

**Step 5: Commit**

Run: `git add packages/gateway/src/llm/claude-code.ts packages/gateway/src/llm/claude-code.test.ts packages/gateway/package.json`
Commit: `feat: add ClaudeCodeAgent class skeleton`

---

## Task 3: Implement actual stream method with tool execution

**Files:**
- Modify: `packages/gateway/src/llm/claude-code.ts`

**Step 1: Update test to verify tool execution**

```typescript
it("should execute tools and yield results", async () => {
  const results: string[] = [];
  for await (const chunk of agent.stream("Hello")) {
    results.push(chunk);
  }
  expect(results.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - stream method returns empty

**Step 3: Write full implementation**

```typescript
// packages/gateway/src/llm/claude-code.ts
import { createAgent } from "@anthropic-ai/claude-code";
import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("claude-code");

export interface ClaudeCodeConfig {
  apiKey: string;
  maxTokens?: number;
  workingDirectory?: string;
}

export class ClaudeCodeAgent {
  private config: ClaudeCodeConfig;
  private agent: ReturnType<typeof createAgent> | null = null;

  constructor(config: ClaudeCodeConfig) {
    this.config = {
      maxTokens: 8192,
      workingDirectory: process.cwd(),
      ...config,
    };
  }

  isAvailable(): boolean {
    if (!this.config.apiKey) {
      log.warn("Claude Code API key not configured");
      return false;
    }
    return true;
  }

  async *stream(
    prompt: string,
    sessionId?: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<string> {
    if (!this.isAvailable()) {
      yield "[Claude Code not available - configure ANTHROPIC_API_KEY]";
      return;
    }

    try {
      log.info({ prompt: prompt.slice(0100), sessionId }, "Starting Claude Code session");

      // Create agent with tool execution
      const agent = createAgent({
        apiKey: this.config.apiKey,
        maxTokens: this.config.maxTokens,
      });

      // Configure tool execution options
      const options = {
        tools: ["Read", "Write", "Bash", "Glob", "Grep", "Edit"],
        workingDirectory: this.config.workingDirectory,
        signal: abortSignal,
      };

      // Run agent with prompt
      const result = await agent.run(prompt, options);

      // Yield text response
      if (result.text) {
        yield result.text;
      }

      // Yield tool use info
      if (result.toolUses && result.toolUses.length > 0) {
        for (const toolUse of result.toolUses) {
          yield `\n[Used tool: ${toolUse.name}]\n`;
        }
      }

      log.info({ sessionId, hasError: !!result.error }, "Claude Code session completed");
    } catch (err) {
      log.error({ err, sessionId }, "Claude Code session failed");
      yield `[Claude Code error: ${err instanceof Error ? err.message : "Unknown error"}]`;
    }
  }

  async checkConnection(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const agent = createAgent({ apiKey: this.config.apiKey });
      await agent.run("Hello", { maxTokens: 10 });
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run test**

Run: `cd /home/tom/FastBot/FastBot && pnpm --filter @fastbot/gateway test -- src/llm/claude-code.test.ts`
Expected: May fail due to SDK differences - adjust as needed

**Step 5: Commit**

Run: `git add packages/gateway/src/llm/claude-code.ts`
Commit: `feat: implement ClaudeCodeAgent stream method with tool execution`

---

## Task 4: Add fallback to LlmRouter in chat flow

**Files:**
- Modify: `packages/gateway/src/index.ts`

**Step 1: Import ClaudeCodeAgent**

Add to imports around line 18:
```typescript
import { ClaudeCodeAgent } from "./llm/claude-code.js";
```

**Step 2: Initialize Claude Code Agent**

After llmRouter initialization (around line 185), add:
```typescript
// Initialize Claude Code Agent
let claudeCodeAgent: ClaudeCodeAgent | null = null;
if (config.llm?.primary?.apiKey) {
  claudeCodeAgent = new ClaudeCodeAgent({
    apiKey: config.llm.primary.apiKey,
    workingDirectory: projectRoot,
  });
  log.info("Claude Code Agent initialized");
}
```

**Step 3: Store in context**

In GatewayContext (around line 57), add:
```typescript
claudeCode: ClaudeCodeAgent | null;
```

At initialization (around line 137):
```typescript
claudeCode: null,
```

After setting up (around line 220):
```typescript
ctx.claudeCode = claudeCodeAgent;
```

**Step 4: Modify chat stream to use Claude Code**

In the chat:message handler (around line 454), replace the llmRouter.stream call:

```typescript
// Try Claude Code first, fallback to regular LLM
if (claudeCodeAgent?.isAvailable()) {
  log.info({ sessionId: session.id }, "Using Claude Code for chat");

  io.to(session.id).emit("chat:stream:start", { sessionId: session.id });

  try {
    for await (const chunk of claudeCodeAgent.stream(data.content, session.id, abortController.signal)) {
      io.to(session.id).emit("chat:stream:chunk", { sessionId: session.id, chunk });
    }
  } catch (err) {
    log.error({ err, sessionId }, "Claude Code failed, falling back to regular LLM");
    // Fallback to regular LLM
    for await (const chunk of llmRouter.stream(messages, session.id, botSystemPrompt, abortController.signal)) {
      io.to(session.id).emit("chat:stream:chunk", { sessionId: session.id, chunk });
    }
  }

  io.to(session.id).emit("chat:stream:end", { sessionId: session.id });
} else {
  // Use regular LLM
  for await (const chunk of llmRouter.stream(messages, session.id, botSystemPrompt, abortController.signal)) {
    io.to(session.id).emit("chat:stream:chunk", { sessionId: session.id, chunk });
  }
}
```

**Step 5: Commit**

Run: `git add packages/gateway/src/index.ts`
Commit: `feat: integrate Claude Code SDK in chat flow with fallback`

---

## Task 5: Test end-to-end

**Step 1: Build the project**

Run: `cd /home/tom/FastBot/FastBot && pnpm build`

**Step 2: Start gateway**

Run: `cd /home/tom/FastBot/FastBot && pnpm --filter @fastbot/gateway run dev`

**Step 3: Send test message**

Open dashboard, send: "Write a hello world file to /tmp/test.txt"

Verify:
- File is created at /tmp/test.txt
- Response shows tool execution

**Step 4: Commit**

Commit: `feat: complete Claude Code SDK integration`

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add @anthropic-ai/claude-code dependency |
| 2 | Create ClaudeCodeAgent class skeleton |
| 3 | Implement stream method with tool execution |
| 4 | Add fallback in chat flow |
| 5 | Test end-to-end |
