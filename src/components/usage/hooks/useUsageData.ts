import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi } from '@/services/api/usage';
import { useNotificationStore } from '@/stores';
import type {
  UsageAuthsQuery,
  UsageAuthSummary,
  UsageCostsResponse,
  UsageFailureSummary,
  UsageHealthResponse,
  UsageMeta,
  UsageModelPrices,
  UsagePricesResponse,
  UsageRangeQuery,
  UsageRatesResponse,
  UsageTokensResponse,
} from '@/types';
import { downloadBlob } from '@/utils/download';
import { buildUsageRangeForTimeRange, loadModelPrices, type UsageTimeRange } from '@/utils/usage';

export interface UsagePayload {
  version?: string | number;
  enabled?: boolean;
  available?: boolean;
  as_of?: string;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: Record<string, unknown>;
  apis?: Record<string, unknown>;
  models?: Record<string, unknown>;
  [key: string]: unknown;
}

export type UsageResourceStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'disabled'
  | 'unsupported'
  | 'error';

export interface UsageResource<T> {
  status: UsageResourceStatus;
  data: T | null;
  error: string;
}

export interface UsageQuerySnapshot {
  asOf: string;
  range: UsageRangeQuery;
  aggregateBucket: 'hour' | 'day';
}

export interface UsageAuthQueryState {
  page: number;
  pageSize: number;
  search: string;
  sortBy: NonNullable<UsageAuthsQuery['sort_by']>;
  sortOrder: 'asc' | 'desc';
}

export interface UsageAuthPagination {
  serverSide: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type UsageCapability =
  | 'meta'
  | 'summary'
  | 'auths'
  | 'health'
  | 'failures'
  | 'rates'
  | 'tokens'
  | 'costs'
  | 'prices';

const HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_AUTH_PAGE_SIZE = 50;

const emptyResource = <T>(): UsageResource<T> => ({
  status: 'idle',
  data: null,
  error: '',
});

const loadingResource = <T>(current: UsageResource<T>): UsageResource<T> => ({
  status: 'loading',
  data: current.data,
  error: '',
});

const terminalResource = <T>(
  status: Extract<UsageResourceStatus, 'disabled' | 'unsupported'>
): UsageResource<T> => ({ status, data: null, error: '' });

const errorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
};

const isAbortError = (error: unknown): boolean =>
  Boolean(
    error &&
    typeof error === 'object' &&
    ('code' in error || 'name' in error) &&
    ((error as { code?: unknown }).code === 'ERR_CANCELED' ||
      (error as { name?: unknown }).name === 'AbortError')
  );

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : '';

const readUsageEnvelope = (response: unknown): UsagePayload => {
  if (!response || typeof response !== 'object') return {};
  const record = response as Record<string, unknown>;
  const value =
    record.usage && typeof record.usage === 'object'
      ? (record.usage as Record<string, unknown>)
      : record;
  const usage: UsagePayload = { ...value };
  if (usage.failure_count === undefined && typeof record.failed_requests === 'number') {
    usage.failure_count = record.failed_requests;
  }
  return usage;
};

const hasLegacyPrices = (): boolean => Object.keys(loadModelPrices()).length > 0;

const resourceStatusForData = <T>(data: T, isEmpty: (value: T) => boolean): UsageResource<T> => ({
  status: isEmpty(data) ? 'empty' : 'ready',
  data,
  error: '',
});

const readAuthIndex = (auth: UsageAuthSummary): string =>
  String(auth.auth_index ?? auth.authIndex ?? auth.id ?? '');

const readAuthLabel = (auth: UsageAuthSummary): string =>
  String(auth.label ?? auth.name ?? auth.email ?? auth.account ?? readAuthIndex(auth));

const readAuthStatus = (auth: UsageAuthSummary): string => {
  if (auth.stale) return 'stale';
  if (auth.disabled) return 'disabled';
  return String(auth.status ?? 'enabled');
};

const compareAuths = (
  left: UsageAuthSummary,
  right: UsageAuthSummary,
  sortBy: UsageAuthQueryState['sortBy']
): number => {
  const numberValue = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  switch (sortBy) {
    case 'name':
      return readAuthLabel(left).localeCompare(readAuthLabel(right));
    case 'provider':
      return String(left.provider ?? '').localeCompare(String(right.provider ?? ''));
    case 'status':
      return readAuthStatus(left).localeCompare(readAuthStatus(right));
    case 'total_requests':
      return numberValue(left.total_requests) - numberValue(right.total_requests);
    case 'total_tokens':
      return numberValue(left.total_tokens) - numberValue(right.total_tokens);
    case 'last_used_at': {
      const leftTime = Date.parse(String(left.last_used_at ?? ''));
      const rightTime = Date.parse(String(right.last_used_at ?? ''));
      return (
        (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0)
      );
    }
    default:
      return readAuthIndex(left).localeCompare(readAuthIndex(right));
  }
};

const paginateLegacyAuths = (
  auths: UsageAuthSummary[],
  query: UsageAuthQueryState
): { auths: UsageAuthSummary[]; pagination: UsageAuthPagination } => {
  const search = query.search.trim().toLowerCase();
  const filtered = search
    ? auths.filter((auth) =>
        [
          readAuthIndex(auth),
          readAuthLabel(auth),
          auth.provider,
          auth.type,
          auth.account_type ?? auth.accountType,
          readAuthStatus(auth),
        ].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(search)
        )
      )
    : [...auths];
  filtered.sort((left, right) => {
    const comparison = compareAuths(left, right, query.sortBy);
    if (comparison !== 0) return query.sortOrder === 'desc' ? -comparison : comparison;
    return readAuthIndex(left).localeCompare(readAuthIndex(right));
  });
  const total = filtered.length;
  const totalPages = total > 0 ? Math.ceil(total / query.pageSize) : 0;
  const page = totalPages > 0 ? Math.min(query.page, totalPages) : 1;
  const start = (page - 1) * query.pageSize;
  return {
    auths: filtered.slice(start, start + query.pageSize),
    pagination: {
      serverSide: false,
      page,
      pageSize: query.pageSize,
      total,
      totalPages,
    },
  };
};

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  usageMeta: UsageMeta | null;
  authUsage: UsageAuthSummary[];
  summaryResource: UsageResource<UsagePayload>;
  authResource: UsageResource<UsageAuthSummary[]>;
  authQuery: UsageAuthQueryState;
  authPagination: UsageAuthPagination;
  healthResource: UsageResource<UsageHealthResponse>;
  failureResource: UsageResource<UsageFailureSummary>;
  ratesResource: UsageResource<UsageRatesResponse>;
  tokensResource: UsageResource<UsageTokensResponse>;
  costsResource: UsageResource<UsageCostsResponse>;
  pricesResource: UsageResource<UsagePricesResponse>;
  querySnapshot: UsageQuerySnapshot;
  loading: boolean;
  authUsageLoading: boolean;
  setAuthPage: (page: number) => void;
  setAuthPageSize: (pageSize: number) => void;
  setAuthSearch: (search: string) => void;
  setAuthSort: (
    sortBy: UsageAuthQueryState['sortBy'],
    sortOrder: UsageAuthQueryState['sortOrder']
  ) => void;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: UsageModelPrices;
  legacyPriceImportAvailable: boolean;
  loadUsage: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleClearUsage: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
  clearing: boolean;
}

export interface UseUsageDataOptions {
  timeRange: UsageTimeRange;
}

export function useUsageData({ timeRange }: UseUsageDataOptions): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const [summaryResource, setSummaryResource] =
    useState<UsageResource<UsagePayload>>(emptyResource);
  const [authResource, setAuthResource] =
    useState<UsageResource<UsageAuthSummary[]>>(emptyResource);
  const [authQuery, setAuthQuery] = useState<UsageAuthQueryState>({
    page: 1,
    pageSize: DEFAULT_AUTH_PAGE_SIZE,
    search: '',
    sortBy: 'total_requests',
    sortOrder: 'desc',
  });
  const [authPagination, setAuthPagination] = useState<UsageAuthPagination>({
    serverSide: true,
    page: 1,
    pageSize: DEFAULT_AUTH_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [healthResource, setHealthResource] =
    useState<UsageResource<UsageHealthResponse>>(emptyResource);
  const [failureResource, setFailureResource] =
    useState<UsageResource<UsageFailureSummary>>(emptyResource);
  const [ratesResource, setRatesResource] =
    useState<UsageResource<UsageRatesResponse>>(emptyResource);
  const [tokensResource, setTokensResource] =
    useState<UsageResource<UsageTokensResponse>>(emptyResource);
  const [costsResource, setCostsResource] =
    useState<UsageResource<UsageCostsResponse>>(emptyResource);
  const [pricesResource, setPricesResource] =
    useState<UsageResource<UsagePricesResponse>>(emptyResource);
  const [usageMeta, setUsageMeta] = useState<UsageMeta | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [legacyPriceImportAvailable, setLegacyPriceImportAvailable] = useState(false);
  const [querySnapshot, setQuerySnapshot] = useState<UsageQuerySnapshot>(() => {
    const asOfMs = Date.now();
    const asOf = new Date(asOfMs).toISOString();
    return {
      asOf,
      range: { ...buildUsageRangeForTimeRange(timeRange, asOfMs), to: asOf },
      aggregateBucket: timeRange === '7d' || timeRange === 'all' ? 'day' : 'hour',
    };
  });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const authRequestControllerRef = useRef<AbortController | null>(null);
  const authQueryRef = useRef(authQuery);
  const querySnapshotRef = useRef(querySnapshot);
  const usageAvailableRef = useRef(false);
  const unsupportedCapabilitiesRef = useRef<Set<UsageCapability>>(new Set());
  const summaryCacheRef = useRef<{
    version: string;
    rangeKey: string;
    data: UsagePayload;
  } | null>(null);

  const requestResource = useCallback(
    async <T>(
      capability: UsageCapability,
      request: () => Promise<T>,
      isEmpty: (value: T) => boolean
    ): Promise<UsageResource<T>> => {
      if (unsupportedCapabilitiesRef.current.has(capability)) {
        return terminalResource('unsupported');
      }
      try {
        const data = await request();
        return resourceStatusForData(data, isEmpty);
      } catch (error: unknown) {
        if (isAbortError(error)) throw error;
        if (errorStatus(error) === 404) {
          unsupportedCapabilitiesRef.current.add(capability);
          return terminalResource('unsupported');
        }
        return { status: 'error', data: null, error: errorMessage(error) };
      }
    },
    []
  );

  const loadAuthPage = useCallback(
    async (range: UsageRangeQuery, query: UsageAuthQueryState, parentSignal?: AbortSignal) => {
      authRequestControllerRef.current?.abort();
      const controller = new AbortController();
      authRequestControllerRef.current = controller;
      const abortFromParent = () => controller.abort();
      parentSignal?.addEventListener('abort', abortFromParent, { once: true });
      setAuthResource((current) => loadingResource(current));

      try {
        const result = await requestResource(
          'auths',
          () =>
            usageApi.getUsageAuths(
              {
                ...range,
                paged: true,
                page: query.page,
                page_size: query.pageSize,
                q: query.search,
                sort_by: query.sortBy,
                sort_order: query.sortOrder,
              },
              { signal: controller.signal }
            ),
          (response) => (response.auths ?? []).length === 0
        );
        if (controller.signal.aborted) return;
        if (!result.data) {
          setAuthResource({ status: result.status, data: null, error: result.error });
          return;
        }

        const rows = result.data.auths ?? [];
        const serverPagination = result.data.pagination;
        if (serverPagination?.enabled) {
          const page = Math.max(1, Number(serverPagination.page) || query.page);
          const pageSize = Math.max(1, Number(serverPagination.page_size) || query.pageSize);
          const total = Math.max(0, Number(result.data.total) || 0);
          const totalPages = Math.max(0, Number(serverPagination.total_pages) || 0);
          setAuthResource(resourceStatusForData(rows, (items) => items.length === 0));
          setAuthPagination({ serverSide: true, page, pageSize, total, totalPages });
          if (page !== authQueryRef.current.page) {
            authQueryRef.current = { ...authQueryRef.current, page };
            setAuthQuery(authQueryRef.current);
          }
          return;
        }

        const legacy = paginateLegacyAuths(rows, query);
        setAuthResource(resourceStatusForData(legacy.auths, (items) => items.length === 0));
        setAuthPagination(legacy.pagination);
        if (legacy.pagination.page !== authQueryRef.current.page) {
          authQueryRef.current = { ...authQueryRef.current, page: legacy.pagination.page };
          setAuthQuery(authQueryRef.current);
        }
      } catch (error: unknown) {
        if (!isAbortError(error)) {
          setAuthResource({ status: 'error', data: null, error: errorMessage(error) });
        }
      } finally {
        parentSignal?.removeEventListener('abort', abortFromParent);
        if (authRequestControllerRef.current === controller) {
          authRequestControllerRef.current = null;
        }
      }
    },
    [requestResource]
  );

  const updateAuthQuery = useCallback(
    (next: UsageAuthQueryState) => {
      authQueryRef.current = next;
      setAuthQuery(next);
      if (usageAvailableRef.current) {
        void loadAuthPage(querySnapshotRef.current.range, next);
      }
    },
    [loadAuthPage]
  );

  const setAuthPage = useCallback(
    (page: number) => {
      const maxPage = Math.max(1, authPagination.totalPages || 1);
      updateAuthQuery({ ...authQueryRef.current, page: Math.min(Math.max(1, page), maxPage) });
    },
    [authPagination.totalPages, updateAuthQuery]
  );

  const setAuthPageSize = useCallback(
    (pageSize: number) => {
      const normalized = Math.min(100, Math.max(1, Math.floor(pageSize)));
      updateAuthQuery({ ...authQueryRef.current, page: 1, pageSize: normalized });
    },
    [updateAuthQuery]
  );

  const setAuthSearch = useCallback(
    (search: string) => {
      updateAuthQuery({ ...authQueryRef.current, page: 1, search: search.trim() });
    },
    [updateAuthQuery]
  );

  const setAuthSort = useCallback(
    (sortBy: UsageAuthQueryState['sortBy'], sortOrder: UsageAuthQueryState['sortOrder']) => {
      updateAuthQuery({ ...authQueryRef.current, page: 1, sortBy, sortOrder });
    },
    [updateAuthQuery]
  );

  const refresh = useCallback(
    async (force: boolean) => {
      requestControllerRef.current?.abort();
      authRequestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;

      const asOfMs = Date.now();
      const asOf = new Date(asOfMs).toISOString();
      const range = { ...buildUsageRangeForTimeRange(timeRange, asOfMs), to: asOf };
      const aggregateBucket = timeRange === '7d' || timeRange === 'all' ? 'day' : 'hour';
      const snapshot: UsageQuerySnapshot = { asOf, range, aggregateBucket };
      const healthRange = {
        from: new Date(asOfMs - HEALTH_WINDOW_MS).toISOString(),
        to: asOf,
      };
      const rangeKey = `${range.from || ''}::${range.to || ''}`;
      setQuerySnapshot(snapshot);
      querySnapshotRef.current = snapshot;
      usageAvailableRef.current = false;
      setSummaryResource((current) => loadingResource(current));
      setAuthResource((current) => loadingResource(current));
      setHealthResource((current) => loadingResource(current));
      setFailureResource((current) => loadingResource(current));
      setRatesResource((current) => loadingResource(current));
      setTokensResource((current) => loadingResource(current));
      setCostsResource((current) => loadingResource(current));
      setPricesResource((current) => loadingResource(current));

      const pricesTask = requestResource(
        'prices',
        () => usageApi.getUsagePrices({ signal: controller.signal }),
        (response) => Object.keys(response.models ?? {}).length === 0
      )
        .then((pricesResult) => {
          if (controller.signal.aborted) return;
          setPricesResource(pricesResult);
          setLegacyPriceImportAvailable(pricesResult.status === 'empty' && hasLegacyPrices());
        })
        .catch((error: unknown) => {
          if (!isAbortError(error) && !controller.signal.aborted) {
            setPricesResource({ status: 'error', data: null, error: errorMessage(error) });
          }
        });

      const metaResult = await requestResource(
        'meta',
        () => usageApi.getUsageMeta({ signal: controller.signal }),
        () => false
      );
      if (controller.signal.aborted) return;

      if (metaResult.status === 'unsupported') {
        setUsageMeta(null);
        setSummaryResource(terminalResource('unsupported'));
        setAuthResource(terminalResource('unsupported'));
        setHealthResource(terminalResource('unsupported'));
        setFailureResource(terminalResource('unsupported'));
        setRatesResource(terminalResource('unsupported'));
        setTokensResource(terminalResource('unsupported'));
        setCostsResource(terminalResource('unsupported'));
        await pricesTask;
        setLastRefreshedAt(new Date(asOfMs));
        return;
      }
      if (metaResult.status === 'error') {
        setSummaryResource({ status: 'error', data: null, error: metaResult.error });
        setAuthResource({ status: 'error', data: null, error: metaResult.error });
        setHealthResource({ status: 'error', data: null, error: metaResult.error });
        setFailureResource({ status: 'error', data: null, error: metaResult.error });
        setRatesResource({ status: 'error', data: null, error: metaResult.error });
        setTokensResource({ status: 'error', data: null, error: metaResult.error });
        setCostsResource({ status: 'error', data: null, error: metaResult.error });
        await pricesTask;
        return;
      }

      const meta = readUsageEnvelope(metaResult.data) as UsageMeta;
      setUsageMeta(meta);
      if (meta.enabled === false) {
        setSummaryResource(terminalResource('disabled'));
        setAuthResource(terminalResource('disabled'));
        setHealthResource(terminalResource('disabled'));
        setFailureResource(terminalResource('disabled'));
        setRatesResource(terminalResource('disabled'));
        setTokensResource(terminalResource('disabled'));
        setCostsResource(terminalResource('disabled'));
        await pricesTask;
        setLastRefreshedAt(new Date(asOfMs));
        return;
      }
      if (meta.available === false) {
        const message = t('usage_stats.state_unavailable');
        setSummaryResource({ status: 'error', data: null, error: message });
        setAuthResource({ status: 'error', data: null, error: message });
        setHealthResource({ status: 'error', data: null, error: message });
        setFailureResource({ status: 'error', data: null, error: message });
        setRatesResource({ status: 'error', data: null, error: message });
        setTokensResource({ status: 'error', data: null, error: message });
        setCostsResource({ status: 'error', data: null, error: message });
        await pricesTask;
        setLastRefreshedAt(new Date(asOfMs));
        return;
      }
      usageAvailableRef.current = true;

      const version = String(meta.version ?? '');
      const cachedSummary = summaryCacheRef.current;
      const canReuseSummary =
        !force &&
        Boolean(version) &&
        cachedSummary?.version === version &&
        cachedSummary.rangeKey === rangeKey;

      const summaryPromise = canReuseSummary
        ? Promise.resolve(
            resourceStatusForData(cachedSummary.data, (value) => (value.total_requests ?? 0) === 0)
          )
        : requestResource(
            'summary',
            () =>
              usageApi.getUsageSummary(
                { ...range, include_sources: false },
                { signal: controller.signal }
              ),
            (response) => (readUsageEnvelope(response).total_requests ?? 0) === 0
          ).then((result) => {
            if (result.data) {
              const data = { ...meta, ...readUsageEnvelope(result.data) };
              summaryCacheRef.current = { version, rangeKey, data };
              return { ...result, data };
            }
            return result as UsageResource<UsagePayload>;
          });

      const applyResource = async <T>(
        promise: Promise<UsageResource<T>>,
        setter: Dispatch<SetStateAction<UsageResource<T>>>
      ) => {
        try {
          const result = await promise;
          if (!controller.signal.aborted) setter(result);
        } catch (error: unknown) {
          if (!isAbortError(error) && !controller.signal.aborted) {
            setter({ status: 'error', data: null, error: errorMessage(error) });
          }
        }
      };

      const tasks = [
        applyResource(summaryPromise, setSummaryResource),
        loadAuthPage(range, authQueryRef.current, controller.signal),
        applyResource(
          requestResource(
            'failures',
            () => usageApi.getUsageFailureSummary(range, { signal: controller.signal }),
            (response) => !response.failures || Number(response.failures.total) <= 0
          ).then((result) =>
            result.data
              ? { ...result, data: result.data.failures ?? null }
              : { status: result.status, data: null, error: result.error }
          ),
          setFailureResource
        ),
        applyResource(
          requestResource(
            'health',
            () =>
              usageApi.getUsageHealth(
                { ...healthRange, bucket: '15m', group_by: 'none' },
                { signal: controller.signal }
              ),
            (response) => !(response.items ?? []).some((item) => Number(item.requests) > 0)
          ),
          setHealthResource
        ),
        applyResource(
          requestResource(
            'rates',
            () =>
              usageApi.getUsageRates(
                { window_minutes: 30, sparkline_minutes: 60 },
                { signal: controller.signal }
              ),
            (response) => Number(response.request_count) <= 0 && Number(response.token_count) <= 0
          ),
          setRatesResource
        ),
        applyResource(
          requestResource(
            'tokens',
            () =>
              usageApi.getUsageTokens(
                { ...range, bucket: aggregateBucket, group_by: 'none' },
                { signal: controller.signal }
              ),
            (response) => Number(response.total_tokens) <= 0
          ),
          setTokensResource
        ),
        applyResource(
          requestResource(
            'costs',
            () =>
              usageApi.getUsageCosts(
                { ...range, bucket: aggregateBucket },
                { signal: controller.signal }
              ),
            (response) =>
              Number(response.total?.amount_micros) === 0 &&
              (response.by_model ?? []).length === 0 &&
              (response.unpriced_models ?? []).length === 0
          ),
          setCostsResource
        ),
        pricesTask,
      ];

      await Promise.all(tasks);
      if (!controller.signal.aborted) setLastRefreshedAt(new Date(asOfMs));
    },
    [loadAuthPage, requestResource, t, timeRange]
  );

  const loadUsage = useCallback(() => refresh(true), [refresh]);

  useEffect(() => {
    void refresh(false).catch((error: unknown) => {
      if (!isAbortError(error)) {
        setSummaryResource({ status: 'error', data: null, error: errorMessage(error) });
      }
    });
    return () => {
      requestControllerRef.current?.abort();
      authRequestControllerRef.current?.abort();
    };
  }, [refresh]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' }),
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (error: unknown) {
      const message = errorMessage(error);
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => importInputRef.current?.click();

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }
      const result = await usageApi.importUsage(payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0,
        }),
        'success'
      );
      await loadUsage();
    } catch (error: unknown) {
      const message = errorMessage(error);
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleClearUsage = useCallback(() => {
    showConfirmation({
      title: t('usage_stats.clear_confirm_title'),
      message: t('usage_stats.clear_confirm_message'),
      variant: 'danger',
      confirmText: t('usage_stats.clear_confirm_button'),
      onConfirm: async () => {
        setClearing(true);
        try {
          const result = await usageApi.clearUsage();
          summaryCacheRef.current = null;
          await loadUsage();
          showNotification(
            t('usage_stats.clear_success', {
              total: result?.total_requests_before ?? 0,
              failed: result?.failed_requests_before ?? result?.failure_count_before ?? 0,
              tokens: result?.total_tokens_before ?? 0,
            }),
            'success'
          );
        } catch (error: unknown) {
          const message = errorMessage(error);
          showNotification(
            `${t('usage_stats.clear_failed')}${message ? `: ${message}` : ''}`,
            'error'
          );
        } finally {
          setClearing(false);
        }
      },
    });
  }, [loadUsage, showConfirmation, showNotification, t]);

  const usage = summaryResource.data;
  const authUsage = authResource.data ?? [];
  const modelPrices = pricesResource.data?.models ?? {};
  const loading = summaryResource.status === 'loading';
  const authUsageLoading = authResource.status === 'loading';

  return {
    usage,
    usageMeta,
    authUsage,
    summaryResource,
    authResource,
    authQuery,
    authPagination,
    healthResource,
    failureResource,
    ratesResource,
    tokensResource,
    costsResource,
    pricesResource,
    querySnapshot,
    loading,
    authUsageLoading,
    setAuthPage,
    setAuthPageSize,
    setAuthSearch,
    setAuthSort,
    error: summaryResource.status === 'error' ? summaryResource.error : '',
    lastRefreshedAt,
    modelPrices,
    legacyPriceImportAvailable,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    handleClearUsage,
    importInputRef,
    exporting,
    importing,
    clearing,
  };
}
