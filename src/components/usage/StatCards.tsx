import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import {
  IconDiamond,
  IconDollarSign,
  IconSatellite,
  IconTimer,
  IconTrendingUp,
} from '@/components/ui/icons';
import type { UsageCostsResponse, UsageRatesResponse, UsageTokensResponse } from '@/types';
import { formatCompactNumber, formatPerMinuteValue, formatUsd } from '@/utils/usage';
import { sparklineOptions } from '@/utils/usage/chartConfig';
import type { UsagePayload, UsageResource, UsageResourceStatus } from './hooks/useUsageData';
import type { SparklineBundle } from './hooks/useSparklines';
import styles from '@/pages/UsagePage.module.scss';

interface StatCardData {
  key: string;
  label: string;
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  value: string;
  meta?: ReactNode;
  trend: SparklineBundle | null;
}

export interface StatCardsProps {
  usage: UsagePayload | null;
  loading: boolean;
  ratesResource: UsageResource<UsageRatesResponse>;
  tokensResource: UsageResource<UsageTokensResponse>;
  costsResource: UsageResource<UsageCostsResponse>;
  sparklines: {
    requests: SparklineBundle | null;
    tokens: SparklineBundle | null;
    rpm: SparklineBundle | null;
    tpm: SparklineBundle | null;
    cost: SparklineBundle | null;
  };
}

const tokenNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const moneyAmount = (response: UsageCostsResponse | null): number => {
  const micros = Number(response?.total?.amount_micros);
  if (Number.isFinite(micros)) return micros / 1_000_000;
  const amount = Number(response?.total?.amount);
  return Number.isFinite(amount) ? amount : 0;
};

export function StatCards({
  usage,
  loading,
  ratesResource,
  tokensResource,
  costsResource,
  sparklines,
}: StatCardsProps) {
  const { t } = useTranslation();
  const tokens = tokensResource.data?.tokens ?? {};
  const rates = ratesResource.data;
  const costs = costsResource.data;
  const cachedTokens = Math.max(
    tokenNumber(tokens.cached_tokens),
    tokenNumber(tokens.cache_tokens)
  );
  const cacheCreationTokens = tokenNumber(tokens.cache_creation_tokens);
  const reasoningTokens = tokenNumber(tokens.reasoning_tokens);
  const rateLoading = ratesResource.status === 'loading';
  const costLoading = costsResource.status === 'loading';
  const costUnavailable = ['disabled', 'unsupported', 'error'].includes(costsResource.status);
  const unpricedCount = costs?.unpriced_models?.length ?? 0;
  const tokenCoverageValue = costs?.coverage?.token_coverage;
  const tokenCoverage =
    tokenCoverageValue === null || tokenCoverageValue === undefined
      ? null
      : Number(tokenCoverageValue);

  const statusLabel = (status: UsageResourceStatus): string => {
    if (status === 'disabled') return t('usage_stats.state_disabled');
    if (status === 'unsupported') return t('usage_stats.state_unsupported');
    if (status === 'error') return t('usage_stats.state_error');
    return '';
  };

  const statsCards: StatCardData[] = [
    {
      key: 'requests',
      label: t('usage_stats.total_requests'),
      icon: <IconSatellite size={16} />,
      accent: '#8b8680',
      accentSoft: 'rgba(139, 134, 128, 0.18)',
      accentBorder: 'rgba(139, 134, 128, 0.35)',
      value: loading ? '-' : (usage?.total_requests ?? 0).toLocaleString(),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            <span className={styles.statMetaDot} style={{ backgroundColor: '#10b981' }} />
            {t('usage_stats.success_requests')}: {loading ? '-' : (usage?.success_count ?? 0)}
          </span>
          <span className={styles.statMetaItem}>
            <span className={styles.statMetaDot} style={{ backgroundColor: '#c65746' }} />
            {t('usage_stats.failed_requests')}: {loading ? '-' : (usage?.failure_count ?? 0)}
          </span>
        </>
      ),
      trend: sparklines.requests,
    },
    {
      key: 'tokens',
      label: t('usage_stats.total_tokens'),
      icon: <IconDiamond size={16} />,
      accent: '#8b5cf6',
      accentSoft: 'rgba(139, 92, 246, 0.18)',
      accentBorder: 'rgba(139, 92, 246, 0.35)',
      value: loading ? '-' : formatCompactNumber(usage?.total_tokens ?? 0),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.cached_tokens')}: {formatCompactNumber(cachedTokens)}
          </span>
          <span className={styles.statMetaItem}>
            {t('usage_stats.reasoning_tokens')}: {formatCompactNumber(reasoningTokens)}
          </span>
          <span className={styles.statMetaItem}>
            {t('usage_stats.cache_creation_tokens')}: {formatCompactNumber(cacheCreationTokens)}
          </span>
          {statusLabel(tokensResource.status) && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {statusLabel(tokensResource.status)}
            </span>
          )}
        </>
      ),
      trend: sparklines.tokens,
    },
    {
      key: 'rpm',
      label: t('usage_stats.rpm_30m'),
      icon: <IconTimer size={16} />,
      accent: '#22c55e',
      accentSoft: 'rgba(34, 197, 94, 0.18)',
      accentBorder: 'rgba(34, 197, 94, 0.32)',
      value: rateLoading ? '-' : formatPerMinuteValue(Number(rates?.rpm) || 0),
      meta: (
        <span className={styles.statMetaItem}>
          {statusLabel(ratesResource.status) ||
            `${t('usage_stats.total_requests')}: ${(rates?.request_count ?? 0).toLocaleString()}`}
        </span>
      ),
      trend: sparklines.rpm,
    },
    {
      key: 'tpm',
      label: t('usage_stats.tpm_30m'),
      icon: <IconTrendingUp size={16} />,
      accent: '#f97316',
      accentSoft: 'rgba(249, 115, 22, 0.18)',
      accentBorder: 'rgba(249, 115, 22, 0.32)',
      value: rateLoading ? '-' : formatPerMinuteValue(Number(rates?.tpm) || 0),
      meta: (
        <span className={styles.statMetaItem}>
          {statusLabel(ratesResource.status) ||
            `${t('usage_stats.total_tokens')}: ${formatCompactNumber(rates?.token_count ?? 0)}`}
        </span>
      ),
      trend: sparklines.tpm,
    },
    {
      key: 'cost',
      label: t('usage_stats.total_cost'),
      icon: <IconDollarSign size={16} />,
      accent: '#f59e0b',
      accentSoft: 'rgba(245, 158, 11, 0.18)',
      accentBorder: 'rgba(245, 158, 11, 0.32)',
      value: costLoading ? '-' : costUnavailable ? '--' : formatUsd(moneyAmount(costs)),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {statusLabel(costsResource.status) ||
              `${t('usage_stats.cost_coverage')}: ${
                tokenCoverage !== null && Number.isFinite(tokenCoverage)
                  ? `${(tokenCoverage * 100).toFixed(1)}%`
                  : '--'
              }`}
          </span>
          {unpricedCount > 0 && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {t('usage_stats.unpriced_models_count', { count: unpricedCount })}
            </span>
          )}
        </>
      ),
      trend: costUnavailable ? null : sparklines.cost,
    },
  ];

  return (
    <div className={styles.statsGrid}>
      {statsCards.map((card) => (
        <div
          key={card.key}
          className={styles.statCard}
          style={
            {
              '--accent': card.accent,
              '--accent-soft': card.accentSoft,
              '--accent-border': card.accentBorder,
            } as CSSProperties
          }
        >
          <div className={styles.statCardHeader}>
            <div className={styles.statLabelGroup}>
              <span className={styles.statLabel}>{card.label}</span>
            </div>
            <span className={styles.statIconBadge}>{card.icon}</span>
          </div>
          <div className={styles.statValue}>{card.value}</div>
          {card.meta && <div className={styles.statMetaRow}>{card.meta}</div>}
          <div className={styles.statTrend}>
            {card.trend ? (
              <Line
                className={styles.sparkline}
                data={card.trend.data}
                options={sparklineOptions}
              />
            ) : (
              <div className={styles.statTrendPlaceholder} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
