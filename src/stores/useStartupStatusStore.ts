import { create } from 'zustand';
import { historyStorageApi } from '@/services/api';
import type { StartupStatusSnapshot } from '@/types';

type StartupSupport = 'unknown' | 'supported' | 'unsupported';

interface StartupStatusState {
  connectionKey: string;
  snapshot: StartupStatusSnapshot | null;
  support: StartupSupport;
  loading: boolean;
  error: string;
  load: (connectionKey: string) => Promise<void>;
  reset: () => void;
}

const getErrorStatus = (error: unknown): number | undefined =>
  error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : undefined;

let requestSequence = 0;
let inFlight: { key: string; promise: Promise<void> } | null = null;

export const startupMutationsBlocked = (snapshot: StartupStatusSnapshot | null): boolean =>
  snapshot !== null &&
  (snapshot.status === 'initializing' || snapshot.status === 'failed' || !snapshot.ready);

export const useStartupStatusStore = create<StartupStatusState>((set, get) => ({
  connectionKey: '',
  snapshot: null,
  support: 'unknown',
  loading: false,
  error: '',
  load: (connectionKey) => {
    if (inFlight?.key === connectionKey) return inFlight.promise;
    const sequence = ++requestSequence;
    const changed = get().connectionKey !== connectionKey;
    set({
      connectionKey,
      loading: true,
      error: '',
      ...(changed ? { snapshot: null, support: 'unknown' as const } : {}),
    });
    const promise = historyStorageApi
      .getStartupStatus()
      .then((snapshot) => {
        if (sequence !== requestSequence || get().connectionKey !== connectionKey) return;
        set({ snapshot, support: 'supported', loading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (sequence !== requestSequence || get().connectionKey !== connectionKey) return;
        if (getErrorStatus(error) === 404) {
          set({ snapshot: null, support: 'unsupported', loading: false, error: '' });
          return;
        }
        set({
          snapshot: null,
          support: 'unknown',
          loading: false,
          error: error instanceof Error ? error.message : 'startup',
        });
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { key: connectionKey, promise };
    return promise;
  },
  reset: () => {
    requestSequence += 1;
    inFlight = null;
    set({
      connectionKey: '',
      snapshot: null,
      support: 'unknown',
      loading: false,
      error: '',
    });
  },
}));
