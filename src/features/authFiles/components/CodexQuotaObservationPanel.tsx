import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types/authFile';
import { codexObservedQuotaWindows, normalizeCodexQuotaObservation } from '@/utils/codexQuotaObservation';
import { formatShanghaiDateTime } from '@/utils/quota';
import { QuotaProgressBar } from './QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';
import panelStyles from './CodexQuotaObservationPanel.module.scss';

export function CodexQuotaObservationPanel({ file, compact }: { file: AuthFileItem; compact: boolean }) {
  const { t } = useTranslation();
  if (file.quota_observation_enabled === false) return null;
  const observation = normalizeCodexQuotaObservation(file.quota_observation);
  if (!observation && file.quota_observation_enabled !== true) return null;
  const windows = observation ? codexObservedQuotaWindows(observation) : [];
  const signals = observation?.signals ?? {};
  const fields = [
    ['x-codex-plan-type', 'plan'],
    ['x-codex-active-limit', 'active_limit'],
    ['x-codex-allowed', 'allowed'],
    ['x-codex-limit-reached', 'limit_reached'],
    ['x-codex-credits-has-credits', 'has_credits'],
    ['x-codex-credits-unlimited', 'unlimited'],
    ['x-codex-credits-balance', 'balance'],
    ['x-ratelimit-remaining-requests', 'remaining_requests'],
    ['x-ratelimit-remaining-tokens', 'remaining_tokens'],
    ['retry-after', 'retry_after'],
  ] as const;

  return (
    <section className={`${styles.quotaSection} ${panelStyles.observation}`} aria-label={t('codex_quota_observation.title')}>
      <strong className={styles.quotaModel}>{t('codex_quota_observation.title')}</strong>
      {observation ? (
        <>
          <div className={styles.quotaReset}>
            {t('codex_quota_observation.observed', { source: observation.source === 'http' ? 'HTTP' : 'WebSocket' })}{' '}
            <time dateTime={observation.observed_at}>{formatShanghaiDateTime(observation.observed_at)}</time>
          </div>
          <div className={styles.quotaReset}>
            {t('codex_quota_observation.history_hint')}
          </div>
          {(windows.length > 0 || fields.some(([key]) => signals[key] !== undefined)) && <details open={!compact}>
            <summary>{t('codex_quota_observation.details')}</summary>
            <div className={styles.quotaRow}>
              {windows.map((window) => {
                const group = window.group === 'code-review' ? t('codex_quota_observation.code_review') : window.name ?? window.group.replace(/^additional-/, '');
                const period = window.minutes === 300 ? t('codex_quota.primary_window')
                  : window.minutes === 10080 ? t('codex_quota.secondary_window')
                  : window.minutes === null ? t('codex_quota_observation.window_unknown', { index: window.kind === 'primary' ? 1 : 2 })
                  : window.minutes % 60 === 0 ? t('codex_quota_observation.window_hours', { hours: window.minutes / 60 })
                  : t('codex_quota_observation.window_quota_minutes', { minutes: window.minutes });
                const label = [group, period].filter(Boolean).join(' · ');
                const remaining = window.usedPercent === null ? null : Number((100 - window.usedPercent).toFixed(2));
                return (
                  <div key={window.id} className={styles.quotaRow}>
                    <div className={styles.quotaRowHeader}>
                      <span className={styles.quotaModel} title={label}>{label}</span>
                      <span className={styles.quotaPercent}>
                        {remaining === null ? t('codex_quota_observation.unknown') : t('codex_quota_observation.remaining_percent', { percent: remaining })}
                      </span>
                    </div>
                    {remaining !== null && (
                      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining} aria-valuetext={t('codex_quota_observation.remaining_percent', { percent: remaining })}>
                        <QuotaProgressBar percent={remaining} highThreshold={50} mediumThreshold={20} />
                      </div>
                    )}
                    {window.minutes !== null && <div className={styles.quotaReset}>{t('codex_quota_observation.window_minutes', { minutes: window.minutes })}</div>}
                    <div className={styles.quotaReset}>
                      {t('codex_quota_observation.reset')}{' '}
                      {window.resetAt ? <time dateTime={window.resetAt}>{formatShanghaiDateTime(window.resetAt)}</time> : t('codex_quota_observation.unknown')}
                    </div>
                  </div>
                );
              })}
              {fields.map(([key, label]) => {
                const value = signals[key];
                if (value === undefined) return null;
                const display = value.toLowerCase() === 'true' ? t('common.yes') : value.toLowerCase() === 'false' ? t('common.no') : value;
                return <div key={key} className={styles.quotaReset}>{t(`codex_quota_observation.${label}`)}: {display}</div>;
              })}
            </div>
          </details>}
        </>
      ) : <div className={styles.quotaMessage}>{t('codex_quota_observation.empty')}</div>}
    </section>
  );
}
