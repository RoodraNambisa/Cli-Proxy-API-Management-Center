import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usageApi } from '@/services/api/usage';
import type { UsageAuthSummary } from '@/types';
import { formatCompactNumber, normalizeAuthIndex } from '@/utils/usage';
import styles from '@/pages/UsagePage.module.scss';

export interface CredentialStatsCardProps {
  authUsage: UsageAuthSummary[];
  loading: boolean;
}

type AuthModelState = {
  loading: boolean;
  error: string;
  models: UsageAuthSummary[];
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  Number((error as { status?: unknown }).status) === 404;

const getAuthIndex = (auth: UsageAuthSummary): string | null =>
  normalizeAuthIndex(auth.auth_index ?? auth.authIndex);

const getAuthKey = (auth: UsageAuthSummary, index: number): string =>
  getAuthIndex(auth) ?? auth.id ?? auth.name ?? `auth-${index}`;

const getAuthLabel = (auth: UsageAuthSummary): string =>
  String(
    auth.label ?? auth.name ?? auth.email ?? auth.account ?? getAuthIndex(auth) ?? auth.id ?? '-'
  );

const getAuthType = (auth: UsageAuthSummary): string =>
  [auth.provider, auth.type, auth.account_type ?? auth.accountType, auth.stale ? 'stale' : '']
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join(' · ');

const getTotalTokens = (auth: UsageAuthSummary): number =>
  Math.max(toNumber(auth.total_tokens), toNumber(auth.tokens?.total_tokens));

const getTokenBreakdownLabel = (auth: UsageAuthSummary, t: (key: string) => string): string => {
  const tokens = auth.tokens ?? {};
  const input = Math.max(toNumber(tokens.input_tokens), 0);
  const output = Math.max(toNumber(tokens.output_tokens), 0);
  const cached = Math.max(toNumber(tokens.cached_tokens), toNumber(tokens.cache_tokens), 0);
  const cacheCreation = Math.max(toNumber(tokens.cache_creation_tokens), 0);
  const reasoning = Math.max(toNumber(tokens.reasoning_tokens), 0);

  if (input + output + cached + cacheCreation + reasoning <= 0) {
    return '';
  }

  return [
    `${t('usage_stats.input_tokens')}: ${formatCompactNumber(input)}`,
    `${t('usage_stats.output_tokens')}: ${formatCompactNumber(output)}`,
    `${t('usage_stats.cached_tokens')}: ${formatCompactNumber(cached)}`,
    `${t('usage_stats.cache_creation_tokens')}: ${formatCompactNumber(cacheCreation)}`,
    `${t('usage_stats.reasoning_tokens')}: ${formatCompactNumber(reasoning)}`,
  ].join(' · ');
};

export function CredentialStatsCard({ authUsage, loading }: CredentialStatsCardProps) {
  const { t } = useTranslation();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [modelStateByKey, setModelStateByKey] = useState<Record<string, AuthModelState>>({});

  const rows = useMemo(
    () =>
      [...authUsage].sort((a, b) => {
        const totalDelta = toNumber(b.total_requests) - toNumber(a.total_requests);
        if (totalDelta !== 0) return totalDelta;
        return getAuthLabel(a).localeCompare(getAuthLabel(b));
      }),
    [authUsage]
  );

  const loadModels = async (auth: UsageAuthSummary, key: string) => {
    const authIndex = getAuthIndex(auth);
    if (!authIndex) return;

    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(key);
    if (modelStateByKey[key]?.models.length || modelStateByKey[key]?.loading) {
      return;
    }

    setModelStateByKey((prev) => ({
      ...prev,
      [key]: { loading: true, error: '', models: [] },
    }));

    try {
      await usageApi.getUsageAuth(authIndex);
      const response = await usageApi.getUsageAuthModels(authIndex);
      const models = Array.isArray(response.models) ? response.models : [];
      setModelStateByKey((prev) => ({
        ...prev,
        [key]: { loading: false, error: '', models },
      }));
    } catch (error: unknown) {
      const message = isNotFoundError(error)
        ? t('usage_stats.credential_not_found')
        : error instanceof Error
          ? error.message
          : t('usage_stats.loading_error');
      setModelStateByKey((prev) => ({
        ...prev,
        [key]: { loading: false, error: message, models: [] },
      }));
    }
  };

  return (
    <Card title={t('usage_stats.credential_stats')} className={styles.detailsFixedCard}>
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : rows.length > 0 ? (
        <div className={styles.detailsScroll}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.credential_name')}</th>
                  <th>{t('usage_stats.requests_count')}</th>
                  <th>{t('usage_stats.tokens_count')}</th>
                  <th>{t('usage_stats.success_rate')}</th>
                  <th>{t('usage_stats.credential_models')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const key = getAuthKey(row, index);
                  const success = Math.max(toNumber(row.success_count), 0);
                  const failure = Math.max(toNumber(row.failure_count), 0);
                  const total = Math.max(toNumber(row.total_requests), success + failure);
                  const successRate = total > 0 ? (success / total) * 100 : 100;
                  const totalTokens = getTotalTokens(row);
                  const tokenBreakdown = getTokenBreakdownLabel(row, t);
                  const isExpanded = expandedKey === key;
                  const modelState = modelStateByKey[key];

                  return (
                    <Fragment key={key}>
                      <tr>
                        <td className={styles.modelCell}>
                          <span>{getAuthLabel(row)}</span>
                          {getAuthType(row) && (
                            <span className={styles.credentialType}>{getAuthType(row)}</span>
                          )}
                          {row.stale && (
                            <span className={styles.credentialStale}>
                              {t('usage_stats.credential_stale')}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={styles.requestCountCell}>
                            <span>{formatCompactNumber(total)}</span>
                            <span className={styles.requestBreakdown}>
                              (
                              <span className={styles.statSuccess}>{success.toLocaleString()}</span>{' '}
                              <span className={styles.statFailure}>{failure.toLocaleString()}</span>
                              )
                            </span>
                          </span>
                        </td>
                        <td title={tokenBreakdown || undefined}>
                          {formatCompactNumber(totalTokens)}
                          {tokenBreakdown && (
                            <span className={styles.tokenBreakdownInline}>{tokenBreakdown}</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              successRate >= 95
                                ? styles.statSuccess
                                : successRate >= 80
                                  ? styles.statNeutral
                                  : styles.statFailure
                            }
                          >
                            {successRate.toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void loadModels(row, key)}
                            disabled={!getAuthIndex(row) || modelState?.loading}
                          >
                            {modelState?.loading
                              ? t('common.loading')
                              : isExpanded
                                ? t('usage_stats.credential_models_hide')
                                : t('usage_stats.credential_models_show')}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${key}-models`}>
                          <td colSpan={5} className={styles.credentialModelsCell}>
                            {modelState?.loading ? (
                              <div className={styles.hint}>{t('common.loading')}</div>
                            ) : modelState?.error ? (
                              <div className={styles.errorBox}>{modelState.error}</div>
                            ) : modelState?.models.length ? (
                              <div className={styles.credentialModelsList}>
                                {modelState.models.map((model, modelIndex) => {
                                  const modelName = String(
                                    model.model ?? model.name ?? model.label ?? '-'
                                  );
                                  const modelSuccess = Math.max(toNumber(model.success_count), 0);
                                  const modelFailure = Math.max(toNumber(model.failure_count), 0);
                                  const modelTotal = Math.max(
                                    toNumber(model.total_requests),
                                    modelSuccess + modelFailure
                                  );
                                  return (
                                    <div
                                      key={`${key}-${modelName}-${modelIndex}`}
                                      className={styles.credentialModelRow}
                                    >
                                      <span className={styles.modelName}>{modelName}</span>
                                      <span>
                                        {formatCompactNumber(modelTotal)} ·{' '}
                                        <span className={styles.statSuccess}>
                                          {modelSuccess.toLocaleString()}
                                        </span>{' '}
                                        <span className={styles.statFailure}>
                                          {modelFailure.toLocaleString()}
                                        </span>
                                      </span>
                                      <span>{formatCompactNumber(getTotalTokens(model))}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className={styles.hint}>
                                {t('usage_stats.credential_models_empty')}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
