import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveLogEvent, LiveLogQuery } from '@/services/api/liveLogs';
import { useLiveLogs } from './useLiveLogs';

const streamLiveLogsMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/liveLogs', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api/liveLogs')>();
  return { ...original, streamLiveLogs: streamLiveLogsMock };
});

afterEach(() => {
  streamLiveLogsMock.mockReset();
});

describe('useLiveLogs', () => {
  it('starts a changed server-side filter with a fresh cursor and resets visible lines', async () => {
    streamLiveLogsMock.mockImplementation(
      async (
        _query: LiveLogQuery,
        callbacks: { onOpen?: () => void; onEvent: (event: LiveLogEvent) => void },
        signal: AbortSignal
      ) => {
        callbacks.onOpen?.();
        callbacks.onEvent({
          cursor: 91,
          timestamp: '2026-08-07T12:00:00Z',
          level: 'info',
          message: 'line',
        });
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    );
    const onReset = vi.fn();
    const onLine = vi.fn();
    const initialProps = { query: { provider: 'chatgpt-web' } as LiveLogQuery };
    const { rerender, unmount } = renderHook(
      ({ query }) =>
        useLiveLogs({
          enabled: true,
          paused: false,
          connected: true,
          scopeKey: 'connection',
          query,
          onLine,
          onReset,
        }),
      { initialProps }
    );

    await waitFor(() => expect(streamLiveLogsMock).toHaveBeenCalledTimes(1));
    expect(streamLiveLogsMock.mock.calls[0][0]).toMatchObject({ cursor: 0 });
    await waitFor(() => expect(onLine).toHaveBeenCalled());

    rerender({ query: { provider: 'codex' } });

    await waitFor(() => expect(streamLiveLogsMock).toHaveBeenCalledTimes(2));
    expect(streamLiveLogsMock.mock.calls[1][0]).toMatchObject({ provider: 'codex', cursor: 0 });
    expect(onReset).toHaveBeenCalledTimes(2);

    act(() => unmount());
  });
});
