/**
 * Memory consolidation agent.
 * Groups unconsolidated memories into insights.
 */
import { createChildLogger } from "../../logger/index.js";
import { type Insight } from "./schema.js";
import { type MemoryStore } from "./store.js";

const log = createChildLogger("memory:consolidate");

/**
 * Minimum number of memories required to create an insight.
 */
const MIN_MEMORIES_FOR_INSIGHT = 3;

/**
 * Time window for consolidation (24 hours in milliseconds).
 */
const CONSOLIDATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Memory consolidation agent.
 * Analyzes unconsolidated memories and creates insights.
 */
export class MemoryConsolidate {
  constructor(private store: MemoryStore) {}

  /**
   * Run consolidation for a user.
   * Gets unconsolidated memories from the last 24 hours.
   * If there are at least 3 memories, creates an insight and marks them as consolidated.
   *
   * @param userId The user to consolidate memories for
   * @returns Array of created insights (empty if fewer than 3 memories)
   */
  async consolidate(userId: string): Promise<Insight[]> {
    const since = Date.now() - CONSOLIDATION_WINDOW_MS;
    const memories = this.store.getUnconsolidated(userId, since);

    log.debug({ userId, memoryCount: memories.length }, "Checking for memories to consolidate");

    // Need at least 3 memories to create an insight
    if (memories.length < MIN_MEMORIES_FOR_INSIGHT) {
      log.debug({ userId, memoryCount: memories.length }, "Not enough memories for consolidation");
      return [];
    }

    // Create insight content (simple concatenation for now - can be expanded with LLM)
    const content = this.generateInsightContent(memories.map((m) => m.content));

    // Store the insight
    const insight = this.store.storeInsight({
      userId,
      content,
      sourceMemoryIds: memories.map((m) => m.id),
    });

    // Mark all source memories as consolidated
    for (const memory of memories) {
      this.store.markConsolidated(memory.id);
    }

    log.info({ userId, insightId: insight.id, memoryCount: memories.length }, "Created insight from consolidated memories");

    return [insight];
  }

  /**
   * Generate insight content from memory contents.
   * Simple concatenation for now - can be expanded with LLM integration.
   */
  private generateInsightContent(contents: string[]): string {
    // Simple stub: concatenate memories with a separator
    // TODO: Replace with LLM-based summarization and connection finding
    return `Consolidated insights from ${contents.length} memories:\n\n${contents.join("\n\n")}`;
  }
}
