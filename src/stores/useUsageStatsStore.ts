import { create } from 'zustand';
import { usageApi } from '@/services/api';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  UsageAuthSummary,
  UsageDetailsQuery,
  UsageDetailsResponse,
  UsageMeta,
  UsageRangeQuery,
} from '@/types';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  buildUsageRangeKey,
  collectUsageDetails,
  computeKeyStatsFromDetails,
  extractLatencyMs,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import i18n from '@/i18n';

export const USAGE_STATS_STALE_TIME_MS = 240_000;

export type LoadUsageStatsOptions = {
  force?: boolean;
  staleTimeMs?: number;
  range?: UsageRangeQuery;
};

export type LoadUsageDetailsOptions = {
  force?: boolean;
  query?: UsageDetailsQuery;
  append?: boolean;
};

export type LoadUsageAuthsOptions = {
  force?: boolean;
  staleTimeMs?: number;
  authIndexes?: Array<string | number>;
  range?: UsageRangeQuery;
};

type UsageStatsSnapshot = Record<string, unknown>;

export type UsageDetailsPage = {
  details: UsageDetail[];
  offset: number;
  limit: number;
  nextOffset: number | null;
  hasMore: boolean;
  totalMatched: number | null;
};

type UsageStatsState = {
  usage: UsageStatsSnapshot | null;
  usageMeta: UsageMeta | null;
  usageAuths: UsageAuthSummary[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  authsLoading: boolean;
  detailsLoading: boolean;
  error: string | null;
  authsError: string | null;
  detailsError: string | null;
  lastRefreshedAt: number | null;
  authsRefreshedAt: number | null;
  detailsRefreshedAt: number | null;
  detailsPage: UsageDetailsPage | null;
  scopeKey: string;
  usageRangeKey: string;
  authsRangeKey: string;
  authsIndexKey: string;
  loadUsageStats: (options?: LoadUsageStatsOptions) => Promise<void>;
  loadUsageDetails: (options?: LoadUsageDetailsOptions) => Promise<UsageDetailsPage>;
  loadUsageAuths: (options?: LoadUsageAuthsOptions) => Promise<UsageAuthSummary[]>;
  clearUsageStats: () => void;
};

const createEmptyKeyStats = (): KeyStats => ({ bySource: {}, byAuthIndex: {} });

let usageRequestToken = 0;
let detailsRequestToken = 0;
let authsRequestToken = 0;
let inFlightUsageRequest: {
  id: number;
  scopeKey: string;
  rangeKey: string;
  promise: Promise<void>;
} | null = null;

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : i18n.t('usage_stats.loading_error');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNotFoundError = (error: unknown): boolean =>
  isRecord(error) && (error.status === 404 || error.status === '404');

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getUsageEnvelopeData = (response: unknown): UsageStatsSnapshot | null => {
  const record = isRecord(response) ? response : null;
  const rawUsage = isRecord(record?.usage) ? record.usage : record;
  if (!rawUsage) return null;

  const usage: UsageStatsSnapshot = { ...rawUsage };
  if (typeof record?.failed_requests === 'number' && typeof usage.failure_count !== 'number') {
    usage.failure_count = record.failed_requests;
  }
  return usage;
};

const getUsageVersion = (usage: unknown): string | null => {
  const record = isRecord(usage) ? usage : null;
  const version = record?.version;
  if (version === undefined || version === null || version === '') return null;
  return String(version);
};

const extractAuthIndex = (auth: UsageAuthSummary): string | null =>
  normalizeAuthIndex(auth.auth_index ?? auth.authIndex);

const computeKeyStatsFromAuths = (auths: UsageAuthSummary[]): KeyStats => {
  const byAuthIndex: KeyStats['byAuthIndex'] = {};

  auths.forEach((auth) => {
    const authIndex = extractAuthIndex(auth);
    if (!authIndex) return;
    byAuthIndex[authIndex] = {
      success: Math.max(toNumber(auth.success_count), 0),
      failure: Math.max(toNumber(auth.failure_count), 0),
    };
  });

  return { bySource: {}, byAuthIndex };
};

const buildAuthsIndexKey = (authIndexes: Array<string | number> | undefined): string => {
  if (authIndexes === undefined) return '*';
  return Array.from(
    new Set(
      authIndexes
        .map((item) => normalizeAuthIndex(item))
        .filter((item): item is string => Boolean(item))
    )
  )
    .sort((a, b) => a.localeCompare(b))
    .join(',');
};

const normalizeAuthIndexes = (authIndexes: Array<string | number> | undefined): string[] =>
  authIndexes === undefined
    ? []
    : Array.from(
        new Set(
          authIndexes
            .map((item) => normalizeAuthIndex(item))
            .filter((item): item is string => Boolean(item))
        )
      );

const normalizeTokenNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const normalizeUsageDetail = (detail: unknown, index: number): UsageDetail => {
  const record = isRecord(detail) ? detail : {};
  const tokensRecord = isRecord(record.tokens) ? record.tokens : {};
  const timestamp =
    typeof record.timestamp === 'string'
      ? record.timestamp
      : typeof record.created_at === 'string'
        ? record.created_at
        : typeof record.time === 'string'
          ? record.time
          : '';
  const timestampMs = timestamp ? parseTimestampMs(timestamp) : 0;
  const modelName =
    typeof record.model === 'string'
      ? record.model
      : typeof record.model_name === 'string'
        ? record.model_name
        : typeof record.__modelName === 'string'
          ? record.__modelName
          : '';
  const endpoint =
    typeof record.api === 'string'
      ? record.api
      : typeof record.endpoint === 'string'
        ? record.endpoint
        : typeof record.__endpoint === 'string'
          ? record.__endpoint
          : '';
  const endpointMatch = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i);
  const endpointMethod =
    typeof record.method === 'string'
      ? record.method.toUpperCase()
      : typeof record.__endpointMethod === 'string'
        ? record.__endpointMethod
        : endpointMatch?.[1]?.toUpperCase();
  const endpointPath =
    typeof record.path === 'string'
      ? record.path
      : typeof record.__endpointPath === 'string'
        ? record.__endpointPath
        : endpointMatch?.[2];
  const latencyMs = extractLatencyMs(record);
  const statusCode = toNumber(record.status ?? record.status_code);
  const failed =
    record.failed === true ||
    record.success === false ||
    (Number.isFinite(statusCode) && statusCode >= 400);

  return {
    timestamp,
    source: normalizeUsageSourceId(record.source),
    auth_index: (record.auth_index ?? record.authIndex ?? record.AuthIndex ?? null) as
      | string
      | number
      | null,
    latency_ms: latencyMs ?? undefined,
    tokens: {
      input_tokens: normalizeTokenNumber(tokensRecord.input_tokens),
      output_tokens: normalizeTokenNumber(tokensRecord.output_tokens),
      reasoning_tokens: normalizeTokenNumber(tokensRecord.reasoning_tokens),
      cached_tokens: Math.max(
        normalizeTokenNumber(tokensRecord.cached_tokens),
        normalizeTokenNumber(tokensRecord.cache_tokens)
      ),
      cache_tokens: normalizeTokenNumber(tokensRecord.cache_tokens),
      cache_creation_tokens: normalizeTokenNumber(
        tokensRecord.cache_creation_tokens ?? tokensRecord.cacheCreationTokens
      ),
      total_tokens: normalizeTokenNumber(tokensRecord.total_tokens),
    },
    failed,
    request_service_tier: normalizeOptionalString(
      record.request_service_tier ?? record.requestServiceTier
    ),
    response_service_tier: normalizeOptionalString(
      record.response_service_tier ?? record.responseServiceTier
    ),
    __modelName: modelName || undefined,
    __timestampMs: Number.isNaN(timestampMs) ? index : timestampMs,
    __endpoint: endpoint,
    __endpointMethod: endpointMethod,
    __endpointPath: endpointPath,
  } as UsageDetail;
};

const buildDetailsPage = (
  response: UsageDetailsResponse,
  details: UsageDetail[]
): UsageDetailsPage => ({
  details,
  offset: Math.max(toNumber(response.offset), 0),
  limit: Math.max(toNumber(response.limit), details.length),
  nextOffset:
    response.next_offset === null || response.next_offset === undefined
      ? null
      : Math.max(toNumber(response.next_offset), 0),
  hasMore: response.has_more === true,
  totalMatched:
    (response.total ?? response.total_matched) === undefined ||
    (response.total ?? response.total_matched) === null
      ? null
      : Math.max(toNumber(response.total ?? response.total_matched), 0),
});

export const useUsageStatsStore = create<UsageStatsState>((set, get) => ({
  usage: null,
  usageMeta: null,
  usageAuths: [],
  keyStats: createEmptyKeyStats(),
  usageDetails: [],
  loading: false,
  authsLoading: false,
  detailsLoading: false,
  error: null,
  authsError: null,
  detailsError: null,
  lastRefreshedAt: null,
  authsRefreshedAt: null,
  detailsRefreshedAt: null,
  detailsPage: null,
  scopeKey: '',
  usageRangeKey: '',
  authsRangeKey: '',
  authsIndexKey: '',

  loadUsageStats: async (options = {}) => {
    const force = options.force === true;
    const staleTimeMs = options.staleTimeMs ?? USAGE_STATS_STALE_TIME_MS;
    const range = options.range;
    const rangeKey = buildUsageRangeKey(range);
    const { apiBase = '', managementAccessPath = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementAccessPath}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;

    if (
      inFlightUsageRequest &&
      inFlightUsageRequest.scopeKey === scopeKey &&
      inFlightUsageRequest.rangeKey === rangeKey
    ) {
      await inFlightUsageRequest.promise;
      return;
    }

    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey !== scopeKey) {
      usageRequestToken += 1;
      inFlightUsageRequest = null;
    }

    const fresh =
      !scopeChanged &&
      state.usageRangeKey === rangeKey &&
      state.lastRefreshedAt !== null &&
      Date.now() - state.lastRefreshedAt < staleTimeMs;

    if (!force && fresh) {
      return;
    }

    if (scopeChanged) {
      set({
        usage: null,
        usageMeta: null,
        usageAuths: [],
        keyStats: createEmptyKeyStats(),
        usageDetails: [],
        error: null,
        authsError: null,
        detailsError: null,
        lastRefreshedAt: null,
        authsRefreshedAt: null,
        detailsRefreshedAt: null,
        detailsPage: null,
        scopeKey,
        usageRangeKey: '',
        authsRangeKey: '',
        authsIndexKey: '',
      });
    }

    const requestId = (usageRequestToken += 1);
    set({ loading: true, error: null, scopeKey, usageRangeKey: rangeKey });

    const requestPromise = (async () => {
      const loadLegacyUsage = async () => {
        const usageResponse = await usageApi.getUsage();
        const rawUsage = usageResponse?.usage ?? usageResponse;
        const usage =
          rawUsage && typeof rawUsage === 'object' ? (rawUsage as UsageStatsSnapshot) : null;

        if (requestId !== usageRequestToken) return;

        const usageDetails = collectUsageDetails(usage);
        set({
          usage,
          usageMeta: usage ? (usage as UsageMeta) : null,
          usageAuths: [],
          keyStats: computeKeyStatsFromDetails(usageDetails),
          usageDetails,
          loading: false,
          error: null,
          lastRefreshedAt: Date.now(),
          scopeKey,
          usageRangeKey: rangeKey,
        });
      };

      try {
        let metaResponse: unknown;
        try {
          metaResponse = await usageApi.getUsageMeta();
        } catch (error: unknown) {
          if (isNotFoundError(error)) {
            await loadLegacyUsage();
            return;
          }
          throw error;
        }

        if (requestId !== usageRequestToken) return;

        const metaUsage = getUsageEnvelopeData(metaResponse) ?? {};
        const metaVersion = getUsageVersion(metaUsage);
        const current = get();
        const cachedVersion = getUsageVersion(current.usageMeta ?? current.usage);
        const canReuseSummary =
          !force &&
          !scopeChanged &&
          current.usage !== null &&
          current.usageRangeKey === rangeKey &&
          metaVersion !== null &&
          cachedVersion === metaVersion;

        if (canReuseSummary) {
          set({
            usage: { ...current.usage, ...metaUsage },
            usageMeta: metaUsage as UsageMeta,
            loading: false,
            error: null,
            lastRefreshedAt: Date.now(),
            scopeKey,
            usageRangeKey: rangeKey,
          });
          return;
        }

        let summaryResponse: unknown;
        try {
          summaryResponse = await usageApi.getUsageSummary(range);
        } catch (error: unknown) {
          if (isNotFoundError(error)) {
            await loadLegacyUsage();
            return;
          }
          throw error;
        }

        if (requestId !== usageRequestToken) return;

        const summaryUsage = getUsageEnvelopeData(summaryResponse) ?? {};
        const usage: UsageStatsSnapshot = {
          ...metaUsage,
          ...summaryUsage,
        };

        set({
          usage,
          usageMeta: metaUsage as UsageMeta,
          usageDetails: [],
          loading: false,
          error: null,
          lastRefreshedAt: Date.now(),
          scopeKey,
          usageRangeKey: rangeKey,
        });
      } catch (error: unknown) {
        if (requestId !== usageRequestToken) return;
        const message = getErrorMessage(error);
        set({
          loading: false,
          error: message,
          scopeKey,
          usageRangeKey: rangeKey,
        });
        throw new Error(message);
      } finally {
        if (inFlightUsageRequest?.id === requestId) {
          inFlightUsageRequest = null;
        }
      }
    })();

    inFlightUsageRequest = { id: requestId, scopeKey, rangeKey, promise: requestPromise };
    await requestPromise;
  },

  loadUsageDetails: async (options = {}) => {
    const query = options.query ?? {};
    const append = options.append === true;
    const { apiBase = '', managementAccessPath = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementAccessPath}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;

    if (scopeChanged) {
      set({
        usageDetails: [],
        detailsPage: null,
        detailsRefreshedAt: null,
        detailsError: null,
        scopeKey,
      });
    }

    const requestId = (detailsRequestToken += 1);
    set({ detailsLoading: true, detailsError: null, scopeKey });

    try {
      let page: UsageDetailsPage;
      try {
        const response = await usageApi.getUsageDetails(query);
        const detailsRaw = Array.isArray(response.items)
          ? response.items
          : Array.isArray(response.details)
            ? response.details
            : [];
        const details = detailsRaw.map((detail, index) => normalizeUsageDetail(detail, index));
        page = buildDetailsPage(response, details);
      } catch (error: unknown) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        const usageResponse = await usageApi.getUsage();
        const rawUsage = usageResponse?.usage ?? usageResponse;
        const legacyDetails = collectUsageDetails(rawUsage);
        page = buildDetailsPage(
          {
            details: legacyDetails,
            offset: 0,
            limit: legacyDetails.length,
            next_offset: null,
            has_more: false,
            total_matched: legacyDetails.length,
          },
          legacyDetails
        );
      }

      if (requestId !== detailsRequestToken) return page;

      const currentDetails = append ? get().usageDetails : [];
      const nextDetails = append ? [...currentDetails, ...page.details] : page.details;
      const nextPage = append
        ? {
            ...page,
            details: nextDetails,
          }
        : page;

      set({
        usageDetails: nextDetails,
        detailsPage: nextPage,
        detailsLoading: false,
        detailsError: null,
        detailsRefreshedAt: Date.now(),
        scopeKey,
      });
      return nextPage;
    } catch (error: unknown) {
      if (requestId !== detailsRequestToken) {
        return (
          get().detailsPage ?? {
            details: [],
            offset: 0,
            limit: 0,
            nextOffset: null,
            hasMore: false,
            totalMatched: null,
          }
        );
      }
      const message = getErrorMessage(error);
      set({
        detailsLoading: false,
        detailsError: message,
        scopeKey,
      });
      throw new Error(message);
    }
  },

  loadUsageAuths: async (options = {}) => {
    const force = options.force === true;
    const staleTimeMs = options.staleTimeMs ?? USAGE_STATS_STALE_TIME_MS;
    const range = options.range;
    const rangeKey = buildUsageRangeKey(range);
    const indexKey = buildAuthsIndexKey(options.authIndexes);
    const hasAuthIndexFilter = options.authIndexes !== undefined;
    const normalizedAuthIndexes = normalizeAuthIndexes(options.authIndexes);
    const { apiBase = '', managementAccessPath = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementAccessPath}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;

    const fresh =
      !scopeChanged &&
      state.authsRangeKey === rangeKey &&
      state.authsIndexKey === indexKey &&
      state.authsRefreshedAt !== null &&
      Date.now() - state.authsRefreshedAt < staleTimeMs;

    if (!force && fresh) {
      return state.usageAuths;
    }

    if (scopeChanged) {
      set({
        usageAuths: [],
        keyStats: createEmptyKeyStats(),
        authsError: null,
        authsRefreshedAt: null,
        authsRangeKey: '',
        authsIndexKey: '',
        scopeKey,
      });
    }

    const requestId = (authsRequestToken += 1);
    set({
      authsLoading: true,
      authsError: null,
      scopeKey,
      authsRangeKey: rangeKey,
      authsIndexKey: indexKey,
    });

    if (hasAuthIndexFilter && normalizedAuthIndexes.length === 0) {
      set({
        usageAuths: [],
        keyStats: createEmptyKeyStats(),
        authsLoading: false,
        authsError: null,
        authsRefreshedAt: Date.now(),
        scopeKey,
        authsRangeKey: rangeKey,
        authsIndexKey: indexKey,
      });
      return [];
    }

    try {
      let usageAuths: UsageAuthSummary[] = [];
      try {
        const response = await usageApi.getUsageAuths({
          ...range,
          auth_index: hasAuthIndexFilter ? normalizedAuthIndexes : undefined,
        });
        usageAuths = Array.isArray(response.auths) ? response.auths : [];
      } catch (error: unknown) {
        if (!isNotFoundError(error)) {
          throw error;
        }
        const usageResponse = await usageApi.getUsage();
        const rawUsage = usageResponse?.usage ?? usageResponse;
        const legacyDetails = collectUsageDetails(rawUsage);
        const keyStats = computeKeyStatsFromDetails(legacyDetails);
        if (requestId === authsRequestToken) {
          set({
            usageAuths: [],
            keyStats,
            authsLoading: false,
            authsError: null,
            authsRefreshedAt: Date.now(),
            scopeKey,
            authsRangeKey: rangeKey,
            authsIndexKey: indexKey,
          });
        }
        return [];
      }

      if (requestId !== authsRequestToken) {
        return get().usageAuths;
      }

      set({
        usageAuths,
        keyStats: computeKeyStatsFromAuths(usageAuths),
        authsLoading: false,
        authsError: null,
        authsRefreshedAt: Date.now(),
        scopeKey,
        authsRangeKey: rangeKey,
        authsIndexKey: indexKey,
      });
      return usageAuths;
    } catch (error: unknown) {
      if (requestId !== authsRequestToken) {
        return get().usageAuths;
      }
      const message = getErrorMessage(error);
      set({
        authsLoading: false,
        authsError: message,
        scopeKey,
        authsRangeKey: rangeKey,
        authsIndexKey: indexKey,
      });
      throw new Error(message);
    }
  },

  clearUsageStats: () => {
    usageRequestToken += 1;
    detailsRequestToken += 1;
    authsRequestToken += 1;
    inFlightUsageRequest = null;
    set({
      usage: null,
      usageMeta: null,
      usageAuths: [],
      keyStats: createEmptyKeyStats(),
      usageDetails: [],
      loading: false,
      authsLoading: false,
      detailsLoading: false,
      error: null,
      authsError: null,
      detailsError: null,
      lastRefreshedAt: null,
      authsRefreshedAt: null,
      detailsRefreshedAt: null,
      detailsPage: null,
      scopeKey: '',
      usageRangeKey: '',
      authsRangeKey: '',
      authsIndexKey: '',
    });
  },
}));
