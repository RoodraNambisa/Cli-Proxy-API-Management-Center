import { AuthFileCookieStatus } from './AuthFileCookieStatus';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { AuthFileItem, CodexStateSnapshot, CodexStateData } from '@/types/authFile';
import styles from './AuthFileStateStatus.module.scss';

export function AuthFileStateStatus({ file, disabled }: { file: AuthFileItem; disabled: boolean }) {
  const { t } = useTranslation();
  const text = (k: string) => t(`codex_state.${k}`);
  const failureDetails = (reason: string, length?: number, model?: string) => {
    if (
      [
        'state_length_mismatch',
        'invalid_or_missing_state',
        'response_state_length_mismatch',
      ].includes(reason) &&
      length !== undefined
    ) {
      return ` · ${t('codex_state.returned_length', { length })}`;
    }
    if (reason === 'response_model_mismatch') {
      return ` · ${t('codex_state.returned_model', { model: model || text('model_not_returned') })}`;
    }
    return '';
  };
  const connection = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const scope = `${connection}:${file.name}`;
  const active = useRef(scope);
  active.current = scope;
  const [updated, setUpdated] = useState<{ scope: string } & CodexStateData>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const mutation = useRef(0);
  const actionRequest = useRef<AbortController | null>(null);
  const state = file.codex_state;
  const models = updated?.scope === scope ? updated.models : (state?.models ?? []);
  const data = updated?.scope === scope ? updated : state;
  const cookies = data?.cookies ?? (data?.cookie ? [data.cookie] : []);
  const hasCookies = cookies.length > 0;
  const pollModels = [...models, ...cookies];
  const waiting =
    cookies.some(
      (cookie) =>
        (cookie.main || cookie.backups?.length) && cookie.status !== 'paused' && !cookie.exhausted
    ) ||
    pollModels.some(
      (model) =>
        ['queued', 'acquiring'].includes(model.status) ||
        Boolean(
          model.next_attempt && !model.exhausted && !model.manual_only && model.status !== 'paused'
        )
    );
  const live = useRef({ busy, waiting, models: pollModels });
  live.current = { busy, waiting, models: pollModels };
  useEffect(() => {
    active.current = scope;
    setUpdated(undefined);
    setError('');
    setBusy(false);
    return () => {
      actionRequest.current?.abort();
      active.current = '';
    };
  }, [scope]);
  useEffect(() => {
    if (!live.current.busy && !live.current.waiting) setUpdated(undefined);
  }, [file.codex_state]);
  useEffect(() => {
    if (!file.codex_state?.enabled) return;
    const timer = setInterval(() => setNow(Date.now()), hasCookies ? 1000 : 30000);
    return () => clearInterval(timer);
  }, [file.codex_state?.enabled, hasCookies]);
  useEffect(() => {
    if (!state?.enabled || !waiting || disabled || busy) return;
    const controller = new AbortController();
    const connection = apiClient.captureConnection();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      const version = mutation.current;
      let delay = statePollDelay(live.current.models);
      try {
        const response = await apiClient.getAtConnection<CodexStateData>(
          connection,
          `/auth-files/codex/state?name=${encodeURIComponent(file.name)}`,
          { signal: controller.signal }
        );
        if (
          !controller.signal.aborted &&
          active.current === scope &&
          version === mutation.current &&
          !live.current.busy
        ) {
          delay = statePollDelay([
            ...response.models,
            ...(response.cookies ?? (response.cookie ? [response.cookie] : [])),
          ]);
          setUpdated({ scope, ...response });
          setNow(Date.now());
          setError('');
          failures = 0;
        }
      } catch {
        if (!controller.signal.aborted && active.current === scope) {
          failures += 1;
          if (failures >= 3) setError(t('codex_state.poll_error'));
        }
      }
      if (!controller.signal.aborted && failures < 3) timer = setTimeout(() => void poll(), delay);
    };
    timer = setTimeout(() => void poll(), statePollDelay(live.current.models));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [state?.enabled, waiting, disabled, busy, file.name, scope, t]);

  const action = async (operation: string, model = '', strategy = 'state', pool?: string) => {
    if (busy || disabled) return;
    mutation.current += 1;
    const controller = new AbortController();
    actionRequest.current?.abort();
    actionRequest.current = controller;
    const connection = apiClient.captureConnection();
    const current = () => !controller.signal.aborted && active.current === scope;
    setBusy(true);
    setError('');
    try {
      const response =
        operation === 'refresh'
          ? await apiClient.getAtConnection<CodexStateData>(
              connection,
              `/auth-files/codex/state?name=${encodeURIComponent(file.name)}`,
              { signal: controller.signal }
            )
          : await apiClient.postAtConnection<CodexStateData>(
              connection,
              '/auth-files/codex/state',
              {
                name: file.name,
                model,
                action: operation,
                strategy,
                ...(pool === undefined ? {} : { cookie_pool: pool }),
              },
              { signal: controller.signal }
            );
      if (current()) {
        setUpdated({ scope, ...response });
        setNow(Date.now());
      }
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (current()) setBusy(false);
    }
  };
  if (!state?.enabled) return null;
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
            : cookies.length > 0
              ? text('strategy_cookie-only')
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
                {m.allowed_lengths && (
                  <div className={styles.counts}>
                    {t(
                      m.length_mode
                        ? 'response_guard.resource_length_policy'
                        : 'codex_state.rule_card_policy',
                      {
                        mode: t(`response_guard.length-mode_${m.length_mode}`),
                        rule:
                          m.rule_name && m.rule_name !== 'legacy'
                            ? m.rule_name
                            : m.rule_id || text('rule_legacy'),
                        lengths: m.allowed_lengths.join(', ') || text('picker_any_length'),
                        seconds: m.retry_seconds,
                      }
                    )}
                  </div>
                )}
                {m.manual_only && <div className={styles.counts}>{text('manual_only')}</div>}
                {m.routing_hidden && <div className={styles.warning}>{text('routing_hidden')}</div>}
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
                    {failureDetails(m.last_error, m.last_returned_length, m.last_returned_model)}
                  </div>
                )}
                {Boolean(m.max_retry_rounds) && !m.manual_only && (
                  <div className={styles.counts}>
                    {t('codex_state.retry_round_progress', {
                      round: (m.retry_rounds_used ?? 0) + 1,
                      total: (m.max_retry_rounds ?? 0) + 1,
                      failures: m.consecutive_failures,
                      limit: m.max_attempts,
                    })}
                  </div>
                )}
                {m.round_waiting && m.next_attempt && m.status !== 'paused' && (
                  <div className={styles.warning}>
                    {t('codex_state.retry_round_wait', {
                      round: (m.retry_rounds_used ?? 0) + 2,
                      minutes: Math.max(0, Math.ceil((Date.parse(m.next_attempt) - now) / 60000)),
                      time: new Date(m.next_attempt).toLocaleString(),
                    })}
                  </div>
                )}
                {m.exhausted && <div className={styles.warning}>{text('exhausted_hint')}</div>}
                {Boolean(m.invalidations) && (
                  <div className={styles.warning}>
                    {t('codex_state.invalidation_count', { count: m.invalidations })}
                    {' · '}
                    {t(`codex_state.reason_${m.last_invalidation}`, {
                      defaultValue: m.last_invalidation,
                    })}
                    {failureDetails(
                      m.last_invalidation || '',
                      m.invalidation_length,
                      m.invalidation_model
                    )}
                  </div>
                )}
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
      {cookies.map((cookie) => (
        <AuthFileCookieStatus
          key={cookie.pool ?? 'credential'}
          cookie={cookie}
          now={now}
          disabled={disabled || busy}
          onAction={(operation) => void action(operation, cookie.model, 'cookie-only', cookie.pool)}
        />
      ))}
      {error && (
        <div role="alert" className={styles.warning}>
          {error}
        </div>
      )}
    </div>
  );
}

// Long round cooldowns do not need the fast acquisition polling rate.
function statePollDelay(models: CodexStateSnapshot[]): number {
  if (models.some((m) => ['queued', 'acquiring'].includes(m.status))) return 1500;
  if (models.every((m) => !m.next_attempt)) return 10000;
  const deadlines = models
    .filter((m) => m.round_waiting && m.next_attempt && !m.exhausted && m.status !== 'paused')
    .map((m) => Date.parse(m.next_attempt!) - Date.now());
  if (
    !deadlines.length ||
    models.some(
      (m) =>
        m.next_attempt &&
        !m.round_waiting &&
        !m.exhausted &&
        !m.manual_only &&
        m.status !== 'paused'
    )
  )
    return 1500;
  return Math.max(1500, Math.min(30000, ...deadlines.filter(Number.isFinite)));
}
