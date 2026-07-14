export type ConfigPageGroupId = 'global' | 'providers' | 'advanced';

export type ConfigPageId =
  | 'global-basics'
  | 'global-credentials'
  | 'global-network'
  | 'global-request'
  | 'global-observability'
  | 'global-streaming'
  | 'provider-codex'
  | 'provider-antigravity'
  | 'provider-grok'
  | 'advanced-payload';

export type ConfigPageDefinition = {
  id: ConfigPageId;
  group: ConfigPageGroupId;
  titleKey: string;
  descriptionKey: string;
  dirtyPrefixes: string[];
};

export type ConfigSearchDefinition = {
  id: string;
  pageId: ConfigPageId;
  labelKey: string;
  yamlKeys: string[];
  aliases?: string[];
};

export const DEFAULT_CONFIG_PAGE_ID: ConfigPageId = 'global-basics';

export const CONFIG_PAGE_DEFINITIONS: ConfigPageDefinition[] = [
  {
    id: 'global-basics',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_basics.title',
    descriptionKey: 'config_management.settings_center.pages.global_basics.description',
    dirtyPrefixes: [
      'host',
      'port',
      'tls',
      'rmAllowRemote',
      'rmDisableControlPanel',
      'rmAccessPath',
      'rmPanelRepo',
    ],
  },
  {
    id: 'global-credentials',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_credentials.title',
    descriptionKey: 'config_management.settings_center.pages.global_credentials.description',
    dirtyPrefixes: ['authDir', 'rmSecretKey', 'apiKeysText', 'authModelExclusions'],
  },
  {
    id: 'global-network',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_network.title',
    descriptionKey: 'config_management.settings_center.pages.global_network.description',
    dirtyPrefixes: [
      'proxyUrl',
      'requestRetry',
      'maxRetry',
      'routing',
      'forceModelPrefix',
      'wsAuth',
    ],
  },
  {
    id: 'global-request',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_request.title',
    descriptionKey: 'config_management.settings_center.pages.global_request.description',
    dirtyPrefixes: [
      'nonRetryableErrors',
      'fixedErrorCooldowns',
      'noCooldownStatusCodes',
      'quotaSwitchProject',
      'quotaSwitchPreviewModel',
    ],
  },
  {
    id: 'global-observability',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_observability.title',
    descriptionKey: 'config_management.settings_center.pages.global_observability.description',
    dirtyPrefixes: [
      'authMaintenance',
      'debug',
      'commercialMode',
      'loggingToFile',
      'logsMaxTotalSizeMb',
      'usageStatistics',
      'pprof',
    ],
  },
  {
    id: 'global-streaming',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_streaming.title',
    descriptionKey: 'config_management.settings_center.pages.global_streaming.description',
    dirtyPrefixes: ['streaming'],
  },
  {
    id: 'provider-codex',
    group: 'providers',
    titleKey: 'config_management.settings_center.pages.provider_codex.title',
    descriptionKey: 'config_management.settings_center.pages.provider_codex.description',
    dirtyPrefixes: [
      'codexCustomModels',
      'codexIdentityConfuse',
      'codexFingerprint',
      'codexHeaderDefaults',
      'disabledImageGenerationTool',
      'images',
    ],
  },
  {
    id: 'provider-antigravity',
    group: 'providers',
    titleKey: 'config_management.settings_center.pages.provider_antigravity.title',
    descriptionKey: 'config_management.settings_center.pages.provider_antigravity.description',
    dirtyPrefixes: ['quotaAntigravityCredits'],
  },
  {
    id: 'provider-grok',
    group: 'providers',
    titleKey: 'config_management.settings_center.pages.provider_grok.title',
    descriptionKey: 'config_management.settings_center.pages.provider_grok.description',
    dirtyPrefixes: [],
  },
  {
    id: 'advanced-payload',
    group: 'advanced',
    titleKey: 'config_management.settings_center.pages.advanced_payload.title',
    descriptionKey: 'config_management.settings_center.pages.advanced_payload.description',
    dirtyPrefixes: ['payload'],
  },
];

export const CONFIG_PAGE_IDS = new Set<ConfigPageId>(
  CONFIG_PAGE_DEFINITIONS.map((page) => page.id)
);

export const CONFIG_SEARCH_DEFINITIONS: ConfigSearchDefinition[] = [
  {
    id: 'config-host',
    pageId: 'global-basics',
    labelKey: 'config_management.visual.sections.server.host',
    yamlKeys: ['host'],
  },
  {
    id: 'config-port',
    pageId: 'global-basics',
    labelKey: 'config_management.visual.sections.server.port',
    yamlKeys: ['port'],
  },
  {
    id: 'config-tls',
    pageId: 'global-basics',
    labelKey: 'config_management.visual.sections.tls.title',
    yamlKeys: ['tls', 'tls.cert', 'tls.key'],
  },
  {
    id: 'config-remote-management',
    pageId: 'global-basics',
    labelKey: 'config_management.visual.sections.remote.title',
    yamlKeys: ['remote-management', 'access-path', 'panel-repo'],
  },
  {
    id: 'config-management-key',
    pageId: 'global-credentials',
    labelKey: 'config_management.visual.sections.remote.secret_key',
    yamlKeys: ['remote-management.secret-key', 'secret-key'],
    aliases: ['management key', '管理密钥'],
  },
  {
    id: 'config-auth-dir',
    pageId: 'global-credentials',
    labelKey: 'config_management.visual.sections.auth.auth_dir',
    yamlKeys: ['auth-dir'],
  },
  {
    id: 'config-api-keys',
    pageId: 'global-credentials',
    labelKey: 'config_management.visual.api_keys.label',
    yamlKeys: ['api-keys'],
  },
  {
    id: 'config-auth-model-exclusions',
    pageId: 'global-credentials',
    labelKey: 'config_management.visual.sections.auth.auth_model_exclusions',
    yamlKeys: ['auth-model-exclusions'],
  },
  {
    id: 'config-proxy-url',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.proxy_url',
    yamlKeys: ['proxy-url'],
    aliases: ['proxy', '代理'],
  },
  {
    id: 'config-request-retry',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.request_retry',
    yamlKeys: ['request-retry'],
  },
  {
    id: 'config-max-retry-credentials',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.max_retry_credentials',
    yamlKeys: ['max-retry-credentials'],
  },
  {
    id: 'config-max-retry-interval',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.max_retry_interval',
    yamlKeys: ['max-retry-interval'],
  },
  {
    id: 'config-routing',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.routing_strategy',
    yamlKeys: [
      'routing.strategy',
      'routing.priority-overrides',
      'routing.fill-first-range',
      'routing.fill-first-per-auth-rpm',
    ],
    aliases: ['route', '路由', '填充范围', 'fill first'],
  },
  {
    id: 'config-routing-priority-overrides',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.priority_overrides',
    yamlKeys: [
      'routing.priority-overrides',
      'routing.priority-overrides[].priority',
      'routing.priority-overrides[].strategy',
      'routing.priority-overrides[].max-retry-credentials',
      'routing.priority-overrides[].fill-first-range',
      'routing.priority-overrides[].fill-first-per-auth-rpm',
    ],
  },
  {
    id: 'config-session-affinity',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.session_affinity',
    yamlKeys: [
      'routing.session-affinity',
      'routing.session-affinity-ttl',
      'routing.session-affinity-failover',
    ],
  },
  {
    id: 'config-force-model-prefix',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.force_model_prefix',
    yamlKeys: ['force-model-prefix'],
  },
  {
    id: 'config-ws-auth',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.ws_auth',
    yamlKeys: ['ws-auth'],
    aliases: ['websocket auth', 'WebSocket 鉴权'],
  },
  {
    id: 'request-body-release',
    pageId: 'global-request',
    labelKey: 'config_management.request_body_release.title',
    yamlKeys: [
      'request-body-release',
      'request-body-release.enable',
      'request-body-release.log-only',
      'request-body-release.after-seconds',
      'request-body-release.min-body-bytes',
    ],
  },
  {
    id: 'request-body-audit',
    pageId: 'global-request',
    labelKey: 'config_management.request_body_audit.title',
    yamlKeys: [
      'request-body-audit',
      'request-body-audit.enable',
      'request-body-audit.keywords',
      'request-body-audit.keywords-base64',
      'request-body-audit.case-sensitive',
      'request-body-audit.max-body-bytes',
      'request-body-audit.reject-oversize',
      'request-body-audit.error.status-code',
    ],
  },
  {
    id: 'config-non-retryable-errors',
    pageId: 'global-request',
    labelKey: 'config_management.visual.sections.network.non_retryable_errors',
    yamlKeys: ['non-retryable-errors'],
  },
  {
    id: 'config-fixed-error-cooldowns',
    pageId: 'global-request',
    labelKey: 'config_management.visual.sections.quota.fixed_error_cooldowns',
    yamlKeys: ['fixed-error-cooldowns'],
  },
  {
    id: 'config-no-cooldown-status-codes',
    pageId: 'global-request',
    labelKey: 'config_management.visual.sections.quota.no_cooldown_status_codes',
    yamlKeys: ['no-cooldown-status-codes'],
  },
  {
    id: 'config-quota-fallback',
    pageId: 'global-request',
    labelKey: 'config_management.visual.sections.quota.switch_project',
    yamlKeys: ['quota-exceeded.switch-project', 'quota-exceeded.switch-preview-model'],
    aliases: ['quota fallback', '配额回退'],
  },
  {
    id: 'config-system-mode',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.system.debug',
    yamlKeys: ['debug', 'commercial-mode'],
    aliases: ['commercial', '商业模式'],
  },
  {
    id: 'config-auth-maintenance',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.maintenance.title',
    yamlKeys: ['auth-maintenance'],
  },
  {
    id: 'config-logging',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.system.logging_to_file',
    yamlKeys: ['logging-to-file', 'logs-max-total-size-mb'],
  },
  {
    id: 'config-usage-statistics',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.system.usage_statistics',
    yamlKeys: ['usage-statistics-enabled', 'usage-statistics-persist-interval-seconds'],
  },
  {
    id: 'config-pprof',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.system.pprof_enable',
    yamlKeys: ['pprof.enable', 'pprof.addr'],
  },
  {
    id: 'config-streaming',
    pageId: 'global-streaming',
    labelKey: 'config_management.visual.sections.streaming.title',
    yamlKeys: ['streaming', 'keepalive-seconds', 'bootstrap-retries', 'trust-upstream-sse'],
  },
  {
    id: 'config-codex-custom-models',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.codex_custom_models.title',
    yamlKeys: ['codex-custom-models'],
  },
  {
    id: 'config-codex-fingerprint',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.network.codex_fingerprint_ja3',
    yamlKeys: [
      'codex-identity-confuse',
      'codex-fingerprint',
      'codex-fingerprint.ja3',
      'codex-fingerprint.force-http1',
      'codex-fingerprint.images-force-http1',
    ],
    aliases: ['ja3', 'tls clienthello', '身份混淆', '指纹'],
  },
  {
    id: 'config-codex-headers',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.network.codex_header_defaults_user_agent',
    yamlKeys: [
      'codex-header-defaults',
      'codex-header-defaults.user-agent',
      'codex-header-defaults.beta-features',
      'codex-header-defaults.originator',
    ],
  },
  {
    id: 'config-codex-image-tool',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.auth.disabled_image_tool_policy',
    yamlKeys: ['disabled-image-generation-tool-action', 'disabled-image-generation-tool-fallback'],
  },
  {
    id: 'images-native-generations',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.images.native_generations_title',
    yamlKeys: [
      'images.native.generations',
      'images.native.generations.enabled',
      'images.native.generations.models',
      'images.native.generations.param-rules',
      'images.native.generations.unsupported-model-status-code',
      'images.native.generations.unsupported-model-message',
    ],
  },
  {
    id: 'images-native-edits',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.images.native_edits_title',
    yamlKeys: [
      'images.native.edits',
      'images.native.edits.enabled',
      'images.native.edits.models',
      'images.native.edits.param-rules',
      'images.native.edits.unsupported-model-status-code',
      'images.native.edits.unsupported-model-message',
    ],
  },
  {
    id: 'config-images-legacy',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.images.legacy_responses_tool_settings',
    yamlKeys: ['images.codex-model', 'images.image-model'],
  },
  {
    id: 'config-images-stream-flush',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.images.stream_flush_settings',
    yamlKeys: ['images.stream-flush-interval-ms', 'images.stream-flush-min-bytes'],
  },
  {
    id: 'config-antigravity-credits',
    pageId: 'provider-antigravity',
    labelKey: 'config_management.visual.sections.quota.antigravity_credits',
    yamlKeys: ['quota-exceeded.antigravity-credits'],
  },
  {
    id: 'config-grok-auth',
    pageId: 'provider-grok',
    labelKey: 'config_management.settings_center.grok.auth_files',
    yamlKeys: ['xai', 'grok', 'using_api', 'websockets'],
  },
  {
    id: 'config-payload-rules',
    pageId: 'advanced-payload',
    labelKey: 'config_management.visual.sections.payload.title',
    yamlKeys: ['payload.default', 'payload.override', 'payload.filter'],
  },
];

export function isConfigPageId(value: string | null | undefined): value is ConfigPageId {
  return Boolean(value && CONFIG_PAGE_IDS.has(value as ConfigPageId));
}

const CONFIG_SECTION_ALIASES: Record<string, { pageId: ConfigPageId; targetId?: string }> = {
  'codex-images': { pageId: 'provider-codex', targetId: 'images-native-generations' },
  'request-body': { pageId: 'global-request', targetId: 'request-body-release' },
};

export function resolveConfigSection(
  value: string | null | undefined
): { pageId: ConfigPageId; targetId?: string } | null {
  if (!value) return null;
  if (isConfigPageId(value)) return { pageId: value };
  const alias = CONFIG_SECTION_ALIASES[value];
  if (alias) return alias;
  const searchItem = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === value);
  return searchItem ? { pageId: searchItem.pageId, targetId: searchItem.id } : null;
}

export function configPageHasDirtyFields(
  page: ConfigPageDefinition,
  dirtyFields: string[]
): boolean {
  return dirtyFields.some((field) =>
    page.dirtyPrefixes.some((prefix) => field === prefix || field.startsWith(prefix))
  );
}
