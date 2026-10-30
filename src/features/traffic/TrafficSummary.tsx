import { useTranslation } from 'react-i18next';
import type { TrafficSnapshot } from './types';
import styles from './Traffic.module.scss';
export function TrafficSummary({
  value,
  stale,
  credential = false,
}: {
  value?: TrafficSnapshot;
  stale?: boolean;
  credential?: boolean;
}) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <details className={styles.summary}>
      <summary>
        <span>
          {t('traffic.concurrency')} <b>{value.active}</b> /{' '}
          {value.concurrency_limit || t('traffic.unlimited')}
        </span>
        <span>
          RPM · 60s <b>{value.rpm_60s}</b>
        </span>
        {stale && <span role="status">{t('traffic.stale')}</span>}
      </summary>
      <div className={styles.details}>
        <span>
          {t('traffic.current_minute')}: {value.current_minute}
        </span>
        <span>
          {t('traffic.limit_usage', { count: value.window_minutes })}: {value.window_used} /{' '}
          {value.rpm_limit || t('traffic.unlimited')}
        </span>
        <span>
          {t(credential ? 'traffic.route_waiting' : 'traffic.waiting')}: {value.queued}
        </span>
        <span>
          {t('traffic.concurrency')} · {t('traffic.source')}:{' '}
          {t(`traffic.source_${value.concurrency_source || value.source || 'key'}`, {
            defaultValue: value.concurrency_source || value.source || 'Key',
          })}
        </span>
        {credential && (
          <span>
            RPM · {t('traffic.source')}:{' '}
            {t(`traffic.source_${value.source || 'global'}`, {
              defaultValue: value.source || 'global',
            })}
          </span>
        )}
        <span>
          {t('traffic.updated')}: {new Date(value.as_of).toLocaleTimeString()}
        </span>
        {!credential && (
          <>
            <span>
              {t('traffic.waiting_credentials')}: {value.waiting_credentials ?? 0}
            </span>
            <span>{t('traffic.key_active_hint')}</span>
          </>
        )}
      </div>
    </details>
  );
}
