import { useTranslation } from 'react-i18next';
import type { UsageFailureDimensionCount, UsageFailureSummary } from '@/types';
import type { UsageResource } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const TOP_FAILURE_ROWS = 8;

export interface FailureSummaryCardProps {
  resource: UsageResource<UsageFailureSummary>;
}

function FailureDimensionList({
  title,
  kind,
  items,
}: {
  title: string;
  kind: 'error_codes' | 'stages';
  items: UsageFailureDimensionCount[];
}) {
  const { t } = useTranslation();
  return (
    <section className={styles.failureDimension}>
      <h4>{title}</h4>
      <div className={styles.failureRows}>
        {items.slice(0, TOP_FAILURE_ROWS).map((item) => {
          const labelKey = `usage_stats.failure_${kind}.${item.value}`;
          const translated = t(labelKey);
          const label = translated === labelKey ? item.value : translated;
          const percent = Math.max(0, Math.min(100, Number(item.percent) || 0));
          return (
            <div className={styles.failureRow} key={item.value}>
              <div className={styles.failureRowHeader}>
                <span title={item.value}>{label}</span>
                <strong>
                  {item.count.toLocaleString()} · {percent.toFixed(1)}%
                </strong>
              </div>
              <div className={styles.failureBarTrack} aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FailureSummaryCard({ resource }: FailureSummaryCardProps) {
  const { t } = useTranslation();
  const summary = resource.data;
  const stateText =
    resource.status === 'loading'
      ? t('common.loading')
      : resource.status === 'disabled'
        ? t('usage_stats.state_disabled')
        : resource.status === 'unsupported'
          ? t('usage_stats.failure_summary_unsupported')
          : resource.status === 'error'
            ? resource.error || t('usage_stats.state_error')
            : resource.status === 'empty' || !summary || summary.total <= 0
              ? t('usage_stats.failure_summary_empty')
              : '';

  return (
    <div className={styles.failureSummaryCard}>
      <div className={styles.failureSummaryHeader}>
        <div>
          <h3>{t('usage_stats.failure_summary_title')}</h3>
          <p>{t('usage_stats.failure_summary_description')}</p>
        </div>
        <span>{summary ? summary.total.toLocaleString() : '—'}</span>
      </div>
      {stateText ? (
        <div className={styles.hint}>{stateText}</div>
      ) : summary ? (
        <>
          <dl className={styles.failureBoundaryGrid}>
            {[
              ['main', summary.main],
              ['auxiliary', summary.auxiliary],
              ['credential_selected', summary.boundaries.credential_selected],
              ['upstream_committed', summary.boundaries.upstream_committed],
              ['slot_consumed', summary.boundaries.auth_request_slot_consumed],
            ].map(([key, value]) => (
              <div key={String(key)}>
                <dt>{t(`usage_stats.failure_boundary_${key}`)}</dt>
                <dd>{Number(value).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.failureDimensionsGrid}>
            <FailureDimensionList
              title={t('usage_stats.failure_by_error_code')}
              kind="error_codes"
              items={summary.by_error_code ?? []}
            />
            <FailureDimensionList
              title={t('usage_stats.failure_by_stage')}
              kind="stages"
              items={summary.by_failure_stage ?? []}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
