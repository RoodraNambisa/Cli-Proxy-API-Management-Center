import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type CodexStateOptions } from '@/services/api/authFiles';

const empty: CodexStateOptions = { credentials: [], models: [], priorities: [], plans: [] };

export function useCodexStateOptions(kind: 'state' | 'response-guard' = 'state') {
  const { t } = useTranslation();
  const scope = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}:${kind}`
  );
  const active = useRef(scope);
  active.current = scope;
  const request = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    scope: string;
    data: CodexStateOptions;
    error?: string;
  }>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [scope]);
  const refresh = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () => !controller.signal.aborted && active.current === scope;
    setLoading(true);
    try {
      const data = await (kind === 'response-guard' ? authFilesApi.getCodexResponseGuardOptions : authFilesApi.getCodexStateOptions)(
        apiClient.captureConnection(),
        controller.signal
      );
      if (![data.credentials, data.models, data.priorities, data.plans].every(Array.isArray))
        throw new Error('Unsupported State options response');
      if (current()) setResult({ scope, data });
    } catch {
      if (current())
        setResult((previous) => ({
          scope,
          data: previous?.scope === scope ? previous.data : empty,
          error: t('codex_state.picker_load_error'),
        }));
    } finally {
      if (current()) setLoading(false);
    }
  };
  return {
    data: result?.scope === scope ? result.data : empty,
    error: result?.scope === scope ? result.error : undefined,
    loading,
    refresh,
    scope,
  };
}
