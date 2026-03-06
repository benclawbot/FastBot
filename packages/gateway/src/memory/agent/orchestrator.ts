/**
 * Memory orchestrator with consolidation timer.
 * Coordinates all memory agents and manages periodic consolidation.
 */
import { createChildLogger } from "../../logger/index.js";
import { MemoryStore } from "./store.js";
import { MemoryRecall } from "./recall.js";
import { MemoryConsolidate } from "./consolidate.js";
import { MemoryQuery } from "./query.js";
import type { RecallResult } from "./recall.js";
import type { QueryResponse } from "./query.js";

const log = createChildLogger("memory:orchestrator");

/**
 * Default consolidation interval in minutes.
 */
const DEFAULT_CONSOLIDATION_INTERVAL_MINUTES = 30;

/**
 * Memory orchestrator that coordinates all memory agents.
 * Provides a unified interface for storing, recalling, querying, and consolidating memories.
 * Runs periodic consolidation on a configurable interval.
 */
export class MemoryOrchestrator {
  private memoryStore: MemoryStore;
  private memoryRecall: MemoryRecall;
  private memoryConsolidate: MemoryConsolidate;
  private memoryQuery: MemoryQuery;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMinutes: number;
  private activeUserIds: Set<string> = new Set();

  constructor(memoryStore: MemoryStore) {
    // Initialize all memory agents with shared store
    this.memoryStore = memoryStore;
    this.memoryRecall = new MemoryRecall(memoryStore);
    this.memoryConsolidate = new MemoryConsolidate(memoryStore);
    this.memoryQuery = new MemoryQuery(this.memoryRecall, memoryStore);
    this.intervalMinutes = DEFAULT_CONSOLIDATION_INTERVAL_MINUTES;
  }

  /**
   * Start the consolidation timer.
   * @param intervalMinutes How often to run consolidation (default: 30 minutes)
   */
  start(intervalMinutes?: number): void {
    this.intervalMinutes = intervalMinutes ?? DEFAULT_CONSOLIDATION_INTERVAL_MINUTES;
    const intervalMs = this.intervalMinutes * 60 * 1000;

    log.info({ intervalMinutes: this.intervalMinutes }, "Starting memory consolidation timer");

    // Run consolidation immediately on start
    this.runConsolidation();

    // Schedule periodic consolidation
    this.timer = setInterval(() => {
      this.runConsolidation();
    }, intervalMs);
  }

  /**
   * Stop the consolidation timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info("Stopped memory consolidation timer");
    }
  }

  /**
   * Register a user for consolidation.
   * The orchestrator will consolidate memories for this user on the timer interval.
   * @param userId The user ID to register
   */
  registerUser(userId: string): void {
    this.activeUserIds.add(userId);
    log.debug({ userId, activeUsers: this.activeUserIds.size }, "Registered user for consolidation");
  }

  /**
   * Unregister a user from consolidation.
   * @param userId The user ID to unregister
   */
  unregisterUser(userId: string): void {
    this.activeUserIds.delete(userId);
    log.debug({ userId, activeUsers: this.activeUserIds.size }, "Unregistered user from consolidation");
  }

  /**
   * Store a memory for a user.
   * @param userId The user ID to store the memory for
   * @param content The memory content
   * @param tags Optional tags for the memory
   * @returns The ID of the stored memory
   */
  async storeMemory(userId: string, content: string, tags?: string[]): Promise<string> {
    // Register user if not already registered
    this.registerUser(userId);

    log.debug({ userId, contentLength: content.length, tags }, "Storing memory");
    const id = crypto.randomUUID();
    this.memoryStore.add({
      id,
      userId,
      content,
      embedding: null,
      timestamp: Date.now(),
      tags: tags ?? [],
    });
    return id;
  }

  /**
   * Recall memories for a user.
   * @param userId The user ID to recall memories for
   * @param query The search query
   * @param limit Maximum number of results (default: 10)
   * @returns Array of recall results
   */
  async recall(userId: string, query: string, limit = 10): Promise<RecallResult[]> {
    log.debug({ userId, query, limit }, "Recalling memories");
    return this.memoryRecall.recall(userId, query, limit);
  }

  /**
   * Query memories with synthesis.
   * @param userId The user ID to query memories for
   * @param question The question to answer
   * @returns Query response with answer, memories, and insights
   */
  async query(userId: string, question: string): Promise<QueryResponse> {
    log.debug({ userId, question }, "Querying memories");
    return this.memoryQuery.query(userId, question);
  }

  /**
   * Consolidate memories for a specific user.
   * This is called automatically by the timer, but can also be called manually.
   * @param userId The user ID to consolidate memories for
   */
  async consolidateUser(userId: string): Promise<void> {
    log.debug({ userId }, "Running consolidation for user");
    // For now, consolidation is a no-op since LLM integration isn't implemented
    // This will be expanded when LLM integration is added
    log.info({ userId }, "Consolidation complete (no-op for now - LLM integration pending)");
  }

  /**
   * Run consolidation for all active users.
   */
  private async runConsolidation(): Promise<void> {
    log.debug({ activeUsers: this.activeUserIds.size }, "Running scheduled consolidation");

    for (const userId of this.activeUserIds) {
      try {
        await this.consolidateUser(userId);
      } catch (error) {
        log.error({ userId, error }, "Error during consolidation for user");
      }
    }

    log.debug("Scheduled consolidation completed");
  }
}
