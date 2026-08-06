import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usageApi } from '@/services/api/usage';
import type { UsageAuthSummary } from '@/types';
import { formatCompactNumber, normalizeAuthIndex } from '@/utils/usage';
import styles from '@/pages/UsagePage.module.scss';
import type { UsageAuthPagination, UsageAuthQueryState } from './hooks/useUsageData';

export interface CredentialStatsCardProps {
  authUsage: UsageAuthSummary[];
  loading: boolean;
  error?: string;
  query: UsageAuthQueryState;
  pagination: UsageAuthPagination;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (
    sortBy: UsageAuthQueryState['sortBy'],
    sortOrder: UsageAuthQueryState['sortOrder']
  ) => void;
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

export function CredentialStatsCard({
  authUsage,
  loading,
  error = '',
  query,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onSortChange,
}: CredentialStatsCardProps) {
  const { t } = useTranslation();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [modelStateByKey, setModelStateByKey] = useState<Record<string, AuthModelState>>({});
  const [searchInput, setSearchInput] = useState(query.search);
  const rows = authUsage;

  useEffect(() => {
    if (searchInput.trim() === query.search) return;
    const timer = window.setTimeout(() => onSearchChange(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [onSearchChange, query.search, searchInput]);

  const sortOptions = useMemo(
    () => [
      { value: 'total_requests:desc', label: t('usage_stats.credential_sort_requests_desc') },
      { value: 'total_tokens:desc', label: t('usage_stats.credential_sort_tokens_desc') },
      { value: 'last_used_at:desc', label: t('usage_stats.credential_sort_recent') },
      { value: 'name:asc', label: t('usage_stats.credential_sort_name') },
      { value: 'auth_index:asc', label: t('usage_stats.credential_sort_index') },
    ],
    [t]
  );
  const pageSizeOptions = useMemo(
    () =>
      Array.from(new Set([query.pageSize, 25, 50, 100]))
        .sort((left, right) => left - right)
        .map((value) => ({ value: String(value), label: String(value) })),
    [query.pageSize]
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

  const sortValue = `${query.sortBy}:${query.sortOrder}`;
  const pageCount = Math.max(1, pagination.totalPages || 1);

  return (
    <Card
      title={t('usage_stats.credential_stats')}
      extra={
        <span className={styles.credentialTotal}>
          {t('usage_stats.credential_total', { count: pagination.total })}
        </span>
      }
      className={styles.detailsFixedCard}
    >
      <div className={styles.credentialToolbar}>
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('usage_stats.credential_search_placeholder')}
          aria-label={t('usage_stats.credential_search_label')}
        />
        <Select
          value={sortValue}
          options={sortOptions}
          onChange={(value) => {
            const [sortBy, sortOrder] = value.split(':');
            onSortChange(
              sortBy as UsageAuthQueryState['sortBy'],
              sortOrder as UsageAuthQueryState['sortOrder']
            );
          }}
          ariaLabel={t('usage_stats.credential_sort_label')}
          className={styles.credentialSelect}
        />
        <Select
          value={String(query.pageSize)}
          options={pageSizeOptions}
          onChange={(value) => onPageSizeChange(Number(value))}
          ariaLabel={t('usage_stats.credential_page_size')}
          className={styles.credentialPageSize}
          fullWidth={false}
        />
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      {loading && rows.length === 0 ? (
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
      <div className={styles.credentialPagination}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={loading || pagination.page <= 1}
        >
          {t('usage_stats.credential_page_prev')}
        </Button>
        <span>
          {t('usage_stats.credential_page_info', {
            current: pagination.page,
            total: pageCount,
          })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={loading || pagination.page >= pageCount}
        >
          {t('usage_stats.credential_page_next')}
        </Button>
      </div>
    </Card>
  );
}
