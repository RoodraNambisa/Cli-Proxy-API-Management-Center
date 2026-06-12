import { useTranslation } from 'react-i18next';
import type { AuthFileUsageSummary } from '@/features/authFiles/hooks/useAuthFilesUsageSummary';
import { formatCompactNumber } from '@/utils/usage';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileUsageStatsPanelProps = {
  summary?: AuthFileUsageSummary;
  loading: boolean;
  compact: boolean;
};

const formatMetricNumber = (value: number): string =>
  value === 0 ? '0' : formatCompactNumber(value);

export function AuthFileUsageStatsPanel({
  summary,
  loading,
  compact,
}: AuthFileUsageStatsPanelProps) {
  const { i18n, t } = useTranslation();
  const hasStats = Boolean(summary && summary.requestCount > 0);
  const latestLabel = summary?.latestTimestampMs
    ? new Intl.DateTimeFormat(i18n.language, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(summary.latestTimestampMs))
    : t('auth_files.usage_stats_recent_none');

  const metricItems = hasStats
    ? [
        {
          key: 'requests',
          label: t('auth_files.usage_stats_requests'),
          value: formatMetricNumber(summary?.requestCount ?? 0),
        },
        {
          key: 'tokens',
          label: t('auth_files.usage_stats_tokens'),
          value: formatMetricNumber(summary?.totalTokens ?? 0),
        },
        {
          key: 'success-rate',
          label: t('auth_files.usage_stats_success_rate'),
          value: `${Math.round(((summary?.successCount ?? 0) / (summary?.requestCount ?? 1)) * 100)}%`,
        },
        {
          key: 'recent',
          label: t('auth_files.usage_stats_recent'),
          value: latestLabel,
        },
      ]
    : [];

  return (
    <div className={`${styles.usageStatsPanel} ${compact ? styles.usageStatsPanelCompact : ''}`}>
      <div className={styles.usageStatsHeader}>
        <span>{t('auth_files.usage_stats_title')}</span>
        {loading && <span className={styles.usageStatsLoading}>{t('common.loading')}</span>}
      </div>

      {hasStats ? (
        <div className={styles.usageStatsGrid}>
          {metricItems.map((item) => (
            <div key={item.key} className={styles.usageStatsItem}>
              <span className={styles.usageStatsLabel}>{item.label}</span>
              <span className={styles.usageStatsValue}>{item.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.usageStatsEmpty}>
          {loading ? t('auth_files.usage_stats_loading') : t('auth_files.usage_stats_empty')}
        </div>
      )}
    </div>
  );
}
