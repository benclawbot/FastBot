import { createChildLogger } from "../logger/index.js";
import type { LlmProvider, LlmConfig } from "../config/schema.js";

const log = createChildLogger("circuit-breaker");

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private readonly threshold = 5; // Open after 5 failures
  private readonly resetTimeout = 60000; // Try again after 60 seconds

  /**
   * Get or create state for an integration
   */
  getState(integration: string): CircuitBreakerState {
    if (!this.states.has(integration)) {
      this.states.set(integration, { failures: 0, lastFailure: 0, isOpen: false });
    }
    return this.states.get(integration)!;
  }

  /**
   * Record a failure and potentially open the circuit
   */
  recordFailure(integration: string): void {
    const state = this.getState(integration);
    state.failures++;
    state.lastFailure = Date.now();
    
    if (state.failures >= this.threshold) {
      state.isOpen = true;
      log.warn({ integration, failures: state.failures }, "Circuit breaker OPENED");
    }
  }

  /**
   * Record success and reset failures
   */
  recordSuccess(integration: string): void {
    const state = this.getState(integration);
    if (state.failures > 0) {
      log.info({ integration, previousFailures: state.failures }, "Circuit breaker reset");
    }
    state.failures = 0;
    state.isOpen = false;
  }

  /**
   * Check if circuit is open for an integration
   */
  isAvailable(integration: string): boolean {
    const state = this.getState(integration);
    
    if (!state.isOpen) return true;
    
    // Half-open: try again after reset timeout
    if (Date.now() - state.lastFailure > this.resetTimeout) {
      log.info({ integration }, "Circuit breaker HALF-OPEN (allowing test request)");
      return true;
    }
    
    return false;
  }

  /**
   * Get status of all integrations
   */
  getStatus(): Record<string, { status: string; failures: number }> {
    const status: Record<string, { status: string; failures: number }> = {};
    
    for (const [integration, state] of this.states.entries()) {
      if (state.isOpen && Date.now() - state.lastFailure > this.resetTimeout) {
        status[integration] = { status: "half-open", failures: state.failures };
      } else if (state.isOpen) {
        status[integration] = { status: "open", failures: state.failures };
      } else if (state.failures > 0) {
        status[integration] = { status: "degraded", failures: state.failures };
      } else {
        status[integration] = { status: "ok", failures: 0 };
      }
    }
    
    return status;
  }

  /**
   * Reset a specific integration
   */
  reset(integration: string): void {
    this.states.delete(integration);
    log.info({ integration }, "Circuit breaker manually reset");
  }

  /**
   * Reset all integrations
   */
  resetAll(): void {
    this.states.clear();
    log.info("All circuit breakers reset");
  }
}

// Singleton instance
export const circuitBreaker = new CircuitBreaker();
