import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { AuthFileItem, CodexStateSnapshot } from '@/types/authFile';
import styles from './AuthFileStateStatus.module.scss';

export function AuthFileStateStatus({ file, disabled }: { file: AuthFileItem; disabled: boolean }) {
  const { t } = useTranslation();
  const text = (k: string) => t(`codex_state.${k}`);
  const connection = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const scope = `${connection}:${file.name}`;
  const active = useRef(scope);
  active.current = scope;
  const [updated, setUpdated] = useState<{ scope: string; models: CodexStateSnapshot[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setUpdated(undefined);
    setError('');
    setBusy(false);
  }, [file.codex_state, scope]);
  useEffect(() => {
    if (!file.codex_state?.enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [file.codex_state?.enabled]);
  const state = file.codex_state;
  if (!state?.enabled) return null;
  const models = updated?.scope === scope ? updated.models : state.models;
  const action = async (operation: string, model = '') => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      const response =
        operation === 'refresh'
          ? await apiClient.get<{ models: CodexStateSnapshot[] }>(
              `/auth-files/codex/state?name=${encodeURIComponent(file.name)}`
            )
          : await apiClient.post<{ models: CodexStateSnapshot[] }>('/auth-files/codex/state', {
              name: file.name,
              model,
              action: operation,
            });
      if (active.current === scope) setUpdated({ scope, models: response.models });
    } catch (err) {
      if (active.current === scope) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (active.current === scope) setBusy(false);
    }
  };
  const valid = models.filter(
    (m) => m.expires_at && Date.parse(m.expires_at) > now && m.status !== 'paused'
  ).length;
  const total = (field: 'uses' | 'attempts' | 'acquired') =>
    models.reduce((n, m) => n + m[field], 0);
  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <strong>{text('card_title')}</strong>
        <span>
          {models.length
            ? t('codex_state.valid_count', { count: valid, total: models.length })
            : text('out_of_scope')}
        </span>
      </div>
      {models.length > 0 && valid < models.length && (
        <div className={styles.warning}>{text('no_state')}</div>
      )}
      {models.length > 0 && (
        <>
          <div className={styles.counts}>
            {t('codex_state.counts', {
              uses: total('uses'),
              success: total('acquired'),
              attempts: total('attempts'),
            })}
          </div>
          <details>
            <summary>{text('details')}</summary>
            <div className={styles.actions}>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || disabled}
                onClick={() => void action('refresh')}
              >
                {text('refresh')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || disabled}
                onClick={() => void action('acquire')}
              >
                {text('acquire_all')}
              </Button>
            </div>
            {models.map((m) => (
              <div key={m.model} className={styles.model}>
                <div className={styles.summary}>
                  <strong>{m.model}</strong>
                  <span>{text(`status_${m.status}`)}</span>
                </div>
                <div>
                  {m.length > 0 ? `${m.length} · ${m.digest ?? ''}` : '—'}{' '}
                  {m.expires_at &&
                    t('codex_state.remaining', {
                      minutes: Math.max(0, Math.ceil((Date.parse(m.expires_at) - now) / 60000)),
                    })}
                </div>
                <div>
                  {t('codex_state.model_counts', {
                    uses: m.current_uses,
                    failures: m.consecutive_failures,
                    tokens: m.acquisition_tokens,
                  })}
                </div>
                {m.last_error && (
                  <div className={styles.warning}>
                    {text(`reason_${m.last_error}`) === `codex_state.reason_${m.last_error}`
                      ? m.last_error
                      : text(`reason_${m.last_error}`)}{' '}
                    {m.last_status ? ` · HTTP ${m.last_status}` : ''}
                  </div>
                )}
                {m.exhausted && <div className={styles.warning}>{text('exhausted_hint')}</div>}
                <div className={styles.actions}>
                  {['acquire', m.status === 'paused' ? 'resume' : 'pause', 'clear'].map((op) => (
                    <Button
                      key={op}
                      size="sm"
                      variant="secondary"
                      disabled={busy || disabled}
                      onClick={() => void action(op, m.model)}
                    >
                      {text(op)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </details>
        </>
      )}
      {error && (
        <div role="alert" className={styles.warning}>
          {error}
        </div>
      )}
    </div>
  );
}
