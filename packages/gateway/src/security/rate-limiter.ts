import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("security:ratelimit");

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory token bucket rate limiter.
 * Each actor gets their own bucket.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private cleanupHandle: ReturnType<typeof setInterval>;

  constructor(
    /** Max tokens per bucket */
    private maxTokens: number,
    /** Refill interval in milliseconds (defaults to 60s) */
    private refillIntervalMs: number = 60_000
  ) {
    // Cleanup stale buckets every 5 minutes
    this.cleanupHandle = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.lastRefill > this.refillIntervalMs * 5) {
          this.buckets.delete(key);
        }
      }
    }, 5 * 60_000);
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      const refills = Math.floor(elapsed / this.refillIntervalMs);
      bucket.tokens = Math.min(
        this.maxTokens,
        bucket.tokens + refills * this.maxTokens
      );
      bucket.lastRefill = now;
    }
  }

  private getOrCreateBucket(actorId: string): Bucket {
    let bucket = this.buckets.get(actorId);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.buckets.set(actorId, bucket);
    }
    this.refill(bucket);
    return bucket;
  }

  /**
   * Consume a token for the given actor.
   * Returns true if allowed, false if rate limited.
   */
  consume(actorId: string): boolean {
    const bucket = this.getOrCreateBucket(actorId);

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    log.warn({ actorId, maxTokens: this.maxTokens }, "Rate limited");
    return false;
  }

  /**
   * Get remaining tokens for an actor (includes refill check).
   */
  remaining(actorId: string): number {
    const bucket = this.buckets.get(actorId);
    if (!bucket) return this.maxTokens;
    this.refill(bucket);
    return bucket.tokens;
  }

  shutdown(): void {
    clearInterval(this.cleanupHandle);
  }
}
