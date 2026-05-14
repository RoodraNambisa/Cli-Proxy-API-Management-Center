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
  | 'authMaintenance.scanIntervalSeconds'
  | 'authMaintenance.deleteIntervalSeconds'
  | 'authMaintenance.deleteStatusCodes'
  | 'authMaintenance.quotaStrikeThreshold'
  | 'authMaintenance.disableQuotaStrikeThreshold'
  | 'images.unsupportedStatusCode'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type VisualConfigValidationErrorCode =
  | 'port_range'
  | 'management_access_path'
  | 'http_status_range'
  | 'non_negative_integer'
  | 'integer_list'
  | 'http_status_list'
  | 'codex_custom_model_id_required'
  | 'codex_custom_model_id_duplicate'
  | 'codex_custom_model_groups_required';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
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

export interface ImagesVisualConfig {
  codexModel: string;
  imageModel: string;
  enableFreePlanImageModel: boolean;
  enableNAggregation: boolean;
  overrideResponseFormatUrl: boolean;
  responseFormatUrlDataUrl: boolean;
  overrideTransparentBackground: boolean;
  overrideInputFidelity: boolean;
  unsupportedStatusCode: string;
}

export interface CodexCustomModelVisualEntry {
  clientId: string;
  id: string;
  displayName: string;
  groups: CodexCustomModelGroup[];
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
  proxyUrl: string;
  enableGeminiCliEndpoint: boolean;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  noCooldownStatusCodes: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  authMaintenance: AuthMaintenanceVisualConfig;
  images: ImagesVisualConfig;
  routingStrategy: 'round-robin' | 'fill-first' | 'random';
  routingSessionAffinity: boolean;
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
  proxyUrl: '',
  enableGeminiCliEndpoint: false,
  forceModelPrefix: false,
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  noCooldownStatusCodes: '',
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
    overrideResponseFormatUrl: false,
    responseFormatUrlDataUrl: false,
    overrideTransparentBackground: false,
    overrideInputFidelity: false,
    unsupportedStatusCode: '400',
  },
  routingStrategy: 'round-robin',
  routingSessionAffinity: false,
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
    nonstreamKeepaliveInterval: '',
  },
};
