import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatLiveLogEvent,
  streamLiveLogs,
  type LiveLogEvent,
  type LiveLogQuery,
} from '@/services/api/liveLogs';

export type LiveLogConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'paused'
  | 'fallback';

type UseLiveLogsOptions = {
  enabled: boolean;
  paused: boolean;
  connected: boolean;
  scopeKey: string;
  query: LiveLogQuery;
  onLine: (line: string) => void;
  onReset?: () => void;
};

const waitForRetry = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });

export const useLiveLogs = (options: UseLiveLogsOptions) => {
  const { enabled, paused, connected, scopeKey, query, onLine, onReset } = options;
  const [streamState, setStreamState] = useState<LiveLogConnectionState>('idle');
  const [gapState, setGapState] = useState({ streamKey: scopeKey, count: 0 });
  const [errorState, setErrorState] = useState({ streamKey: scopeKey, message: '' });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const cursorRef = useRef(0);
  const onLineRef = useRef(onLine);
  const onResetRef = useRef(onReset);

  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const requestQuery = useMemo(() => JSON.parse(queryKey) as LiveLogQuery, [queryKey]);
  const streamKey = `${scopeKey}\u0000${queryKey}`;

  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  useEffect(() => {
    onResetRef.current = onReset;
  }, [onReset]);

  useEffect(() => {
    cursorRef.current = 0;
    if (enabled) onResetRef.current?.();
  }, [enabled, streamKey]);

  useEffect(() => {
    if (!enabled || !connected || paused) return;

    const controller = new AbortController();
    let retryAttempt = 0;
    const run = async () => {
      while (!controller.signal.aborted) {
        setStreamState(retryAttempt === 0 ? 'connecting' : 'reconnecting');
        try {
          await streamLiveLogs(
            { ...requestQuery, cursor: cursorRef.current },
            {
              onOpen: () => {
                retryAttempt = 0;
                setErrorState({ streamKey, message: '' });
                setStreamState('connected');
              },
              onEvent: (event: LiveLogEvent) => {
                cursorRef.current = Math.max(cursorRef.current, event.cursor || 0);
                onLineRef.current(formatLiveLogEvent(event));
              },
              onGap: (gap) => {
                cursorRef.current = Math.max(cursorRef.current, gap.to || 0);
                setGapState((current) => ({
                  streamKey,
                  count:
                    (current.streamKey === streamKey ? current.count : 0) +
                    Math.max(0, gap.count || 0),
                }));
              },
            },
            controller.signal
          );
          if (controller.signal.aborted) return;
          retryAttempt += 1;
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          const status =
            typeof error === 'object' && error !== null && 'status' in error
              ? Number((error as { status?: unknown }).status)
              : 0;
          const message = error instanceof Error ? error.message : String(error);
          setErrorState({ streamKey, message });
          if (status === 404 || status === 405 || status === 503) {
            setStreamState('fallback');
            return;
          }
          retryAttempt += 1;
        }
        setStreamState('reconnecting');
        await waitForRetry(
          Math.min(1000 * 2 ** Math.min(retryAttempt, 3), 10000),
          controller.signal
        );
      }
    };
    void run();
    return () => controller.abort();
  }, [connected, enabled, paused, requestQuery, retryGeneration, streamKey]);

  const retry = useCallback(() => {
    setErrorState({ streamKey, message: '' });
    setRetryGeneration((current) => current + 1);
  }, [streamKey]);

  const state: LiveLogConnectionState =
    !enabled || !connected ? 'idle' : paused ? 'paused' : streamState;
  const gapCount = gapState.streamKey === streamKey ? gapState.count : 0;
  const lastError = errorState.streamKey === streamKey ? errorState.message : '';

  return { state, gapCount, lastError, retry };
};
