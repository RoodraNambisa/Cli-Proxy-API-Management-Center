import type { ApiError } from '@/types';

export const STARTUP_LOGIN_RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000, 5_000, 8_000] as const;

export type StartupLoginRetryProgress = {
  attempt: number;
  total: number;
  delayMs: number;
};

type StartupLoginRetryOptions = {
  delaysMs?: readonly number[];
  signal?: AbortSignal;
  onRetry?: (progress: StartupLoginRetryProgress) => void;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
};

const createAbortError = (): Error => {
  const error = new Error('Login retry canceled');
  error.name = 'AbortError';
  return error;
};

const waitForDelay = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });

export const isStartupLoginRetryableError = (error: unknown): boolean => {
  const apiError = error as Partial<ApiError>;
  const status = typeof apiError?.status === 'number' ? apiError.status : undefined;
  if (status !== undefined) {
    return status === 502 || status === 503 || status === 504;
  }

  const code = typeof apiError?.code === 'string' ? apiError.code.toUpperCase() : '';
  if (['ERR_NETWORK', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
        ? error.toLowerCase()
        : '';
  return message.includes('network error') || message.includes('failed to fetch');
};

export async function retryStartupLogin<T>(
  action: () => Promise<T>,
  options: StartupLoginRetryOptions = {}
): Promise<T> {
  const delaysMs = options.delaysMs ?? STARTUP_LOGIN_RETRY_DELAYS_MS;
  const wait = options.wait ?? waitForDelay;

  for (let attemptIndex = 0; ; attemptIndex += 1) {
    if (options.signal?.aborted) throw createAbortError();
    try {
      return await action();
    } catch (error) {
      const delayMs = delaysMs[attemptIndex];
      if (delayMs === undefined || !isStartupLoginRetryableError(error)) {
        throw error;
      }
      options.onRetry?.({
        attempt: attemptIndex + 2,
        total: delaysMs.length + 1,
        delayMs,
      });
      await wait(delayMs, options.signal);
    }
  }
}
