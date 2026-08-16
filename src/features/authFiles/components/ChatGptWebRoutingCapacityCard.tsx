import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { apiClient, chatGptWebApi } from '@/services/api';
import type { ChatGptWebRoutingDiagnosticsSnapshot } from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import { formatDateTime } from '@/utils/format';
import styles from './ChatGptWebRoutingCapacityCard.module.scss';

const ROUTING_PROVIDER = 'chatgpt-web';
const ROUTING_MODEL = 'gpt-image-2';
const POLL_INTERVAL_MS = 5_000;

type ChatGptWebRoutingCapacityCardProps = {
  active?: boolean;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

export function ChatGptWebRoutingCapacityCard({
  active = true,
}: ChatGptWebRoutingCapacityCardProps) {
  const { t } = useTranslation();
  const requestRef = useRef<AbortController | null>(null);
  const [diagnostics, setDiagnostics] = useState<ChatGptWebRoutingDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    if (!active || requestRef.current) return;
    const connection = apiClient.captureConnection();
    const abortController = new AbortController();
    requestRef.current = abortController;
    setLoading(true);
    try {
      const next = await chatGptWebApi.getRoutingDiagnostics(
        ROUTING_PROVIDER,
        ROUTING_MODEL,
        connection,
        abortController.signal
      );
      if (abortController.signal.aborted) return;
      setDiagnostics(next);
      setError('');
      setUnsupported(false);
    } catch (requestError) {
      if (abortController.signal.aborted) return;
      if ([404, 501].includes(getErrorStatus(requestError) ?? 0)) {
        setUnsupported(true);
        setError('');
        return;
      }
      setError(getChatGptWebErrorMessage(requestError, t));
    } finally {
      if (requestRef.current === abortController) {
        requestRef.current = null;
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }
  }, [active, t]);

  useEffect(() => {
    if (!active || unsupported) return;
    void loadDiagnostics();
    const timer = window.setInterval(() => void loadDiagnostics(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, loadDiagnostics, unsupported]);

  useEffect(() => {
    if (active) return;
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
  }, [active]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    []
  );

  const summary = useMemo(() => {
    const priorities = diagnostics?.routing.priorities ?? [];
    const sum = (read: (priority: (typeof priorities)[number]) => number) =>
      priorities.reduce((total, priority) => total + Math.max(0, read(priority) || 0), 0);
    const capacityValues = priorities.map((priority) => priority.request_capacity);
    const hasUnlimited = capacityValues.some(
      (capacity) => capacity.mode === 'unlimited' || capacity.mode === 'mixed'
    );
    const hasLimited = capacityValues.some(
      (capacity) =>
        capacity.mode === 'limited' ||
        capacity.mode === 'mixed' ||
        Math.max(0, capacity.limited_credentials ?? 0) > 0
    );
    const resetCandidates = capacityValues
      .map((capacity) => capacity.earliest_consumed_reset_at)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

    return {
      priorities,
      total: sum((priority) => priority.total),
      ready: sum((priority) => priority.ready_before_request_limit),
      eligible: sum((priority) => priority.eligible_now),
      requestLimited: sum((priority) => priority.request_limited),
      quotaExhausted: sum((priority) => priority.quota_exhausted),
      unavailable: sum((priority) => priority.unavailable),
      cooldown: sum((priority) => priority.cooldown),
      hasUnlimited,
      hasLimited,
      configuredSlots: capacityValues.reduce(
        (total, capacity) => total + Math.max(0, capacity.configured_slots ?? 0),
        0
      ),
      remainingSlots: capacityValues.reduce(
        (total, capacity) => total + Math.max(0, capacity.remaining_slots ?? 0),
        0
      ),
      configuredRpm: capacityValues.reduce(
        (total, capacity) => total + Math.max(0, capacity.configured_rpm ?? 0),
        0
      ),
      earliestResetAt: resetCandidates[0] ?? null,
    };
  }, [diagnostics]);

  const formatCapacity = (value: number): number | string => {
    const normalized = Math.round(Math.max(0, value));
    if (!summary.hasUnlimited) return normalized;
    const unlimitedLabel = t('chatgpt_web.account_info.routing.unlimited');
    return summary.hasLimited
      ? `${unlimitedLabel} + ${normalized.toLocaleString()}`
      : unlimitedLabel;
  };

  return (
    <section className={styles.panel} aria-label={t('chatgpt_web.account_info.routing.title')}>
      <div className={styles.header}>
        <div>
          <h3>{t('chatgpt_web.account_info.routing.title')}</h3>
          <p>{t('chatgpt_web.account_info.routing.description')}</p>
        </div>
        <span>{ROUTING_MODEL}</span>
      </div>

      {unsupported ? (
        <div className={styles.empty}>{t('chatgpt_web.account_info.routing.unsupported')}</div>
      ) : error && !diagnostics ? (
        <div className={styles.empty}>
          {t('chatgpt_web.account_info.routing.load_failed')}: {error}
        </div>
      ) : !diagnostics ? (
        <div className={styles.empty}>
          {loading ? <LoadingSpinner size={18} /> : null}
          {t('chatgpt_web.account_info.routing.loading')}
        </div>
      ) : (
        <>
          {error ? (
            <p className={styles.warning}>
              {t('chatgpt_web.account_info.routing.stale')}: {error}
            </p>
          ) : null}
          <dl className={styles.grid}>
            {[
              ['total', summary.total],
              ['ready', summary.ready],
              ['eligible', summary.eligible],
              ['remaining_slots', formatCapacity(summary.remainingSlots)],
              ['configured_slots', formatCapacity(summary.configuredSlots)],
              ['configured_rpm', formatCapacity(summary.configuredRpm)],
              ['request_limited', summary.requestLimited],
              ['quota_exhausted', summary.quotaExhausted],
              ['unavailable', summary.unavailable],
              ['cooldown', summary.cooldown],
              [
                'earliest_reset',
                summary.earliestResetAt ? formatDateTime(summary.earliestResetAt) : '—',
              ],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <dt>{t(`chatgpt_web.account_info.routing.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.priorityList}>
            {summary.priorities.map((priority) => (
              <span key={priority.priority}>
                P{priority.priority} · {priority.eligible_now}/{priority.total}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
