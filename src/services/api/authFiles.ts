/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient, type ApiClientConnectionSnapshot } from './client';
import type {
  AuthFileModelItem,
  AuthFilesResponse,
  CodexPlanTypeRefreshResult,
  CodexPlanTypeRefreshMode,
  CodexPlanTypeRefreshSummary,
  CodexPlanTypeRefreshTask,
} from '@/types/authFile';
import type { OAuthModelAliasEntry } from '@/types';
import { parseTimestampMs } from '@/utils/timestamp';
import { AUTH_FILE_BATCH_UPDATE_TIMEOUT_MS, AUTH_FILE_UPLOAD_TIMEOUT_MS } from '@/utils/constants';
import { mapWithConcurrency } from '@/utils/concurrency';

type StatusError = { status?: number };
type RawHeaders = Record<string, unknown> | undefined;
type AuthFileStatusResponse = { status: string; disabled: boolean };
type AuthFileEntry = AuthFilesResponse['files'][number];
export type XaiAuthFileField = 'using_api' | 'websockets';
export type AuthFileFieldsPatch = {
  prefix?: string;
  proxy_url?: string;
  headers?: Record<string, string>;
  priority?: number | null;
  note?: string;
  using_api?: boolean;
  websockets?: boolean;
  excluded_models?: string[];
  disable_cooling?: boolean;
};
export type XaiAuthFileFieldsPatch = Partial<Pick<AuthFileFieldsPatch, XaiAuthFileField>>;
export type AuthFileFieldsPatchResponse = { status: string };
export type AuthFileBatchFailure = { name: string; status?: number; error: string };
export type AuthFileFieldsBatchResult = {
  status: string;
  matched: number;
  updated: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
type AuthFileArchiveRequest = { names: string[] } | { all: true };
type AuthFileArchiveResult = {
  blob: Blob;
  filename: string;
};
export type AuthCooldownClearAllResult = {
  status: string;
  total: number;
  updated: number;
};
export type AuthCooldownClearSelectedItem = {
  name?: string;
  id?: string;
  models?: string[];
};
export type AuthCooldownClearSelectedRequest =
  | { names: string[] }
  | { items: AuthCooldownClearSelectedItem[] };
export type AuthCooldownClearSelectedResult = {
  status: string;
  matched: number;
  updated: number;
  missing: string[];
};
export type AuthFilesListParams = {
  page: number;
  pageSize: number;
  provider?: string;
  plan?: string;
  priority?: string;
  problemOnly?: boolean;
  enabledOnly?: boolean;
  disabledOnly?: boolean;
  search?: string;
  sort?: string;
};
type AuthFileBatchUploadResponse = {
  status?: string;
  uploaded?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchDeleteResponse = {
  status?: unknown;
  deleted?: unknown;
  files?: unknown;
  retained?: unknown;
  retained_files?: unknown;
  name?: unknown;
  dependent_count?: unknown;
  dependent_names?: unknown;
  failed?: unknown;
};
type AuthFileFieldsBatchResponse = {
  status?: unknown;
  matched?: unknown;
  updated?: unknown;
  files?: unknown;
  failed?: unknown;
};
type AuthCooldownClearAllResponse = {
  status?: string;
  total?: unknown;
  updated?: unknown;
};
type AuthCooldownClearSelectedResponse = {
  status?: string;
  matched?: unknown;
  updated?: unknown;
  missing?: unknown;
};
type AuthFileBatchUploadResult = {
  status: string;
  uploaded: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
export type AuthFileDependencyAction = 'retain' | 'cascade';
export type AuthFileRetainedResult = {
  name: string;
  dependentCount: number;
  dependentNames: string[];
};
export type AuthFileBatchDeleteResult = {
  status: string;
  deleted: number;
  files: string[];
  retained: number;
  retainedFiles: AuthFileRetainedResult[];
  failed: AuthFileBatchFailure[];
};
export type AuthFileRestoreResult = {
  status: string;
  name: string;
  disabled: boolean;
};
type RawCodexPlanTypeRefreshSummary = Partial<Record<keyof CodexPlanTypeRefreshSummary, unknown>>;
type RawCodexPlanTypeRefreshResult = Record<string, unknown>;
type RawCodexPlanTypeRefreshTask = Record<string, unknown>;

export const AUTH_FILE_INVALID_JSON_OBJECT_ERROR = 'AUTH_FILE_INVALID_JSON_OBJECT';

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  if ('status' in err) return (err as StatusError).status;
  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readStringValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readNumberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const readBooleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const readHeaderValue = (headers: RawHeaders, key: string): string | null => {
  if (!headers) return null;

  const headerGetter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof headerGetter === 'function') {
    const value = headerGetter.call(headers, key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const entry = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(entry)) {
    const matched = entry.find((value) => typeof value === 'string' && value.trim());
    return typeof matched === 'string' ? matched.trim() : null;
  }
  return typeof entry === 'string' && entry.trim() ? entry.trim() : null;
};

const parseDownloadFilename = (headers: RawHeaders, fallback: string): string => {
  const disposition = readHeaderValue(headers, 'content-disposition');
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim());
      if (decoded) return decoded;
    } catch {
      // Ignore malformed RFC5987 filename values and continue falling back.
    }
  }

  const quotedMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]?.trim()) {
    return quotedMatch[1].trim();
  }

  const plainMatch = disposition.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]?.trim()) {
    return plainMatch[1].trim();
  }

  return fallback;
};

const normalizeRequestedAuthFileNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  names.forEach((name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizeBatchFileNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return normalizeRequestedAuthFileNames(value.map((item) => String(item ?? '')));
};

const normalizeBatchFailures = (value: unknown): AuthFileBatchFailure[] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<AuthFileBatchFailure[]>((result, item) => {
    if (!item || typeof item !== 'object') return result;
    const entry = item as Record<string, unknown>;
    const name = String(entry.name ?? '').trim();
    const error =
      typeof entry.error === 'string'
        ? entry.error.trim()
        : typeof entry.message === 'string'
          ? entry.message.trim()
          : '';
    const status = readNumberValue(entry.status);

    if (!name && !error) return result;
    result.push({
      name,
      ...(status !== undefined ? { status } : {}),
      error: error || 'Unknown error',
    });
    return result;
  }, []);
};

const deriveSuccessfulFileNames = (
  requestedNames: string[],
  failed: AuthFileBatchFailure[]
): string[] => {
  const failedNames = new Set(failed.map((entry) => entry.name.trim()).filter(Boolean));

  if (failedNames.size === 0) {
    return [...requestedNames];
  }

  return requestedNames.filter((name) => !failedNames.has(name));
};

const normalizeBatchUploadResponse = (
  payload: AuthFileBatchUploadResponse | undefined,
  requestedNames: string[]
): AuthFileBatchUploadResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const uploadedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const uploaded =
    typeof payload?.uploaded === 'number'
      ? payload.uploaded
      : uploadedFilesFromPayload.length > 0
        ? uploadedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let uploadedFiles = uploadedFilesFromPayload;
  if (uploadedFiles.length === 0 && uploaded > 0) {
    if (failed.length === 0 && uploaded === requestedNames.length) {
      uploadedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === uploaded) {
        uploadedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    uploaded,
    files: uploadedFiles,
    failed,
  };
};

const normalizeRetainedAuthFile = (value: unknown): AuthFileRetainedResult | null => {
  if (!isRecord(value)) return null;
  const name = readStringValue(value.name);
  if (!name) return null;
  return {
    name,
    dependentCount: readNumberValue(value.dependent_count) ?? 0,
    dependentNames: normalizeBatchFileNames(value.dependent_names),
  };
};

const normalizeRetainedAuthFiles = (
  payload: AuthFileBatchDeleteResponse | undefined,
  isSingleRetained: boolean
): AuthFileRetainedResult[] => {
  const retainedFiles = Array.isArray(payload?.retained_files)
    ? payload.retained_files
        .map((value) => normalizeRetainedAuthFile(value))
        .filter((value): value is AuthFileRetainedResult => value !== null)
    : [];
  if (retainedFiles.length > 0 || !isSingleRetained) return retainedFiles;

  const single = normalizeRetainedAuthFile({
    name: payload?.name,
    dependent_count: payload?.dependent_count,
    dependent_names: payload?.dependent_names,
  });
  return single ? [single] : [];
};

const normalizeBatchDeleteResponse = (
  payload: AuthFileBatchDeleteResponse | undefined,
  requestedNames: string[],
  httpStatus: number
): AuthFileBatchDeleteResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const deletedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const isSingleRetained =
    httpStatus === 202 || payload?.status === 'retained' || payload?.retained === true;
  const retainedFiles = normalizeRetainedAuthFiles(payload, isSingleRetained);
  const retained =
    typeof payload?.retained === 'number'
      ? payload.retained
      : retainedFiles.length > 0
        ? retainedFiles.length
        : 0;
  const deleted =
    typeof payload?.deleted === 'number'
      ? payload.deleted
      : deletedFilesFromPayload.length > 0
        ? deletedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0 && !isSingleRetained
          ? 1
          : 0;

  let deletedFiles = deletedFilesFromPayload;
  if (deletedFiles.length === 0 && deleted > 0) {
    if (failed.length === 0 && deleted === requestedNames.length) {
      deletedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === deleted) {
        deletedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string'
        ? payload.status
        : failed.length > 0
          ? 'partial'
          : isSingleRetained
            ? 'retained'
            : 'ok',
    deleted,
    files: deletedFiles,
    retained,
    retainedFiles,
    failed,
  };
};

const normalizeAuthFileFieldsBatchResponse = (
  payload: AuthFileFieldsBatchResponse | undefined,
  requestedNames: string[]
): AuthFileFieldsBatchResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const filesFromPayload = normalizeBatchFileNames(payload?.files);
  const files =
    filesFromPayload.length > 0
      ? filesFromPayload
      : failed.length === 0
        ? [...requestedNames]
        : deriveSuccessfulFileNames(requestedNames, failed);

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    matched: readNumberValue(payload?.matched) ?? requestedNames.length,
    updated: readNumberValue(payload?.updated) ?? files.length,
    files,
    failed,
  };
};

const normalizeAuthCooldownClearAllResponse = (
  payload: AuthCooldownClearAllResponse | undefined
): AuthCooldownClearAllResult => ({
  status: typeof payload?.status === 'string' ? payload.status : 'ok',
  total: readNumberValue(payload?.total) ?? 0,
  updated: readNumberValue(payload?.updated) ?? 0,
});

const normalizeAuthCooldownClearSelectedResponse = (
  payload: AuthCooldownClearSelectedResponse | undefined
): AuthCooldownClearSelectedResult => ({
  status: typeof payload?.status === 'string' ? payload.status : 'ok',
  matched: readNumberValue(payload?.matched) ?? 0,
  updated: readNumberValue(payload?.updated) ?? 0,
  missing: normalizeBatchFileNames(payload?.missing),
});

const readTextField = (entry: AuthFileEntry, key: string): string => {
  const value = entry[key];
  return typeof value === 'string' ? value.trim() : '';
};

const readDateField = (entry: AuthFileEntry): number => {
  const candidates = [entry['modtime'], entry.modified, entry['updated_at'], entry['last_refresh']];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        return asNumber < 1e12 ? asNumber * 1000 : asNumber;
      }
      const parsed = parseTimestampMs(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const isRuntimeOnlyEntry = (entry: AuthFileEntry): boolean => {
  const value = entry['runtime_only'] ?? entry.runtimeOnly;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const countMeaningfulFields = (entry: AuthFileEntry): number =>
  Object.values(entry).reduce<number>(
    (count, value) => count + (hasMeaningfulValue(value) ? 1 : 0),
    0
  );

const authFilePriorityScore = (entry: AuthFileEntry): number => {
  let score = 0;
  if (readTextField(entry, 'source').toLowerCase() === 'file') score += 32;
  if (readTextField(entry, 'path')) score += 16;
  if (!isRuntimeOnlyEntry(entry)) score += 8;
  if (entry.disabled !== true) score += 4;
  if (readDateField(entry) > 0) score += 2;
  return score;
};

const compareAuthFileEntries = (left: AuthFileEntry, right: AuthFileEntry): number => {
  const scoreDiff = authFilePriorityScore(right) - authFilePriorityScore(left);
  if (scoreDiff !== 0) return scoreDiff;

  const dateDiff = readDateField(right) - readDateField(left);
  if (dateDiff !== 0) return dateDiff;

  const fieldDiff = countMeaningfulFields(right) - countMeaningfulFields(left);
  if (fieldDiff !== 0) return fieldDiff;

  return 0;
};

const AUTH_FILE_QUOTA_SNAPSHOT_KEYS = [
  'quota_state',
  'image_quota_remaining',
  'image_quota_reset_at',
  'quota_updated_at',
  'quota_stale',
  'quota_refreshing',
  'quota_next_refresh_at',
  'quota_last_error',
] as const;

const hasAuthFileQuotaSnapshot = (entry: AuthFileEntry): boolean =>
  AUTH_FILE_QUOTA_SNAPSHOT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(entry, key));

const hasExplicitUnknownAuthFileQuota = (entry: AuthFileEntry): boolean =>
  entry.quota_state === 'unknown' ||
  (Object.prototype.hasOwnProperty.call(entry, 'image_quota_remaining') &&
    entry.image_quota_remaining === null);

const mergeAuthFileEntries = (entries: AuthFileEntry[]): AuthFileEntry => {
  const [primary, ...rest] = [...entries].sort(compareAuthFileEntries);
  const merged: AuthFileEntry = { ...primary };

  const quotaSource = hasAuthFileQuotaSnapshot(primary)
    ? primary
    : (rest.find(hasExplicitUnknownAuthFileQuota) ?? rest.find(hasAuthFileQuotaSnapshot));
  if (quotaSource) {
    const mergedRecord = merged as Record<string, unknown>;
    const quotaSourceRecord = quotaSource as Record<string, unknown>;
    for (const key of AUTH_FILE_QUOTA_SNAPSHOT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(quotaSource, key)) {
        mergedRecord[key] = quotaSourceRecord[key];
      } else {
        delete mergedRecord[key];
      }
    }
  }

  rest.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if ((AUTH_FILE_QUOTA_SNAPSHOT_KEYS as readonly string[]).includes(key)) return;
      if (!hasMeaningfulValue(merged[key]) && hasMeaningfulValue(value)) {
        merged[key] = value;
      }
    });
  });

  return merged;
};

export const normalizeAuthFileEntry = (entry: AuthFileEntry): AuthFileEntry => {
  const normalized: AuthFileEntry = { ...entry };
  const rawProvider = readStringValue(entry.provider) ?? readStringValue(entry.type) ?? '';
  const providerKey = rawProvider.toLowerCase().replace(/_/g, '-');
  const normalizedProvider = providerKey === 'x-ai' || providerKey === 'grok' ? 'xai' : providerKey;
  if (normalizedProvider === 'xai') {
    normalized.type = 'xai';
    normalized.provider = 'xai';
    const metadata = isRecord(entry.metadata) ? entry.metadata : {};
    const attributes = isRecord(entry.attributes) ? entry.attributes : {};
    const authKind =
      readStringValue(entry['auth_kind'] ?? entry.authKind) ??
      readStringValue(metadata.auth_kind ?? metadata.authKind) ??
      readStringValue(attributes.auth_kind ?? attributes.authKind);
    const usingApi =
      readBooleanValue(entry['using_api'] ?? entry.usingApi) ?? authKind?.toLowerCase() !== 'oauth';
    const websockets = readBooleanValue(entry.websockets) ?? false;
    normalized['using_api'] = usingApi;
    normalized.usingApi = usingApi;
    normalized.websockets = websockets;
  }
  if (normalizedProvider === 'codex') {
    const authMode = readStringValue(entry.authMode ?? entry['auth_mode']);
    if (authMode) {
      normalized.authMode = authMode.toLowerCase() === 'agentidentity' ? 'agentIdentity' : authMode;
    }
    const authModeLabel = readStringValue(entry.authModeLabel ?? entry['auth_mode_label']);
    if (authModeLabel) {
      normalized.authModeLabel = authModeLabel;
    }
    const canConvertToAgentIdentity = readBooleanValue(
      entry.canConvertToAgentIdentity ?? entry['can_convert_to_agent_identity']
    );
    if (canConvertToAgentIdentity !== undefined) {
      normalized.canConvertToAgentIdentity = canConvertToAgentIdentity;
    }
    const canConvertToOauth = readBooleanValue(
      entry.canConvertToOauth ?? entry['can_convert_to_oauth']
    );
    if (canConvertToOauth !== undefined) {
      normalized.canConvertToOauth = canConvertToOauth;
    }
  }
  const planType = readStringValue(entry.planType) ?? readStringValue(entry['plan_type']);
  if (planType) {
    normalized.planType = planType;
  }
  const lastErrorStatusCode = readNumberValue(
    entry.lastErrorStatusCode ?? entry['last_error_status_code']
  );
  if (lastErrorStatusCode !== undefined) {
    normalized.lastErrorStatusCode = lastErrorStatusCode;
  }
  const cooldownActive = readBooleanValue(entry.cooldownActive ?? entry['cooldown_active']);
  if (cooldownActive !== undefined) {
    normalized.cooldownActive = cooldownActive;
  }
  const cooldownScope = readStringValue(entry.cooldownScope ?? entry['cooldown_scope']);
  if (cooldownScope) {
    normalized.cooldownScope = cooldownScope;
  }
  const cooldownUntil = readStringValue(entry.cooldownUntil ?? entry['cooldown_until']);
  if (cooldownUntil) {
    normalized.cooldownUntil = cooldownUntil;
  }
  const cooldownModelCount = readNumberValue(
    entry.cooldownModelCount ?? entry['cooldown_model_count']
  );
  if (cooldownModelCount !== undefined) {
    normalized.cooldownModelCount = cooldownModelCount;
  }
  return normalized;
};

const dedupeAuthFilesResponse = (payload: AuthFilesResponse): AuthFilesResponse => {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const grouped = new Map<string, AuthFileEntry[]>();

  files.forEach((entry) => {
    const name = readTextField(entry, 'name');
    const key = name || JSON.stringify(entry);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(entry);
      return;
    }
    grouped.set(key, [entry]);
  });

  const normalizedFiles = Array.from(grouped.values()).map((entries) =>
    normalizeAuthFileEntry(mergeAuthFileEntries(entries))
  );
  if (payload?.pagination?.enabled !== true) {
    normalizedFiles.sort((left, right) =>
      readTextField(left, 'name').localeCompare(readTextField(right, 'name'), undefined, {
        sensitivity: 'accent',
      })
    );
  }

  return {
    ...payload,
    files: normalizedFiles,
    total:
      payload?.pagination?.enabled === true && Number.isFinite(Number(payload.total))
        ? Number(payload.total)
        : normalizedFiles.length,
  };
};

const authFilesListQuery = (params: AuthFilesListParams) => ({
  paged: true,
  page: params.page,
  page_size: params.pageSize,
  provider: params.provider || 'all',
  plan: params.plan || 'all',
  priority: params.priority || 'all',
  problem_only: params.problemOnly === true,
  enabled_only: params.enabledOnly === true,
  disabled_only: params.disabledOnly === true,
  search: params.search || '',
  sort: params.sort || 'default',
});

const parseAuthFileJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...(parsed as Record<string, unknown>) };
};

const saveAuthFileText = async (name: string, text: string) => {
  const file = new File([text], name, { type: 'application/json' });
  await authFilesApi.upload(file);
};

export const isAuthFileInvalidJsonObjectError = (err: unknown): boolean =>
  err instanceof Error && err.message === AUTH_FILE_INVALID_JSON_OBJECT_ERROR;

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, string[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-model-alias'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';
const AUTH_FILES_ARCHIVE_FALLBACK_NAME = 'auth-files.zip';
const AUTH_FILE_UPLOAD_CONCURRENCY = 4;
const EMPTY_CODEX_PLAN_TYPE_REFRESH_SUMMARY: CodexPlanTypeRefreshSummary = {
  eligible: 0,
  processed: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  failed: 0,
};

const normalizeCodexPlanTypeRefreshSummary = (payload: unknown): CodexPlanTypeRefreshSummary => {
  const source = isRecord(payload) ? (payload as RawCodexPlanTypeRefreshSummary) : {};

  return {
    eligible: readNumberValue(source.eligible) ?? 0,
    processed: readNumberValue(source.processed) ?? 0,
    updated: readNumberValue(source.updated) ?? 0,
    unchanged: readNumberValue(source.unchanged) ?? 0,
    skipped: readNumberValue(source.skipped) ?? 0,
    failed: readNumberValue(source.failed) ?? 0,
  };
};

const normalizeCodexPlanTypeRefreshResult = (
  payload: unknown
): CodexPlanTypeRefreshResult | null => {
  if (!isRecord(payload)) return null;
  const source = payload as RawCodexPlanTypeRefreshResult;
  const name = readStringValue(source.name);
  const status = readStringValue(source.status);
  if (!name || !status) return null;

  const result: CodexPlanTypeRefreshResult = {
    name,
    status,
  };

  const authId = readStringValue(source.auth_id ?? source.authId);
  if (authId) result.authId = authId;
  const planTypeBefore = readStringValue(source.plan_type_before ?? source.planTypeBefore);
  if (planTypeBefore) result.planTypeBefore = planTypeBefore;
  const planTypeAfter = readStringValue(source.plan_type_after ?? source.planTypeAfter);
  if (planTypeAfter) result.planTypeAfter = planTypeAfter;
  const httpStatus = readNumberValue(source.http_status ?? source.httpStatus);
  if (httpStatus !== undefined) result.httpStatus = httpStatus;
  const error = readStringValue(source.error);
  if (error) result.error = error;

  return result;
};

const normalizeCodexPlanTypeRefreshTask = (payload: unknown): CodexPlanTypeRefreshTask => {
  const source = isRecord(payload) ? (payload as RawCodexPlanTypeRefreshTask) : {};
  const state = readStringValue(source.state) ?? 'idle';
  const paused = readBooleanValue(source.paused) ?? state === 'paused';
  const pauseRequested = readBooleanValue(source.pause_requested ?? source.pauseRequested) ?? false;
  const results = Array.isArray(source.results)
    ? (source.results
        .map((entry) => normalizeCodexPlanTypeRefreshResult(entry))
        .filter(Boolean) as CodexPlanTypeRefreshResult[])
    : [];
  const canRetryFailed =
    readBooleanValue(source.can_retry_failed ?? source.canRetryFailed) ??
    results.some((result) => result.status === 'failed');

  return {
    state,
    running: readBooleanValue(source.running) ?? state === 'running',
    paused,
    pauseRequested,
    mode: readStringValue(source.mode),
    canRetryFailed,
    startedAt: readStringValue(source.started_at ?? source.startedAt),
    finishedAt: readStringValue(source.finished_at ?? source.finishedAt),
    currentName: readStringValue(source.current_name ?? source.currentName),
    summary: normalizeCodexPlanTypeRefreshSummary(
      source.summary ?? EMPTY_CODEX_PLAN_TYPE_REFRESH_SUMMARY
    ),
    results,
  };
};

const downloadAuthFilesArchive = async (
  payload: AuthFileArchiveRequest
): Promise<AuthFileArchiveResult> => {
  const response = await apiClient.requestRaw({
    url: '/auth-files/archive',
    method: 'POST',
    data: payload,
    responseType: 'blob',
  });

  const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
  const filename = parseDownloadFilename(
    response.headers as RawHeaders,
    AUTH_FILES_ARCHIVE_FALLBACK_NAME
  );
  return { blob, filename };
};

const uploadAuthFilesRequest = async (files: File[]): Promise<AuthFileBatchUploadResult> => {
  const requestedNames = files.map((file) => file.name);
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('file', file, file.name);
  });
  const payload = await apiClient.postForm<AuthFileBatchUploadResponse>('/auth-files', formData, {
    timeout: AUTH_FILE_UPLOAD_TIMEOUT_MS,
  });
  return normalizeBatchUploadResponse(payload, requestedNames);
};

export const authFilesApi = {
  list: async (connection?: ApiClientConnectionSnapshot, signal?: AbortSignal) =>
    dedupeAuthFilesResponse(
      connection
        ? await apiClient.getAtConnection<AuthFilesResponse>(
            connection,
            '/auth-files',
            signal ? { signal } : undefined
          )
        : await apiClient.get<AuthFilesResponse>('/auth-files', signal ? { signal } : undefined)
    ),

  listPaged: async (
    params: AuthFilesListParams,
    connection?: ApiClientConnectionSnapshot,
    signal?: AbortSignal
  ) =>
    dedupeAuthFilesResponse(
      connection
        ? await apiClient.getAtConnection<AuthFilesResponse>(connection, '/auth-files', {
            params: authFilesListQuery(params),
            ...(signal ? { signal } : {}),
          })
        : await apiClient.get<AuthFilesResponse>('/auth-files', {
            params: authFilesListQuery(params),
            ...(signal ? { signal } : {}),
          })
    ),

  listSelection: async (params: AuthFilesListParams, signal?: AbortSignal) =>
    dedupeAuthFilesResponse(
      await apiClient.get<AuthFilesResponse>('/auth-files/selection', {
        params: {
          ...authFilesListQuery(params),
          paged: undefined,
          page: undefined,
          page_size: undefined,
        },
        ...(signal ? { signal } : {}),
      })
    ),

  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  patchFields: (name: string, fields: AuthFileFieldsPatch) =>
    apiClient.patch<AuthFileFieldsPatchResponse>('/auth-files/fields', {
      name,
      ...fields,
    }),

  patchFieldsBatch: async (
    names: string[],
    fields: AuthFileFieldsPatch
  ): Promise<AuthFileFieldsBatchResult> => {
    const requestedNames = normalizeRequestedAuthFileNames(names);
    const response = await apiClient.requestRaw({
      url: '/auth-files/fields',
      method: 'PATCH',
      data: { names: requestedNames, fields },
      timeout: AUTH_FILE_BATCH_UPDATE_TIMEOUT_MS,
      validateStatus: (status) => status === 200 || status === 207,
    });
    return normalizeAuthFileFieldsBatchResponse(
      response.data as AuthFileFieldsBatchResponse | undefined,
      requestedNames
    );
  },

  uploadFiles: async (files: File[]): Promise<AuthFileBatchUploadResult> => {
    const requestedNames = files.map((file) => file.name);
    if (requestedNames.length === 0) {
      return { status: 'ok', uploaded: 0, files: [], failed: [] };
    }

    if (files.length === 1 || new Set(requestedNames).size !== requestedNames.length) {
      return uploadAuthFilesRequest(files);
    }

    const results = await mapWithConcurrency(files, AUTH_FILE_UPLOAD_CONCURRENCY, (file) =>
      uploadAuthFilesRequest([file])
    );
    const uploadedFiles: string[] = [];
    const failed: AuthFileBatchFailure[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        uploadedFiles.push(...result.value.files);
        failed.push(...result.value.failed);
        return;
      }
      failed.push({
        name: files[index].name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });

    return {
      status: failed.length > 0 ? (uploadedFiles.length > 0 ? 'partial' : 'error') : 'ok',
      uploaded: uploadedFiles.length,
      files: uploadedFiles,
      failed,
    };
  },

  upload: (file: File) => authFilesApi.uploadFiles([file]),

  deleteFiles: async (
    names: string[],
    dependencyAction: AuthFileDependencyAction = 'retain'
  ): Promise<AuthFileBatchDeleteResult> => {
    const requestedNames = normalizeRequestedAuthFileNames(names);
    if (requestedNames.length === 0) {
      return {
        status: 'ok',
        deleted: 0,
        files: [],
        retained: 0,
        retainedFiles: [],
        failed: [],
      };
    }

    const response = await apiClient.requestRaw({
      url: '/auth-files',
      method: 'DELETE',
      params: { dependency_action: dependencyAction },
      data: { names: requestedNames },
      validateStatus: (status) => status === 200 || status === 202 || status === 207,
    });
    return normalizeBatchDeleteResponse(
      response.data as AuthFileBatchDeleteResponse | undefined,
      requestedNames,
      response.status
    );
  },

  deleteFile: (name: string, dependencyAction: AuthFileDependencyAction = 'retain') =>
    authFilesApi.deleteFiles([name], dependencyAction),

  restoreFile: (name: string): Promise<AuthFileRestoreResult> =>
    apiClient.post('/auth-files/restore', { name }),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  downloadArchiveByNames: async (names: string[]): Promise<AuthFileArchiveResult> => {
    const requestedNames = normalizeRequestedAuthFileNames(names);
    if (requestedNames.length === 0) {
      return {
        blob: new Blob([], { type: 'application/zip' }),
        filename: AUTH_FILES_ARCHIVE_FALLBACK_NAME,
      };
    }
    return downloadAuthFilesArchive({ names: requestedNames });
  },

  downloadArchiveAll: async (): Promise<AuthFileArchiveResult> =>
    downloadAuthFilesArchive({ all: true }),

  clearAllCooldowns: async (): Promise<AuthCooldownClearAllResult> =>
    normalizeAuthCooldownClearAllResponse(
      await apiClient.post<AuthCooldownClearAllResponse>('/auth-files/cooldowns/clear')
    ),

  clearSelectedCooldowns: async (
    payload: AuthCooldownClearSelectedRequest
  ): Promise<AuthCooldownClearSelectedResult> => {
    const requestPayload =
      'names' in payload
        ? { names: normalizeRequestedAuthFileNames(payload.names) }
        : {
            items: payload.items
              .map((item) => ({
                name: readStringValue(item.name),
                id: readStringValue(item.id),
                models: Array.isArray(item.models)
                  ? normalizeRequestedAuthFileNames(item.models)
                  : undefined,
              }))
              .filter((item) => item.name || item.id),
          };

    const response = await apiClient.post<AuthCooldownClearSelectedResponse>(
      '/auth-files/cooldowns/clear-selected',
      requestPayload
    );
    return normalizeAuthCooldownClearSelectedResponse(response);
  },

  getCodexPlanTypeRefreshStatus: async (): Promise<CodexPlanTypeRefreshTask> =>
    normalizeCodexPlanTypeRefreshTask(
      await apiClient.get<RawCodexPlanTypeRefreshTask>('/auth-files/codex/plan-type-refresh')
    ),

  startCodexPlanTypeRefresh: async (
    mode: CodexPlanTypeRefreshMode = 'all'
  ): Promise<CodexPlanTypeRefreshTask> => {
    const response = await apiClient.requestRaw({
      url: '/auth-files/codex/plan-type-refresh',
      method: 'POST',
      data: mode === 'all' ? undefined : { mode },
      validateStatus: (status) => status === 200 || status === 202 || status === 409,
    });

    return normalizeCodexPlanTypeRefreshTask(response.data);
  },

  controlCodexPlanTypeRefresh: async (
    action: 'pause' | 'resume'
  ): Promise<CodexPlanTypeRefreshTask> => {
    const response = await apiClient.requestRaw({
      url: '/auth-files/codex/plan-type-refresh',
      method: 'PATCH',
      data: { action },
      validateStatus: (status) => status === 200 || status === 202 || status === 409,
    });

    return normalizeCodexPlanTypeRefreshTask(response.data);
  },

  clearCodexPlanTypeRefreshStatus: async (): Promise<CodexPlanTypeRefreshTask> => {
    const response = await apiClient.requestRaw({
      url: '/auth-files/codex/plan-type-refresh',
      method: 'DELETE',
      validateStatus: (status) => status === 200 || status === 409,
    });

    return normalizeCodexPlanTypeRefreshTask(response.data);
  },

  downloadText: async (name: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/auth-files/download?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    const blob = response.data as Blob;
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(
    name: string,
    connection?: ApiClientConnectionSnapshot,
    signal?: AbortSignal
  ): Promise<AuthFileModelItem[]> {
    const path = `/auth-files/models?name=${encodeURIComponent(name)}`;
    const data = connection
      ? await apiClient.getAtConnection<Record<string, unknown>>(
          connection,
          path,
          signal ? { signal } : undefined
        )
      : await apiClient.get<Record<string, unknown>>(path, signal ? { signal } : undefined);
    const models = data.models ?? data['models'];
    return Array.isArray(models) ? (models as AuthFileModelItem[]) : [];
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(
    channel: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
