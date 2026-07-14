import type {
  ApiKeyEntry,
  CloakConfig,
  GeminiKeyConfig,
  ModelAlias,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';
import {
  CODEX_CUSTOM_MODEL_GROUPS,
  type CodexCustomModelConfig,
  type CodexCustomModelGroup,
  type Config,
  type NativeImageEndpointConfig,
} from '@/types/config';
import { buildHeaderObject } from '@/utils/headers';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return Boolean(value);
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  return String(value);
};

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
};

const normalizeIntegerArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.reduce<number[]>((result, item) => {
    const parsed = normalizeNumber(item);
    if (parsed === undefined || !Number.isInteger(parsed)) {
      return result;
    }
    result.push(parsed);
    return result;
  }, []);

  return normalized.length > 0 ? normalized : [];
};

const normalizeFixedErrorCooldowns = (
  value: unknown
): Config['fixedErrorCooldowns'] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.reduce<NonNullable<Config['fixedErrorCooldowns']>>((result, item) => {
    if (!isRecord(item)) return result;
    const statusCode = normalizeNumber(item['status-code'] ?? item.statusCode);
    const messageContains = normalizeString(item['message-contains'] ?? item.messageContains);
    const cooldownSeconds = normalizeNumber(item['cooldown-seconds'] ?? item.cooldownSeconds);
    const scopeRaw = normalizeString(item.scope);

    result.push({
      statusCode,
      messageContains: messageContains ?? '',
      cooldownSeconds,
      scope: scopeRaw === 'auth' || scopeRaw === 'model' ? scopeRaw : (scopeRaw ?? 'model'),
    });
    return result;
  }, []);

  return normalized.length > 0 ? normalized : [];
};

const normalizeNonRetryableErrors = (value: unknown): Config['nonRetryableErrors'] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.reduce<NonNullable<Config['nonRetryableErrors']>>((result, item) => {
    if (!isRecord(item)) return result;
    result.push({
      statusCode: normalizeNumber(item['status-code'] ?? item.statusCode),
      type: normalizeString(item.type),
      code: normalizeString(item.code),
      messageContains: normalizeString(item['message-contains'] ?? item.messageContains),
    });
    return result;
  }, []);

  return normalized.length > 0 ? normalized : [];
};

const normalizeAuthModelExclusions = (
  value: unknown
): Config['authModelExclusions'] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.reduce<NonNullable<Config['authModelExclusions']>>((result, item) => {
    if (!isRecord(item)) return result;
    result.push({
      models: normalizeStringArray(item.models),
      priorities: normalizeIntegerArray(item.priorities),
      keywordContains: normalizeStringArray(item['keyword-contains'] ?? item.keywordContains),
      disableImageGeneration: normalizeBoolean(
        item['disable-image-generation'] ?? item.disableImageGeneration
      ),
    });
    return result;
  }, []);

  return normalized.length > 0 ? normalized : [];
};

const normalizeRoutingPriorityOverrides = (
  value: unknown
): Config['routingPriorityOverrides'] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.reduce<NonNullable<Config['routingPriorityOverrides']>>(
    (result, item) => {
      if (!isRecord(item)) return result;
      const priority = normalizeNumber(item.priority);
      if (priority === undefined || !Number.isSafeInteger(priority)) return result;

      const strategy = normalizeString(item.strategy);
      const maxRetryCredentialsRaw = Object.prototype.hasOwnProperty.call(
        item,
        'max-retry-credentials'
      )
        ? item['max-retry-credentials']
        : item.maxRetryCredentials;
      const fillFirstRangeRaw = Object.prototype.hasOwnProperty.call(item, 'fill-first-range')
        ? item['fill-first-range']
        : item.fillFirstRange;
      const fillFirstPerAuthRpmRaw = Object.prototype.hasOwnProperty.call(
        item,
        'fill-first-per-auth-rpm'
      )
        ? item['fill-first-per-auth-rpm']
        : item.fillFirstPerAuthRpm;
      const entry: NonNullable<Config['routingPriorityOverrides']>[number] = { priority };

      if (strategy) {
        entry.strategy = strategy;
      }
      if (maxRetryCredentialsRaw === null) {
        entry.maxRetryCredentials = null;
      } else {
        const maxRetryCredentials = normalizeNumber(maxRetryCredentialsRaw);
        if (
          maxRetryCredentials !== undefined &&
          Number.isSafeInteger(maxRetryCredentials) &&
          maxRetryCredentials >= 0
        ) {
          entry.maxRetryCredentials = maxRetryCredentials;
        }
      }
      if (fillFirstRangeRaw === null) {
        entry.fillFirstRange = null;
      } else {
        const fillFirstRange = normalizeNumber(fillFirstRangeRaw);
        if (
          fillFirstRange !== undefined &&
          Number.isSafeInteger(fillFirstRange) &&
          fillFirstRange >= 1
        ) {
          entry.fillFirstRange = fillFirstRange;
        }
      }
      if (fillFirstPerAuthRpmRaw === null) {
        entry.fillFirstPerAuthRpm = null;
      } else {
        const fillFirstPerAuthRpm = normalizeNumber(fillFirstPerAuthRpmRaw);
        if (
          fillFirstPerAuthRpm !== undefined &&
          Number.isSafeInteger(fillFirstPerAuthRpm) &&
          fillFirstPerAuthRpm >= 0
        ) {
          entry.fillFirstPerAuthRpm = fillFirstPerAuthRpm;
        }
      }

      result.push(entry);
      return result;
    },
    []
  );

  return normalized.length > 0 ? normalized : [];
};

const normalizeNativeImageEndpoint = (value: unknown): NativeImageEndpointConfig | undefined => {
  if (!isRecord(value)) return undefined;

  return {
    enabled: normalizeBoolean(value.enabled),
    models: normalizeStringArray(value.models),
    paramRules: normalizeStringArray(value['param-rules'] ?? value.paramRules),
    unsupportedModelStatusCode: normalizeNumber(
      value['unsupported-model-status-code'] ?? value.unsupportedModelStatusCode
    ),
    unsupportedModelMessage: normalizeString(
      value['unsupported-model-message'] ?? value.unsupportedModelMessage
    ),
  };
};

const normalizeRequestBodyAudit = (value: unknown): Config['requestBodyAudit'] | undefined => {
  if (!isRecord(value)) return undefined;
  const error = isRecord(value.error) ? value.error : {};
  const statusCode = normalizeNumber(error['status-code'] ?? error.statusCode);
  const maxBodyBytes = normalizeNumber(value['max-body-bytes'] ?? value.maxBodyBytes);

  return {
    enable: normalizeBoolean(value.enable),
    keywords: normalizeStringArray(value.keywords) ?? [],
    keywordsBase64: normalizeStringArray(value['keywords-base64'] ?? value.keywordsBase64) ?? [],
    caseSensitive: normalizeBoolean(value['case-sensitive'] ?? value.caseSensitive),
    maxBodyBytes:
      maxBodyBytes !== undefined && Number.isFinite(maxBodyBytes) && maxBodyBytes > 0
        ? Math.trunc(maxBodyBytes)
        : 0,
    rejectOversize: normalizeBoolean(value['reject-oversize'] ?? value.rejectOversize ?? true),
    error: {
      statusCode:
        statusCode !== undefined && statusCode >= 100 && statusCode <= 599
          ? Math.trunc(statusCode)
          : 400,
      message: normalizeString(error.message) ?? '',
      type: normalizeString(error.type) ?? '',
      code: normalizeString(error.code) ?? '',
    },
  };
};

const normalizeRequestBodyRelease = (value: unknown): Config['requestBodyRelease'] | undefined => {
  if (!isRecord(value)) return undefined;
  const afterSeconds = normalizeNumber(value['after-seconds'] ?? value.afterSeconds);
  const minBodyBytes = normalizeNumber(value['min-body-bytes'] ?? value.minBodyBytes);

  return {
    enable: normalizeBoolean(value.enable) ?? false,
    logOnly: normalizeBoolean(value['log-only'] ?? value.logOnly) ?? false,
    afterSeconds:
      afterSeconds !== undefined && Number.isFinite(afterSeconds) && afterSeconds > 0
        ? Math.trunc(afterSeconds)
        : 0,
    minBodyBytes:
      minBodyBytes !== undefined && Number.isFinite(minBodyBytes) && minBodyBytes > 0
        ? Math.trunc(minBodyBytes)
        : 0,
  };
};

const normalizeCodexCustomModelGroups = (value: unknown): CodexCustomModelGroup[] => {
  if (!Array.isArray(value)) return [];

  const requested = new Set(
    value
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );

  return CODEX_CUSTOM_MODEL_GROUPS.filter((group) => requested.has(group));
};

const normalizeCodexCustomModels = (value: unknown): CodexCustomModelConfig[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const indexById = new Map<string, number>();
  const models: CodexCustomModelConfig[] = [];

  value.forEach((item) => {
    if (!isRecord(item)) return;

    const id = String(item.id ?? '').trim();
    if (!id) return;

    const groups = normalizeCodexCustomModelGroups(item.groups);
    if (groups.length === 0) return;

    const displayNameRaw = item['display-name'] ?? item.displayName;
    const displayName = normalizeString(displayNameRaw)?.trim() || undefined;
    const key = id.toLowerCase();
    const existingIndex = indexById.get(key);

    if (existingIndex !== undefined) {
      const existing = models[existingIndex];
      const merged = new Set<CodexCustomModelGroup>(existing.groups);
      groups.forEach((group) => merged.add(group));
      existing.groups = CODEX_CUSTOM_MODEL_GROUPS.filter((group) => merged.has(group));
      if (!existing.displayName && displayName) {
        existing.displayName = displayName;
      }
      return;
    }

    indexById.set(key, models.length);
    models.push({
      id,
      displayName,
      groups,
    });
  });

  return models;
};

const normalizeModelAliases = (models: unknown): ModelAlias[] => {
  if (!Array.isArray(models)) return [];
  return models
    .map((item) => {
      if (item === undefined || item === null) return null;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        return trimmed ? ({ name: trimmed } satisfies ModelAlias) : null;
      }
      if (!isRecord(item)) return null;

      const name = item.name || item.id || item.model;
      if (!name) return null;
      const alias = item.alias || item.display_name || item.displayName;
      const priority = item.priority ?? item['priority'];
      const testModel = item['test-model'] ?? item.testModel;
      const entry: ModelAlias = { name: String(name) };
      if (alias && alias !== name) {
        entry.alias = String(alias);
      }
      if (priority !== undefined) {
        const parsed = Number(priority);
        if (Number.isFinite(parsed)) {
          entry.priority = parsed;
        }
      }
      if (testModel) {
        entry.testModel = String(testModel);
      }
      return entry;
    })
    .filter(Boolean) as ModelAlias[];
};

const normalizeHeaders = (headers: unknown) => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalized = buildHeaderObject(
    Array.isArray(headers)
      ? (headers as Array<{ key: string; value: string }>)
      : (headers as Record<string, string | undefined | null>)
  );
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeExcludedModels = (input: unknown): string[] => {
  const rawList = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  rawList.forEach((item) => {
    const trimmed = String(item ?? '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizePrefix = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const normalizeAuthIndex = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const normalizeApiKeyEntry = (entry: unknown): ApiKeyEntry | null => {
  if (entry === undefined || entry === null) return null;
  const record = isRecord(entry) ? entry : null;
  const apiKey =
    record?.['api-key'] ??
    record?.apiKey ??
    record?.key ??
    (typeof entry === 'string' ? entry : '');
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const proxyUrl = record ? (record['proxy-url'] ?? record.proxyUrl) : undefined;
  const headers = record ? normalizeHeaders(record.headers) : undefined;
  const authIndex = normalizeAuthIndex(
    record?.['auth-index'] ?? record?.authIndex ?? record?.['auth_index']
  );

  const result: ApiKeyEntry = {
    apiKey: trimmed,
    proxyUrl: proxyUrl ? String(proxyUrl) : undefined,
    headers,
  };
  if (authIndex) result.authIndex = authIndex;
  return result;
};

const normalizeProviderKeyConfig = (item: unknown): ProviderKeyConfig | null => {
  if (item === undefined || item === null) return null;
  const record = isRecord(item) ? item : null;
  const apiKey = record?.['api-key'] ?? record?.apiKey ?? (typeof item === 'string' ? item : '');
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: ProviderKeyConfig = { apiKey: trimmed };
  const priority = record?.priority ?? record?.['priority'];
  if (priority !== undefined && priority !== null && String(priority).trim() !== '') {
    const parsed = Number(priority);
    if (Number.isFinite(parsed)) {
      config.priority = parsed;
    }
  }
  const prefix = normalizePrefix(record?.prefix ?? record?.['prefix']);
  if (prefix) config.prefix = prefix;
  const baseUrl = record ? (record['base-url'] ?? record.baseUrl) : undefined;
  const proxyUrl = record ? (record['proxy-url'] ?? record.proxyUrl) : undefined;
  if (baseUrl) config.baseUrl = String(baseUrl);
  const websockets = normalizeBoolean(record?.websockets ?? record?.['websockets']);
  if (websockets !== undefined) config.websockets = websockets;
  if (proxyUrl) config.proxyUrl = String(proxyUrl);
  const headers = normalizeHeaders(record?.headers);
  if (headers) config.headers = headers;
  const models = normalizeModelAliases(record?.models);
  if (models.length) config.models = models;
  const excludedModels = normalizeExcludedModels(
    record?.['excluded-models'] ??
      record?.excludedModels ??
      record?.['excluded_models'] ??
      record?.excluded_models
  );
  if (excludedModels.length) config.excludedModels = excludedModels;
  const authIndex = normalizeAuthIndex(
    record?.['auth-index'] ?? record?.authIndex ?? record?.['auth_index']
  );
  if (authIndex) config.authIndex = authIndex;

  const cloakRaw = record?.cloak;
  if (isRecord(cloakRaw)) {
    const cloak: CloakConfig = {};
    const mode = cloakRaw.mode ?? cloakRaw['mode'];
    if (typeof mode === 'string' && mode.trim()) {
      cloak.mode = mode.trim();
    }
    const strictMode = normalizeBoolean(
      cloakRaw['strict-mode'] ?? cloakRaw.strictMode ?? cloakRaw.strict_mode
    );
    if (strictMode !== undefined) {
      cloak.strictMode = strictMode;
    }
    const sensitiveWords = normalizeExcludedModels(
      cloakRaw['sensitive-words'] ?? cloakRaw.sensitiveWords ?? cloakRaw.sensitive_words
    );
    if (sensitiveWords.length) {
      cloak.sensitiveWords = sensitiveWords;
    }
    if (Object.keys(cloak).length) {
      config.cloak = cloak;
    }
  }

  return config;
};

const normalizeGeminiKeyConfig = (item: unknown): GeminiKeyConfig | null => {
  if (item === undefined || item === null) return null;
  const record = isRecord(item) ? item : null;
  let apiKey = record?.['api-key'] ?? record?.apiKey;
  if (!apiKey && typeof item === 'string') {
    apiKey = item;
  }
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: GeminiKeyConfig = { apiKey: trimmed };
  const priority = record?.priority ?? record?.['priority'];
  if (priority !== undefined && priority !== null && String(priority).trim() !== '') {
    const parsed = Number(priority);
    if (Number.isFinite(parsed)) {
      config.priority = parsed;
    }
  }
  const prefix = normalizePrefix(record?.prefix ?? record?.['prefix']);
  if (prefix) config.prefix = prefix;
  const baseUrl = record ? (record['base-url'] ?? record.baseUrl ?? record['base_url']) : undefined;
  if (baseUrl) config.baseUrl = String(baseUrl);
  const proxyUrl = record
    ? (record['proxy-url'] ?? record.proxyUrl ?? record['proxy_url'])
    : undefined;
  if (proxyUrl) config.proxyUrl = String(proxyUrl);
  const models = normalizeModelAliases(record?.models);
  if (models.length) config.models = models;
  const headers = normalizeHeaders(record?.headers);
  if (headers) config.headers = headers;
  const excludedModels = normalizeExcludedModels(
    record?.['excluded-models'] ?? record?.excludedModels
  );
  if (excludedModels.length) config.excludedModels = excludedModels;
  const authIndex = normalizeAuthIndex(
    record?.['auth-index'] ?? record?.authIndex ?? record?.['auth_index']
  );
  if (authIndex) config.authIndex = authIndex;
  return config;
};

const normalizeOpenAIProvider = (provider: unknown): OpenAIProviderConfig | null => {
  if (!isRecord(provider)) return null;
  const name = provider.name || provider.id;
  const baseUrl = provider['base-url'] ?? provider.baseUrl;
  if (!name || !baseUrl) return null;

  let apiKeyEntries: ApiKeyEntry[] = [];
  if (Array.isArray(provider['api-key-entries'])) {
    apiKeyEntries = provider['api-key-entries']
      .map((entry) => normalizeApiKeyEntry(entry))
      .filter(Boolean) as ApiKeyEntry[];
  } else if (Array.isArray(provider['api-keys'])) {
    apiKeyEntries = provider['api-keys']
      .map((key) => normalizeApiKeyEntry({ 'api-key': key }))
      .filter(Boolean) as ApiKeyEntry[];
  }

  const headers = normalizeHeaders(provider.headers);
  const models = normalizeModelAliases(provider.models);
  const priority = provider.priority ?? provider['priority'];
  const testModel = provider['test-model'] ?? provider.testModel;

  const result: OpenAIProviderConfig = {
    name: String(name),
    baseUrl: String(baseUrl),
    apiKeyEntries,
  };

  const prefix = normalizePrefix(provider.prefix ?? provider['prefix']);
  if (prefix) result.prefix = prefix;
  if (headers) result.headers = headers;
  if (models.length) result.models = models;
  if (priority !== undefined) result.priority = Number(priority);
  if (testModel) result.testModel = String(testModel);
  const authIndex = normalizeAuthIndex(
    provider['auth-index'] ?? provider.authIndex ?? provider['auth_index']
  );
  if (authIndex) result.authIndex = authIndex;
  return result;
};

const normalizeOauthExcluded = (payload: unknown): Record<string, string[]> | undefined => {
  if (!isRecord(payload)) return undefined;
  const source = payload['oauth-excluded-models'] ?? payload.items ?? payload;
  if (!isRecord(source)) return undefined;
  const map: Record<string, string[]> = {};
  Object.entries(source).forEach(([provider, models]) => {
    const key = String(provider || '').trim();
    if (!key) return;
    const normalized = normalizeExcludedModels(models);
    map[key.toLowerCase()] = normalized;
  });
  return map;
};

/**
 * 规范化 /config 返回值
 */
export const normalizeConfigResponse = (raw: unknown): Config => {
  const config: Config = { raw: isRecord(raw) ? raw : {} };
  if (!isRecord(raw)) {
    return config;
  }

  config.debug = normalizeBoolean(raw.debug);
  const proxyUrl = raw['proxy-url'] ?? raw.proxyUrl;
  config.proxyUrl =
    typeof proxyUrl === 'string'
      ? proxyUrl
      : proxyUrl === undefined || proxyUrl === null
        ? undefined
        : String(proxyUrl);
  const requestRetry = raw['request-retry'] ?? raw.requestRetry;
  config.requestRetry = normalizeNumber(requestRetry);
  const maxRetryCredentials = raw['max-retry-credentials'] ?? raw.maxRetryCredentials;
  config.maxRetryCredentials = normalizeNumber(maxRetryCredentials);
  const maxRetryInterval = raw['max-retry-interval'] ?? raw.maxRetryInterval;
  config.maxRetryInterval = normalizeNumber(maxRetryInterval);

  const quota = raw['quota-exceeded'] ?? raw.quotaExceeded;
  if (isRecord(quota)) {
    config.quotaExceeded = {
      switchProject: normalizeBoolean(quota['switch-project'] ?? quota.switchProject),
      switchPreviewModel: normalizeBoolean(
        quota['switch-preview-model'] ?? quota.switchPreviewModel
      ),
      antigravityCredits: normalizeBoolean(
        quota['antigravity-credits'] ?? quota.antigravityCredits
      ),
    };
  }

  config.usageStatisticsEnabled = normalizeBoolean(
    raw['usage-statistics-enabled'] ?? raw.usageStatisticsEnabled
  );
  config.usageStatisticsPersistIntervalSeconds = normalizeNumber(
    raw['usage-statistics-persist-interval-seconds'] ?? raw.usageStatisticsPersistIntervalSeconds
  );
  config.requestLog = normalizeBoolean(raw['request-log'] ?? raw.requestLog);
  config.requestBodyRelease = normalizeRequestBodyRelease(
    raw['request-body-release'] ?? raw.requestBodyRelease
  );
  config.requestBodyAudit = normalizeRequestBodyAudit(
    raw['request-body-audit'] ?? raw.requestBodyAudit
  );
  config.loggingToFile = normalizeBoolean(raw['logging-to-file'] ?? raw.loggingToFile);
  const logsMaxTotalSizeMb = raw['logs-max-total-size-mb'] ?? raw.logsMaxTotalSizeMb;
  config.logsMaxTotalSizeMb = normalizeNumber(logsMaxTotalSizeMb);
  config.wsAuth = normalizeBoolean(raw['ws-auth'] ?? raw.wsAuth);
  config.forceModelPrefix = normalizeBoolean(raw['force-model-prefix'] ?? raw.forceModelPrefix);
  config.noCooldownStatusCodes = normalizeIntegerArray(
    raw['no-cooldown-status-codes'] ?? raw.noCooldownStatusCodes
  );
  config.fixedErrorCooldowns = normalizeFixedErrorCooldowns(
    raw['fixed-error-cooldowns'] ?? raw.fixedErrorCooldowns
  );
  config.nonRetryableErrors = normalizeNonRetryableErrors(
    raw['non-retryable-errors'] ?? raw.nonRetryableErrors
  );
  config.authModelExclusions = normalizeAuthModelExclusions(
    raw['auth-model-exclusions'] ?? raw.authModelExclusions
  );
  config.disabledImageGenerationToolFallback = normalizeBoolean(
    raw['disabled-image-generation-tool-fallback'] ?? raw.disabledImageGenerationToolFallback
  );
  config.disabledImageGenerationToolAction = normalizeString(
    raw['disabled-image-generation-tool-action'] ?? raw.disabledImageGenerationToolAction
  );
  const disabledImageGenerationToolError =
    raw['disabled-image-generation-tool-error'] ?? raw.disabledImageGenerationToolError;
  if (isRecord(disabledImageGenerationToolError)) {
    config.disabledImageGenerationToolError = {
      statusCode: normalizeNumber(
        disabledImageGenerationToolError['status-code'] ??
          disabledImageGenerationToolError.statusCode
      ),
      message: normalizeString(disabledImageGenerationToolError.message),
      type: normalizeString(disabledImageGenerationToolError.type),
      code: normalizeString(disabledImageGenerationToolError.code),
    };
  }
  const remoteManagement = raw['remote-management'] ?? raw.remoteManagement;
  if (isRecord(remoteManagement)) {
    config.remoteManagement = {
      allowRemote: normalizeBoolean(
        remoteManagement['allow-remote'] ?? remoteManagement.allowRemote
      ),
      secretKey: normalizeString(remoteManagement['secret-key'] ?? remoteManagement.secretKey),
      disableControlPanel: normalizeBoolean(
        remoteManagement['disable-control-panel'] ?? remoteManagement.disableControlPanel
      ),
      accessPath: normalizeString(remoteManagement['access-path'] ?? remoteManagement.accessPath),
      panelGithubRepository: normalizeString(
        remoteManagement['panel-github-repository'] ??
          remoteManagement.panelGithubRepository ??
          remoteManagement['panel-repo'] ??
          remoteManagement.panelRepo
      ),
    };
  }
  const codex = raw.codex;
  if (isRecord(codex)) {
    config.codex = {
      identityConfuse: normalizeBoolean(codex['identity-confuse'] ?? codex.identityConfuse),
    };
  }
  const codexFingerprint = raw['codex-fingerprint'] ?? raw.codexFingerprint;
  if (isRecord(codexFingerprint)) {
    config.codexFingerprint = {
      ja3: normalizeBoolean(codexFingerprint.ja3 ?? codexFingerprint.JA3),
      forceHTTP1: normalizeBoolean(
        codexFingerprint['force-http1'] ??
          codexFingerprint.forceHTTP1 ??
          codexFingerprint.forceHttp1
      ),
      imagesForceHTTP1: normalizeBoolean(
        codexFingerprint['images-force-http1'] ??
          codexFingerprint.imagesForceHTTP1 ??
          codexFingerprint.imagesForceHttp1
      ),
    };
  }
  const codexHeaderDefaults = raw['codex-header-defaults'] ?? raw.codexHeaderDefaults;
  if (isRecord(codexHeaderDefaults)) {
    config.codexHeaderDefaults = {
      userAgent: normalizeString(
        codexHeaderDefaults['user-agent'] ?? codexHeaderDefaults.userAgent
      ),
      betaFeatures: normalizeString(
        codexHeaderDefaults['beta-features'] ?? codexHeaderDefaults.betaFeatures
      ),
      originator: normalizeString(codexHeaderDefaults.originator),
    };
  }
  const pprof = raw.pprof;
  if (isRecord(pprof)) {
    const management = pprof.management;
    config.pprof = {
      enable: normalizeBoolean(pprof.enable),
      addr: normalizeString(pprof.addr),
      management: isRecord(management)
        ? {
            profiles: normalizeStringArray(management.profiles),
            formats: normalizeStringArray(management.formats),
            goToolAvailable: normalizeBoolean(
              management['go_tool_available'] ?? management.goToolAvailable
            ),
            graphvizAvailable: normalizeBoolean(
              management['graphviz_available'] ?? management.graphvizAvailable
            ),
            maxSeconds: normalizeNumber(management['max_seconds'] ?? management.maxSeconds),
          }
        : undefined,
    };
  }
  const authMaintenance = raw['auth-maintenance'] ?? raw.authMaintenance;
  if (isRecord(authMaintenance)) {
    config.authMaintenance = {
      enable: normalizeBoolean(authMaintenance.enable),
      scanIntervalSeconds: normalizeNumber(
        authMaintenance['scan-interval-seconds'] ?? authMaintenance.scanIntervalSeconds
      ),
      deleteIntervalSeconds: normalizeNumber(
        authMaintenance['delete-interval-seconds'] ?? authMaintenance.deleteIntervalSeconds
      ),
      deleteStatusCodes: normalizeIntegerArray(
        authMaintenance['delete-status-codes'] ?? authMaintenance.deleteStatusCodes
      ),
      deleteQuotaExceeded: normalizeBoolean(
        authMaintenance['delete-quota-exceeded'] ?? authMaintenance.deleteQuotaExceeded
      ),
      quotaStrikeThreshold: normalizeNumber(
        authMaintenance['quota-strike-threshold'] ?? authMaintenance.quotaStrikeThreshold
      ),
      disableQuotaExceeded: normalizeBoolean(
        authMaintenance['disable-quota-exceeded'] ?? authMaintenance.disableQuotaExceeded
      ),
      disableQuotaStrikeThreshold: normalizeNumber(
        authMaintenance['disable-quota-strike-threshold'] ??
          authMaintenance.disableQuotaStrikeThreshold
      ),
    };
  }
  const streaming = raw.streaming;
  if (isRecord(streaming)) {
    config.streaming = {
      keepaliveSeconds: normalizeNumber(
        streaming['keepalive-seconds'] ?? streaming.keepaliveSeconds
      ),
      bootstrapRetries: normalizeNumber(
        streaming['bootstrap-retries'] ?? streaming.bootstrapRetries
      ),
      enableStreamFlush: normalizeBoolean(
        streaming['enable-stream-flush'] ?? streaming.enableStreamFlush
      ),
      streamFlushIntervalMs: normalizeNumber(
        streaming['stream-flush-interval-ms'] ??
          streaming.streamFlushIntervalMs ??
          streaming.streamFlushIntervalMS
      ),
      streamFlushMinBytes: normalizeNumber(
        streaming['stream-flush-min-bytes'] ?? streaming.streamFlushMinBytes
      ),
      trustUpstreamSSE: normalizeBoolean(
        streaming['trust-upstream-sse'] ?? streaming.trustUpstreamSSE ?? streaming.trustUpstreamSse
      ),
    };
  }
  const images = raw.images;
  if (isRecord(images)) {
    const codexModel = images['codex-model'] ?? images.codexModel;
    const imageModel = images['image-model'] ?? images.imageModel;
    const native = isRecord(images.native) ? images.native : undefined;
    const nativeGenerations = normalizeNativeImageEndpoint(native?.generations);
    const nativeEdits = normalizeNativeImageEndpoint(native?.edits);
    config.images = {
      codexModel:
        typeof codexModel === 'string'
          ? codexModel
          : codexModel === undefined || codexModel === null
            ? undefined
            : String(codexModel),
      imageModel:
        typeof imageModel === 'string'
          ? imageModel
          : imageModel === undefined || imageModel === null
            ? undefined
            : String(imageModel),
      enableFreePlanImageModel: normalizeBoolean(
        images['enable-free-plan-image-model'] ?? images.enableFreePlanImageModel
      ),
      enableNAggregation: normalizeBoolean(
        images['enable-n-aggregation'] ?? images.enableNAggregation
      ),
      enableStreamFlush: normalizeBoolean(
        images['enable-stream-flush'] ?? images.enableStreamFlush
      ),
      unsupportedStatusCode: normalizeNumber(
        images['unsupported-status-code'] ?? images.unsupportedStatusCode
      ),
      overrideUnsupportedParams: normalizeBoolean(
        images['override-unsupported-params'] ?? images.overrideUnsupportedParams
      ),
      overrideResponseFormatUrl: normalizeBoolean(
        images['override-response-format-url'] ??
          images.overrideResponseFormatUrl ??
          images.overrideResponseFormatURL
      ),
      responseFormatUrlDataUrl: normalizeBoolean(
        images['response-format-url-data-url'] ??
          images.responseFormatUrlDataUrl ??
          images.responseFormatURLDataURL
      ),
      overrideTransparentBackground: normalizeBoolean(
        images['override-transparent-background'] ?? images.overrideTransparentBackground
      ),
      overrideInputFidelity: normalizeBoolean(
        images['override-input-fidelity'] ?? images.overrideInputFidelity
      ),
      streamFlushIntervalMs: normalizeNumber(
        images['stream-flush-interval-ms'] ??
          images.streamFlushIntervalMs ??
          images.streamFlushIntervalMS
      ),
      streamFlushMinBytes: normalizeNumber(
        images['stream-flush-min-bytes'] ?? images.streamFlushMinBytes
      ),
      native:
        nativeGenerations || nativeEdits
          ? {
              generations: nativeGenerations,
              edits: nativeEdits,
            }
          : undefined,
    };
  }
  const routing = raw.routing;
  const strategyRaw = isRecord(routing)
    ? (routing.strategy ?? routing['strategy'])
    : (raw['routing-strategy'] ?? raw.routingStrategy);
  if (strategyRaw !== undefined && strategyRaw !== null) {
    config.routingStrategy = String(strategyRaw);
  }
  if (isRecord(routing)) {
    const fillFirstRange = normalizeNumber(routing['fill-first-range'] ?? routing.fillFirstRange);
    if (
      fillFirstRange !== undefined &&
      Number.isSafeInteger(fillFirstRange) &&
      fillFirstRange >= 1
    ) {
      config.routingFillFirstRange = fillFirstRange;
    }
    const fillFirstPerAuthRpm = normalizeNumber(
      routing['fill-first-per-auth-rpm'] ?? routing.fillFirstPerAuthRpm
    );
    if (
      fillFirstPerAuthRpm !== undefined &&
      Number.isSafeInteger(fillFirstPerAuthRpm) &&
      fillFirstPerAuthRpm >= 0
    ) {
      config.routingFillFirstPerAuthRpm = fillFirstPerAuthRpm;
    }
    config.routingPriorityOverrides = normalizeRoutingPriorityOverrides(
      routing['priority-overrides'] ?? routing.priorityOverrides
    );
    config.routingSessionAffinity = normalizeBoolean(
      routing['session-affinity'] ?? routing.sessionAffinity
    );
    const failoverRaw = routing['session-affinity-failover'] ?? routing.sessionAffinityFailover;
    config.routingSessionAffinityFailover =
      failoverRaw === undefined || failoverRaw === null ? true : normalizeBoolean(failoverRaw);
    config.routingSessionAffinityTTL = normalizeString(
      routing['session-affinity-ttl'] ?? routing.sessionAffinityTTL
    );
  }
  const apiKeysRaw = raw['api-keys'] ?? raw.apiKeys;
  if (Array.isArray(apiKeysRaw)) {
    config.apiKeys = apiKeysRaw.map((key) => String(key)).filter((key) => key.trim() !== '');
  }

  const geminiList = raw['gemini-api-key'] ?? raw.geminiApiKey ?? raw.geminiApiKeys;
  if (Array.isArray(geminiList)) {
    config.geminiApiKeys = geminiList
      .map((item) => normalizeGeminiKeyConfig(item))
      .filter(Boolean) as GeminiKeyConfig[];
  }

  const interactionsList =
    raw['interactions-api-key'] ?? raw.interactionsApiKey ?? raw.interactionsApiKeys;
  if (Array.isArray(interactionsList)) {
    config.interactionsApiKeys = interactionsList
      .map((item) => normalizeGeminiKeyConfig(item))
      .filter(Boolean) as GeminiKeyConfig[];
  }

  const codexList = raw['codex-api-key'] ?? raw.codexApiKey ?? raw.codexApiKeys;
  if (Array.isArray(codexList)) {
    config.codexApiKeys = codexList
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const claudeList = raw['claude-api-key'] ?? raw.claudeApiKey ?? raw.claudeApiKeys;
  if (Array.isArray(claudeList)) {
    config.claudeApiKeys = claudeList
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const vertexList = raw['vertex-api-key'] ?? raw.vertexApiKey ?? raw.vertexApiKeys;
  if (Array.isArray(vertexList)) {
    config.vertexApiKeys = vertexList
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const openaiList =
    raw['openai-compatibility'] ?? raw.openaiCompatibility ?? raw.openAICompatibility;
  if (Array.isArray(openaiList)) {
    config.openaiCompatibility = openaiList
      .map((item) => normalizeOpenAIProvider(item))
      .filter(Boolean) as OpenAIProviderConfig[];
  }

  const oauthExcluded = normalizeOauthExcluded(
    raw['oauth-excluded-models'] ?? raw.oauthExcludedModels
  );
  if (oauthExcluded) {
    config.oauthExcludedModels = oauthExcluded;
  }

  const codexCustomModels = normalizeCodexCustomModels(
    raw['codex-custom-models'] ?? raw.codexCustomModels
  );
  if (codexCustomModels) {
    config.codexCustomModels = codexCustomModels;
  }

  return config;
};

export {
  normalizeApiKeyEntry,
  normalizeGeminiKeyConfig,
  normalizeModelAliases,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
  normalizeHeaders,
  normalizeExcludedModels,
  normalizeCodexCustomModels,
};
