export interface RelayerRetryNotice {
  operation: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorName: string;
  errorMessage: string;
}

export interface RelayerRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (notice: RelayerRetryNotice) => void;
  sleep?: (delayMs: number) => Promise<void>;
}

const TRANSIENT_RELAYER_ERRORS = new Set([
  "RelayerV2FetchError",
  "RelayerV2MaxRetryError",
  "RelayerV2TimeoutError",
]);

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "UnknownError", message: String(error) };
}

/**
 * The v2 relayer retries queued jobs and rate limits, but a socket failure during
 * the initial POST is surfaced immediately with retryCount=0. Retry only those
 * transport/timeout failures; proof rejection and other semantic errors must fail
 * without being hidden by retries.
 */
export function isTransientRelayerError(error: unknown): boolean {
  const { name, message } = errorDetails(error);
  if (TRANSIENT_RELAYER_ERRORS.has(name)) return true;
  return name === "TypeError" && /fetch failed|socket|network/i.test(message);
}

export async function retryTransientRelayerOperation<T>(
  operation: string,
  run: () => Promise<T>,
  options: RelayerRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const initialDelayMs = options.initialDelayMs ?? 2_000;
  const maxDelayMs = options.maxDelayMs ?? 15_000;
  const sleep = options.sleep ?? ((delayMs) => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  }));

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }
  if (initialDelayMs < 0 || maxDelayMs < 0) {
    throw new Error("retry delays must be non-negative");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientRelayerError(error) || attempt === maxAttempts) throw error;
      const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const { name, message } = errorDetails(error);
      options.onRetry?.({
        operation,
        attempt,
        maxAttempts,
        delayMs,
        errorName: name,
        errorMessage: message,
      });
      await sleep(delayMs);
    }
  }

  throw new Error(`${operation}: retry loop exhausted unexpectedly`);
}
