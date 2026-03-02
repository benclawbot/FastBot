import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("llm:usage");

export interface UsageRecord {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  sessionId: string;
  timestamp: number;
}

// Approximate costs per 1M tokens (input/output) as of early 2026
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 1, output: 5 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

/**
 * Track token usage and estimate costs across LLM providers.
 */
export class UsageTracker {
  private records: UsageRecord[] = [];

  /**
   * Record a usage event.
   */
  record(
    provider: string,
    model: string,
    tokensIn: number,
    tokensOut: number,
    sessionId: string
  ): UsageRecord {
    const costs = COST_TABLE[model] ?? { input: 1, output: 3 };
    const costUsd =
      (tokensIn * costs.input) / 1_000_000 +
      (tokensOut * costs.output) / 1_000_000;

    const rec: UsageRecord = {
      provider,
      model,
      tokensIn,
      tokensOut,
      costUsd,
      sessionId,
      timestamp: Date.now(),
    };

    this.records.push(rec);
    log.debug(
      { provider, model, tokensIn, tokensOut, costUsd: costUsd.toFixed(6) },
      "Usage recorded"
    );
    return rec;
  }

  /**
   * Get total usage across all sessions.
   */
  totals(): {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    calls: number;
  } {
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;

    for (const r of this.records) {
      tokensIn += r.tokensIn;
      tokensOut += r.tokensOut;
      costUsd += r.costUsd;
    }

    return { tokensIn, tokensOut, costUsd, calls: this.records.length };
  }

  /**
   * Get usage broken down by provider.
   */
  byProvider(): Record<
    string,
    { tokensIn: number; tokensOut: number; costUsd: number; calls: number }
  > {
    const map: Record<
      string,
      { tokensIn: number; tokensOut: number; costUsd: number; calls: number }
    > = {};

    for (const r of this.records) {
      if (!map[r.provider]) {
        map[r.provider] = { tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 };
      }
      map[r.provider].tokensIn += r.tokensIn;
      map[r.provider].tokensOut += r.tokensOut;
      map[r.provider].costUsd += r.costUsd;
      map[r.provider].calls++;
    }

    return map;
  }

  /**
   * Get usage for a specific session.
   */
  bySession(
    sessionId: string
  ): {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    calls: number;
  } {
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;
    let calls = 0;

    for (const r of this.records) {
      if (r.sessionId === sessionId) {
        tokensIn += r.tokensIn;
        tokensOut += r.tokensOut;
        costUsd += r.costUsd;
        calls++;
      }
    }

    return { tokensIn, tokensOut, costUsd, calls };
  }

  /**
   * Get all records (for dashboard).
   */
  allRecords(): UsageRecord[] {
    return [...this.records];
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records = [];
  }
}
