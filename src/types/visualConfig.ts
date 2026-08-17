import type { CodexCustomModelGroup, CodexTurnStatePolicy } from './config';
import { DEFAULT_CODEX_TURN_STATE_POLICY } from './config';

export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'rmAccessPath'
  | 'logsMaxTotalSizeMb'
  | 'logsRetentionDays'
  | 'usageStatisticsPersistIntervalSeconds'
  | 'usageStatisticsDetailRetentionDays'
  | 'usageStatisticsMaxStorageMegabytes'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'noCooldownStatusCodes'
  | 'chatgptWebAutoDeleteDeadPriorities'
  | 'chatgptWebAutoReloginWorkers'
  | 'chatgptWebAutoReloginQueueSize'
  | 'chatgptWebStrictSize'
  | 'chatgptWebAspectRatioMaxErrorPercent'
  | 'chatgptWebMaxResizeEdgePixels'
  | 'chatgptWebResizeToRequestedSize'
  | 'chatgptWebResizeFilter'
  | 'chatgptWebMaxImageResponseMegabytes'
  | 'chatgptWebMaxN'
  | 'chatgptWebImageMaxInFlight'
  | 'chatgptWebImageAdmissionQueueSize'
  | 'chatgptWebImageAdmissionWaitMilliseconds'
  | 'chatgptWebImageMaxFinalizers'
  | 'chatgptWebImageCompletionReserveMegabytes'
  | 'chatgptWebImageMemoryCapacityMegabytes'
  | 'chatgptWebImagePollConcurrency'
  | 'chatgptWebImageMemoryFinalizerConcurrency'
  | 'routingFillFirstRange'
  | 'routingFillFirstPerAuthRpm'
  | 'routingPerAuthRequestLimit'
  | 'routingPerAuthRequestWindowMinutes'
  | 'fixedErrorCooldowns'
  | 'errorResponseRewrites'
  | 'nonRetryableErrors'
  | 'authModelExclusions'
  | 'disabledImageGenerationToolError.statusCode'
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
  | 'routing_subscription_plan_required'
  | 'routing_subscription_limit_required'
  | 'routing_subscription_overlap'
  | 'fill_first_controls_conflict'
  | 'fixed_error_cooldown_match_required'
  | 'non_retryable_error_match_required'
  | 'error_response_rewrite_match_required'
  | 'error_response_rewrite_result_required'
  | 'json_object'
  | 'auth_model_exclusion_models_required'
  | 'auth_model_exclusion_match_required'
  | 'integer_list'
  | 'http_status_list'
  | 'codex_custom_model_id_required'
  | 'codex_custom_model_id_duplicate'
  | 'codex_custom_model_groups_required'
  | 'number_range_0_10'
  | 'integer_range_1_3840'
  | 'integer_range_1_256'
  | 'integer_range_1_1000000'
  | 'integer_range_1_10'
  | 'integer_range_0_512'
  | 'strict_size_requires_aspect_adaptation'
  | 'resize_requires_aspect_adaptation'
  | 'resize_filter';

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

export interface ErrorResponseRewriteVisualEntry {
  clientId: string;
  statusCode: string;
  messageContains: string;
  responseStatusCode: string;
  responseBodyEnabled: boolean;
  responseBody: string;
}

export interface AuthModelExclusionVisualEntry {
  clientId: string;
  providers: string[];
  models: string[];
  priorities: string[];
  keywordContains: string[];
  disableImageGeneration: boolean;
}

export type DisabledImageGenerationToolAction = 'remove' | 'error';

export interface DisabledImageGenerationToolErrorVisualConfig {
  statusCode: string;
  message: string;
  type: string;
  code: string;
}

export type RoutingPriorityOverrideStrategy = '' | 'round-robin' | 'fill-first' | 'random';

export interface RoutingSubscriptionOverrideVisualEntry {
  clientId: string;
  providers: string[];
  planTypes: string[];
  perAuthRequestLimit: string;
  perAuthRequestWindowMinutes: string;
}

export interface RoutingPriorityOverrideVisualEntry {
  clientId: string;
  priority: string;
  strategy: RoutingPriorityOverrideStrategy;
  maxRetryCredentials: string;
  fillFirstRange: string;
  fillFirstPerAuthRpm: string;
  perAuthRequestLimit: string;
  perAuthRequestWindowMinutes: string;
  subscriptionOverrides: RoutingSubscriptionOverrideVisualEntry[];
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
  rmAuthFilesPagination: boolean;
  rmLiveLogs: boolean;
  rmDiagnosticsDetailLevel: 'safe' | 'full';
  rmAccessPath: string;
  rmPanelRepo: string;
  authDir: string;
  apiKeysText: string;
  codexCustomModels: CodexCustomModelVisualEntry[];
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  logsRetentionDays: string;
  usageStatisticsEnabled: boolean;
  usageStatisticsPersistenceEnabled: boolean;
  usageStatisticsPersistIntervalSeconds: string;
  usageStatisticsDetailRetentionDays: string;
  usageStatisticsMaxStorageMegabytes: string;
  pprofEnable: boolean;
  pprofAddr: string;
  proxyUrl: string;
  forceModelPrefix: boolean;
  codexIdentityConfuse: boolean;
  codexSpoofSessionIdentity: boolean;
  codexTurnStatePolicy: CodexTurnStatePolicy;
  codexFingerprintJA3: boolean;
  codexFingerprintForceHTTP1: boolean;
  codexFingerprintImagesForceHTTP1: boolean;
  codexHeaderDefaultsUserAgent: string;
  codexHeaderDefaultsBetaFeatures: string;
  codexHeaderDefaultsOriginator: string;
  chatgptWebAutoRelogin: boolean;
  chatgptWebAutoReloginWorkers: string;
  chatgptWebAutoReloginQueueSize: string;
  chatgptWebApi798AutoLoginEnabled: boolean;
  chatgptWebSessionCookieRefreshOnTokenFailure: boolean;
  chatgptWebForceSessionRefreshOnImport: boolean;
  chatgptWebAutoDeleteDeadAuths: boolean;
  chatgptWebInvalidPasskeyResponseAsDead: boolean;
  chatgptWebAutoDeleteDeadPriorities: string[];
  chatgptWebImageUpstreamModel: string;
  chatgptWebIgnoreUnsupportedImageParams: boolean;
  chatgptWebAdaptSizeToAspectRatio: boolean;
  chatgptWebStrictSize: boolean;
  chatgptWebAspectRatioMaxErrorPercent: string;
  chatgptWebResizeToRequestedSize: boolean;
  chatgptWebResizeFilter: string;
  chatgptWebMaxResizeEdgePixels: string;
  chatgptWebMaxImageResponseMegabytes: string;
  chatgptWebMaxN: string;
  chatgptWebImageMaxInFlight: string;
  chatgptWebImageAdmissionQueueSize: string;
  chatgptWebImageAdmissionWaitMilliseconds: string;
  chatgptWebImageMaxFinalizers: string;
  chatgptWebImageCompletionReserveMegabytes: string;
  chatgptWebImageMemoryCapacityMegabytes: string;
  chatgptWebImagePollConcurrency: string;
  chatgptWebImageMemoryFinalizerConcurrency: string;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  noCooldownStatusCodes: string;
  fixedErrorCooldowns: FixedErrorCooldownVisualEntry[];
  errorResponseRewrites: ErrorResponseRewriteVisualEntry[];
  nonRetryableErrors: NonRetryableErrorVisualEntry[];
  authModelExclusions: AuthModelExclusionVisualEntry[];
  disabledImageGenerationToolFallback: boolean;
  disabledImageGenerationToolAction: DisabledImageGenerationToolAction;
  disabledImageGenerationToolError: DisabledImageGenerationToolErrorVisualConfig;
  quotaAntigravityCredits: boolean;
  authMaintenance: AuthMaintenanceVisualConfig;
  images: ImagesVisualConfig;
  routingStrategy: 'round-robin' | 'fill-first' | 'random';
  routingFillFirstRange: string;
  routingFillFirstPerAuthRpm: string;
  routingPerAuthRequestLimit: string;
  routingPerAuthRequestWindowMinutes: string;
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
  rmAuthFilesPagination: false,
  rmLiveLogs: false,
  rmDiagnosticsDetailLevel: 'safe',
  rmAccessPath: '',
  rmPanelRepo: '',
  authDir: '',
  apiKeysText: '',
  codexCustomModels: [],
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  logsRetentionDays: '',
  usageStatisticsEnabled: false,
  usageStatisticsPersistenceEnabled: true,
  usageStatisticsPersistIntervalSeconds: '',
  usageStatisticsDetailRetentionDays: '',
  usageStatisticsMaxStorageMegabytes: '',
  pprofEnable: false,
  pprofAddr: '',
  proxyUrl: '',
  forceModelPrefix: false,
  codexIdentityConfuse: false,
  codexSpoofSessionIdentity: false,
  codexTurnStatePolicy: DEFAULT_CODEX_TURN_STATE_POLICY,
  codexFingerprintJA3: false,
  codexFingerprintForceHTTP1: false,
  codexFingerprintImagesForceHTTP1: false,
  codexHeaderDefaultsUserAgent: '',
  codexHeaderDefaultsBetaFeatures: '',
  codexHeaderDefaultsOriginator: '',
  chatgptWebAutoRelogin: false,
  chatgptWebAutoReloginWorkers: '4',
  chatgptWebAutoReloginQueueSize: '4096',
  chatgptWebApi798AutoLoginEnabled: false,
  chatgptWebSessionCookieRefreshOnTokenFailure: false,
  chatgptWebForceSessionRefreshOnImport: true,
  chatgptWebAutoDeleteDeadAuths: false,
  chatgptWebInvalidPasskeyResponseAsDead: false,
  chatgptWebAutoDeleteDeadPriorities: [],
  chatgptWebImageUpstreamModel: 'gpt-5-5',
  chatgptWebIgnoreUnsupportedImageParams: false,
  chatgptWebAdaptSizeToAspectRatio: false,
  chatgptWebStrictSize: false,
  chatgptWebAspectRatioMaxErrorPercent: '1',
  chatgptWebResizeToRequestedSize: false,
  chatgptWebResizeFilter: 'catmull-rom',
  chatgptWebMaxResizeEdgePixels: '3840',
  chatgptWebMaxImageResponseMegabytes: '128',
  chatgptWebMaxN: '1',
  chatgptWebImageMaxInFlight: '64',
  chatgptWebImageAdmissionQueueSize: '64',
  chatgptWebImageAdmissionWaitMilliseconds: '1000',
  chatgptWebImageMaxFinalizers: '8',
  chatgptWebImageCompletionReserveMegabytes: '1',
  chatgptWebImageMemoryCapacityMegabytes: '512',
  chatgptWebImagePollConcurrency: '64',
  chatgptWebImageMemoryFinalizerConcurrency: '1',
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  noCooldownStatusCodes: '',
  fixedErrorCooldowns: [],
  errorResponseRewrites: [],
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
  disabledImageGenerationToolFallback: false,
  disabledImageGenerationToolAction: 'remove',
  disabledImageGenerationToolError: {
    statusCode: '400',
    message: 'image_generation tool is disabled for this credential',
    type: 'image_generation_disabled',
    code: 'image_generation_disabled',
  },
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
  routingFillFirstRange: '1',
  routingFillFirstPerAuthRpm: '0',
  routingPerAuthRequestLimit: '0',
  routingPerAuthRequestWindowMinutes: '1',
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
