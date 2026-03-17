import { createChildLogger } from "../logger/index.js";

const log = createChildLogger("retry");

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  onRetry: () => {},
};

/**
 * Execute a function with exponential backoff retry
 * @param fn The function to execute
 * @param options Retry configuration
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on final attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff: 1s, 2s, 4s...
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt - 1),
        opts.maxDelay
      );

      log.warn(
        { attempt, maxAttempts: opts.maxAttempts, delay, error: lastError.message },
        "Retry attempt"
      );

      opts.onRetry(attempt, lastError);
      
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Execute a function with timeout
 * @param fn The function to execute
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutError The error to throw on timeout
 * @returns The result of the function
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 30000,
  timeoutError?: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutError || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Execute a function with circuit breaker protection
 * @param circuitKey The key to identify this circuit
 * @param fn The function to execute
 * @param isAvailable Function to check if circuit is available
 * @param recordSuccess Function to record success
 * @param recordFailure Function to record failure
 * @returns The result of the function
 */
export async function withCircuitBreaker<T>(
  circuitKey: string,
  fn: () => Promise<T>,
  isAvailable: (key: string) => boolean,
  recordSuccess: (key: string) => void,
  recordFailure: (key: string) => void
): Promise<T> {
  if (!isAvailable(circuitKey)) {
    throw new Error(`Circuit breaker open for: ${circuitKey}`);
  }

  try {
    const result = await fn();
    recordSuccess(circuitKey);
    return result;
  } catch (error) {
    recordFailure(circuitKey);
    throw error;
  }
}
