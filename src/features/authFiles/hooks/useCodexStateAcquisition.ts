import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';
import type { CodexStateSnapshot } from '@/types/authFile';

type Acquisition = {
  status: 'queued' | 'acquiring' | 'success' | 'failed' | 'stopped';
  snapshot?: CodexStateSnapshot;
  error?: string;
};

const waitForPoll = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 1500);
    signal.addEventListener('abort', done, { once: true });
  });

export function useCodexStateAcquisition(
  fileName: string,
  strategy: 'state' | 'cookie-only' = 'state'
) {
  const { t } = useTranslation();
  const connection = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const scope = `${connection}:${fileName}:${strategy}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState('');
  const [results, setResults] = useState<Record<string, Acquisition>>({});

  useEffect(() => {
    setPending('');
    setResults({});
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [scope]);

  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setPending('');
    setResults((current) =>
      Object.fromEntries(
        Object.entries(current).map(([model, result]) => [
          model,
          result.status === 'queued' || result.status === 'acquiring'
            ? { ...result, status: 'stopped' as const }
            : result,
        ])
      )
    );
  };

  const acquire = async (model: string): Promise<boolean> => {
    if (controller.current) return false;
    const abort = new AbortController();
    controller.current = abort;
    const current = () =>
      controller.current === abort && !abort.signal.aborted && activeScope.current === scope;
    const publish = (result: Acquisition) => {
      if (current()) setResults((previous) => ({ ...previous, [model]: result }));
    };
    setPending(model);
    publish({ status: 'queued' });
    const capturedConnection = apiClient.captureConnection();
    try {
      const response = await authFilesApi.acquireCodexState(
        fileName,
        model,
        capturedConnection,
        abort.signal,
        strategy
      );
      if (!current()) return false;
      if (
        response.diagnostic !== true ||
        !response.model ||
        typeof response.previous_acquired !== 'number'
      )
        throw new Error(t('model_probe.state_acquire_upgrade'));
      let status = response;
      while (current()) {
        const snapshot =
          strategy === 'cookie-only'
            ? status.cookie
            : status.models.find((item) => item.model === response.model);
        if (!snapshot) throw new Error(t('model_probe.state_acquire_unavailable'));
        if (snapshot.status !== 'queued' && snapshot.status !== 'acquiring') {
          if (snapshot.status === 'valid' && snapshot.acquired > response.previous_acquired) {
            publish({ status: 'success', snapshot });
            return true;
          }
          const reason = snapshot.last_error;
          const translated = reason
            ? t(`codex_state.reason_${reason}`, { defaultValue: reason })
            : t('model_probe.state_acquire_unavailable');
          publish({ status: 'failed', snapshot, error: translated });
          return false;
        }
        publish({ status: snapshot.status, snapshot });
        await waitForPoll(abort.signal);
        if (!current()) return false;
        status = {
          ...response,
          ...(await authFilesApi.getCodexState(fileName, capturedConnection, abort.signal)),
        };
      }
    } catch (error) {
      publish({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (current()) {
        controller.current = null;
        setPending('');
      }
    }
    return false;
  };
  return { pending, results, acquire, stop };
}
