import type { CodexCustomModelGroup } from './config';

export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'rmAccessPath'
  | 'logsMaxTotalSizeMb'
  | 'usageStatisticsPersistIntervalSeconds'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'noCooldownStatusCodes'
  | 'fixedErrorCooldowns'
  | 'nonRetryableErrors'
  | 'authModelExclusions'
  | 'routingPriorityOverrides'
  | 'authMaintenance.scanIntervalSeconds'
  | 'authMaintenance.deleteIntervalSeconds'
  | 'authMaintenance.deleteStatusCodes'
  | 'authMaintenance.quotaStrikeThreshold'
  | 'authMaintenance.disableQuotaStrikeThreshold'
  | 'images.unsupportedStatusCode'
  | 'images.streamFlushIntervalMs'
  | 'images.streamFlushMinBytes'
  | 'images.native.generations.unsupportedModelStatusCode'
  | 'images.native.edits.unsupportedModelStatusCode'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.streamFlushIntervalMs'
  | 'streaming.streamFlushMinBytes'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'management_access_path'
  | 'http_status_range'
  | 'non_negative_integer'
  | 'positive_integer'
  | 'http_status_code'
  | 'integer'
  | 'priority_duplicate'
  | 'fixed_error_cooldown_match_required'
  | 'non_retryable_error_match_required'
  | 'auth_model_exclusion_models_required'
  | 'auth_model_exclusion_match_required'
  | 'integer_list'
  | 'http_status_list'
  | 'codex_custom_model_id_required'
  | 'codex_custom_model_id_duplicate'
  | 'codex_custom_model_groups_required';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath | string, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  enableStreamFlush: boolean;
  streamFlushIntervalMs: string;
  streamFlushMinBytes: string;
  trustUpstreamSSE: boolean;
  nonstreamKeepaliveInterval: string;
}

export interface AuthMaintenanceVisualConfig {
  enable: boolean;
  scanIntervalSeconds: string;
  deleteIntervalSeconds: string;
  deleteStatusCodes: string;
  deleteQuotaExceeded: boolean;
  quotaStrikeThreshold: string;
  disableQuotaExceeded: boolean;
  disableQuotaStrikeThreshold: string;
}

export interface NativeImageEndpointVisualConfig {
  enabled: boolean;
  models: string[];
  paramRules: string[];
  unsupportedModelStatusCode: string;
  unsupportedModelMessage: string;
}

export interface NativeImagesVisualConfig {
  generations: NativeImageEndpointVisualConfig;
  edits: NativeImageEndpointVisualConfig;
}

export interface ImagesVisualConfig {
  codexModel: string;
  imageModel: string;
  enableFreePlanImageModel: boolean;
  enableNAggregation: boolean;
  enableStreamFlush: boolean;
  overrideResponseFormatUrl: boolean;
  responseFormatUrlDataUrl: boolean;
  overrideTransparentBackground: boolean;
  overrideInputFidelity: boolean;
  unsupportedStatusCode: string;
  streamFlushIntervalMs: string;
  streamFlushMinBytes: string;
  native: NativeImagesVisualConfig;
}

export interface CodexCustomModelVisualEntry {
  clientId: string;
  id: string;
  displayName: string;
  groups: CodexCustomModelGroup[];
}

export type FixedErrorCooldownScope = 'model' | 'auth';

export interface FixedErrorCooldownVisualEntry {
  clientId: string;
  statusCode: string;
  messageContains: string;
  cooldownSeconds: string;
  scope: FixedErrorCooldownScope;
}

export interface NonRetryableErrorVisualEntry {
  clientId: string;
  statusCode: string;
  type: string;
  code: string;
  messageContains: string;
}

export interface AuthModelExclusionVisualEntry {
  clientId: string;
  models: string[];
  priorities: string[];
  keywordContains: string[];
}

export type RoutingPriorityOverrideStrategy = '' | 'round-robin' | 'fill-first' | 'random';

export interface RoutingPriorityOverrideVisualEntry {
  clientId: string;
  priority: string;
  strategy: RoutingPriorityOverrideStrategy;
  maxRetryCredentials: string;
}

export type CodexCustomModelValidationErrors = Record<
  string,
  {
    id?: Extract<
      VisualConfigValidationErrorCode,
      'codex_custom_model_id_required' | 'codex_custom_model_id_duplicate'
    >;
    groups?: Extract<VisualConfigValidationErrorCode, 'codex_custom_model_groups_required'>;
  }
>;

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmAccessPath: string;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  codexCustomModels: CodexCustomModelVisualEntry[];
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  usageStatisticsEnabled: boolean;
  usageStatisticsPersistIntervalSeconds: string;
  pprofEnable: boolean;
  pprofAddr: string;
  proxyUrl: string;
  enableGeminiCliEndpoint: boolean;
  forceModelPrefix: boolean;
  codexIdentityConfuse: boolean;
  codexFingerprintJA3: boolean;
  codexFingerprintForceHTTP1: boolean;
  codexFingerprintImagesForceHTTP1: boolean;
  codexHeaderDefaultsUserAgent: string;
  codexHeaderDefaultsBetaFeatures: string;
  codexHeaderDefaultsOriginator: string;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  noCooldownStatusCodes: string;
  fixedErrorCooldowns: FixedErrorCooldownVisualEntry[];
  nonRetryableErrors: NonRetryableErrorVisualEntry[];
  authModelExclusions: AuthModelExclusionVisualEntry[];
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  authMaintenance: AuthMaintenanceVisualConfig;
  images: ImagesVisualConfig;
  routingStrategy: 'round-robin' | 'fill-first' | 'random';
  routingPriorityOverrides: RoutingPriorityOverrideVisualEntry[];
  routingSessionAffinity: boolean;
  routingSessionAffinityFailover: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  streaming: StreamingConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmAccessPath: '',
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  codexCustomModels: [],
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  usageStatisticsEnabled: false,
  usageStatisticsPersistIntervalSeconds: '',
  pprofEnable: false,
  pprofAddr: '',
  proxyUrl: '',
  enableGeminiCliEndpoint: false,
  forceModelPrefix: false,
  codexIdentityConfuse: false,
  codexFingerprintJA3: false,
  codexFingerprintForceHTTP1: false,
  codexFingerprintImagesForceHTTP1: false,
  codexHeaderDefaultsUserAgent: '',
  codexHeaderDefaultsBetaFeatures: '',
  codexHeaderDefaultsOriginator: '',
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  noCooldownStatusCodes: '',
  fixedErrorCooldowns: [],
  nonRetryableErrors: [
    {
      clientId: 'default-non-retryable-invalid-value',
      statusCode: '400',
      type: 'image_generation_user_error',
      code: 'invalid_value',
      messageContains: '',
    },
    {
      clientId: 'default-non-retryable-moderation-blocked',
      statusCode: '400',
      type: 'image_generation_user_error',
      code: 'moderation_blocked',
      messageContains: '',
    },
  ],
  authModelExclusions: [],
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAntigravityCredits: true,
  authMaintenance: {
    enable: false,
    scanIntervalSeconds: '30',
    deleteIntervalSeconds: '5',
    deleteStatusCodes: '401',
    deleteQuotaExceeded: false,
    quotaStrikeThreshold: '6',
    disableQuotaExceeded: false,
    disableQuotaStrikeThreshold: '6',
  },
  images: {
    codexModel: 'gpt-5.4',
    imageModel: 'gpt-image-2',
    enableFreePlanImageModel: false,
    enableNAggregation: false,
    enableStreamFlush: true,
    overrideResponseFormatUrl: false,
    responseFormatUrlDataUrl: false,
    overrideTransparentBackground: false,
    overrideInputFidelity: false,
    unsupportedStatusCode: '400',
    streamFlushIntervalMs: '0',
    streamFlushMinBytes: '0',
    native: {
      generations: {
        enabled: false,
        models: ['gpt-image-2', 'gpt-image-1.5'],
        paramRules: [],
        unsupportedModelStatusCode: '400',
        unsupportedModelMessage: 'Native image generation is not enabled for model {model}',
      },
      edits: {
        enabled: false,
        models: ['gpt-image-2', 'gpt-image-1.5'],
        paramRules: [],
        unsupportedModelStatusCode: '400',
        unsupportedModelMessage: 'Native image edit is not enabled for model {model}',
      },
    },
  },
  routingStrategy: 'round-robin',
  routingPriorityOverrides: [],
  routingSessionAffinity: false,
  routingSessionAffinityFailover: true,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    enableStreamFlush: false,
    streamFlushIntervalMs: '0',
    streamFlushMinBytes: '0',
    trustUpstreamSSE: false,
    nonstreamKeepaliveInterval: '',
  },
};
