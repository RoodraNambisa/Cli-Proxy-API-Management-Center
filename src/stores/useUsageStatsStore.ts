import { create } from 'zustand';
import { usageApi } from '@/services/api';
import { useAuthStore } from '@/stores/useAuthStore';
import type { UsageAuthSummary, UsageDetailsQuery, UsageDetailsResponse, UsageMeta } from '@/types';
import { parseTimestampMs } from '@/utils/timestamp';
import {
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
};

export type LoadUsageDetailsOptions = {
  force?: boolean;
  query?: UsageDetailsQuery;
  append?: boolean;
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
  detailsLoading: boolean;
  error: string | null;
  detailsError: string | null;
  lastRefreshedAt: number | null;
  detailsRefreshedAt: number | null;
  detailsPage: UsageDetailsPage | null;
  scopeKey: string;
  loadUsageStats: (options?: LoadUsageStatsOptions) => Promise<void>;
  loadUsageDetails: (options?: LoadUsageDetailsOptions) => Promise<UsageDetailsPage>;
  clearUsageStats: () => void;
};

const createEmptyKeyStats = (): KeyStats => ({ bySource: {}, byAuthIndex: {} });

let usageRequestToken = 0;
let detailsRequestToken = 0;
let inFlightUsageRequest: { id: number; scopeKey: string; promise: Promise<void> } | null = null;

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

const normalizeTokenNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeUsageDetail = (detail: unknown, index: number): UsageDetail => {
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
      total_tokens: normalizeTokenNumber(tokensRecord.total_tokens),
    },
    failed,
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
    response.total_matched === undefined || response.total_matched === null
      ? null
      : Math.max(toNumber(response.total_matched), 0),
});

export const useUsageStatsStore = create<UsageStatsState>((set, get) => ({
  usage: null,
  usageMeta: null,
  usageAuths: [],
  keyStats: createEmptyKeyStats(),
  usageDetails: [],
  loading: false,
  detailsLoading: false,
  error: null,
  detailsError: null,
  lastRefreshedAt: null,
  detailsRefreshedAt: null,
  detailsPage: null,
  scopeKey: '',

  loadUsageStats: async (options = {}) => {
    const force = options.force === true;
    const staleTimeMs = options.staleTimeMs ?? USAGE_STATS_STALE_TIME_MS;
    const { apiBase = '', managementAccessPath = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementAccessPath}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;

    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey === scopeKey) {
      await inFlightUsageRequest.promise;
      return;
    }

    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey !== scopeKey) {
      usageRequestToken += 1;
      inFlightUsageRequest = null;
    }

    const fresh =
      !scopeChanged &&
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
        detailsError: null,
        lastRefreshedAt: null,
        detailsRefreshedAt: null,
        detailsPage: null,
        scopeKey,
      });
    }

    const requestId = (usageRequestToken += 1);
    set({ loading: true, error: null, scopeKey });

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
          current.usageAuths.length > 0 &&
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
          });
          return;
        }

        let summaryResponse: unknown;
        let authsResponse: unknown;
        try {
          [summaryResponse, authsResponse] = await Promise.all([
            usageApi.getUsageSummary(),
            usageApi.getUsageAuths(),
          ]);
        } catch (error: unknown) {
          if (isNotFoundError(error)) {
            await loadLegacyUsage();
            return;
          }
          throw error;
        }

        if (requestId !== usageRequestToken) return;

        const summaryUsage = getUsageEnvelopeData(summaryResponse) ?? {};
        const authsRecord = isRecord(authsResponse) ? authsResponse : null;
        const usageAuths = Array.isArray(authsRecord?.auths)
          ? (authsRecord.auths as UsageAuthSummary[])
          : [];
        const usage: UsageStatsSnapshot = {
          ...metaUsage,
          ...summaryUsage,
        };

        set({
          usage,
          usageMeta: metaUsage as UsageMeta,
          usageAuths,
          keyStats: computeKeyStatsFromAuths(usageAuths),
          usageDetails: [],
          loading: false,
          error: null,
          lastRefreshedAt: Date.now(),
          scopeKey,
        });
      } catch (error: unknown) {
        if (requestId !== usageRequestToken) return;
        const message = getErrorMessage(error);
        set({
          loading: false,
          error: message,
          scopeKey,
        });
        throw new Error(message);
      } finally {
        if (inFlightUsageRequest?.id === requestId) {
          inFlightUsageRequest = null;
        }
      }
    })();

    inFlightUsageRequest = { id: requestId, scopeKey, promise: requestPromise };
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
        const detailsRaw = Array.isArray(response.details) ? response.details : [];
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

  clearUsageStats: () => {
    usageRequestToken += 1;
    detailsRequestToken += 1;
    inFlightUsageRequest = null;
    set({
      usage: null,
      usageMeta: null,
      usageAuths: [],
      keyStats: createEmptyKeyStats(),
      usageDetails: [],
      loading: false,
      detailsLoading: false,
      error: null,
      detailsError: null,
      lastRefreshedAt: null,
      detailsRefreshedAt: null,
      detailsPage: null,
      scopeKey: '',
    });
  },
}));
