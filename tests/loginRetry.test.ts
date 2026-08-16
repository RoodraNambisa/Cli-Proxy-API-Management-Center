import { describe, expect, test, vi } from 'vitest';
import { isStartupLoginRetryableError, retryStartupLogin } from '@/utils/loginRetry';

const apiError = (status?: number, code?: string) =>
  Object.assign(new Error(code === 'ERR_NETWORK' ? 'Network Error' : 'request failed'), {
    status,
    code,
  });

describe('startup login retry', () => {
  test.each([
    [apiError(undefined, 'ERR_NETWORK'), true],
    [apiError(undefined, 'ECONNREFUSED'), true],
    [apiError(502), true],
    [apiError(503), true],
    [apiError(504), true],
    [apiError(401), false],
    [apiError(403), false],
    [apiError(404), false],
    [apiError(429), false],
    [apiError(500), false],
    [apiError(undefined, 'ECONNABORTED'), false],
  ])(
    'classifies startup connectivity errors without retrying authentication errors',
    (error, expected) => {
      expect(isStartupLoginRetryableError(error)).toBe(expected);
    }
  );

  test('retries a bounded number of startup failures and then succeeds', async () => {
    const action = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(apiError(undefined, 'ERR_NETWORK'))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue('connected');
    const onRetry = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryStartupLogin(action, {
        delaysMs: [10, 20, 30],
        onRetry,
        wait,
      })
    ).resolves.toBe('connected');

    expect(action).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 10, undefined);
    expect(wait).toHaveBeenNthCalledWith(2, 20, undefined);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 2, total: 4, delayMs: 10 });
    expect(onRetry).toHaveBeenNthCalledWith(2, { attempt: 3, total: 4, delayMs: 20 });
  });

  test('returns authentication failures immediately without another request', async () => {
    const error = apiError(401);
    const action = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(retryStartupLogin(action, { delaysMs: [1, 2], wait })).rejects.toBe(error);
    expect(action).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });
});
