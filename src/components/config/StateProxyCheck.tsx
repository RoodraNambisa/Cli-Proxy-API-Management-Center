import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type CodexStateProxyResult } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';

export function StateProxyCheck({ proxyUrl, disabled }: { proxyUrl: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const connection = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const scope = `${connection}:${proxyUrl}`;
  const active = useRef(scope);
  active.current = scope;
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    data?: CodexStateProxyResult;
    error?: string;
  }>();
  useEffect(() => {
    setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [scope]);
  const run = async () => {
    if (disabled || loading || !proxyUrl.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    const current = () => !controller.signal.aborted && active.current === scope;
    setLoading(true);
    setResult(undefined);
    try {
      const data = await authFilesApi.checkCodexStateProxy(
        proxyUrl,
        apiClient.captureConnection(),
        controller.signal
      );
      if (current()) setResult({ scope, data });
    } catch (error) {
      if (current())
        setResult({
          scope,
          error: text(
            (error as { status?: number })?.status === 400
              ? 'proxy_test_invalid'
              : 'proxy_test_error'
          ),
        });
    } finally {
      if (current()) setLoading(false);
    }
  };
  const visible = result?.scope === scope ? result : undefined;
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        loading={loading}
        disabled={disabled || !proxyUrl.trim()}
        onClick={() => void run()}
      >
        {text('proxy_test')}
      </Button>
      {loading && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            request.current?.abort();
            setLoading(false);
          }}
        >
          {t('common.cancel')}
        </Button>
      )}
      <p className="hint">{text('proxy_test_hint')}</p>
      {visible?.data && (
        <div
          role={visible.data.ok ? 'status' : 'alert'}
          className={visible.data.ok ? 'hint' : 'error-box'}
        >
          {visible.data.ok ? (
            <>
              <strong>{text('proxy_test_success')}</strong>
              {` · IP: ${visible.data.ip ?? '—'} · ${visible.data.loc ?? '—'} · ${visible.data.elapsed_ms ?? 0} ms`}
            </>
          ) : (
            [visible.data.error, visible.data.message].filter(Boolean).join(' · ') ||
            text('proxy_test_error')
          )}
        </div>
      )}
      {visible?.error && (
        <div role="alert" className="error-box">
          {visible.error}
        </div>
      )}
    </div>
  );
}
