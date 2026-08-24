export type ConfigPageGroupId = 'global' | 'providers' | 'advanced';

export type ConfigPageId =
  | 'global-basics'
  | 'global-interface'
  | 'global-credentials'
  | 'global-network'
  | 'global-request'
  | 'global-observability'
  | 'global-streaming'
  | 'provider-codex'
  | 'provider-antigravity'
  | 'provider-chatgpt-web'
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
      'rmAuthFilesPagination',
      'rmLiveLogs',
      'rmDiagnosticsDetailLevel',
      'rmAccessPath',
      'rmPanelRepo',
    ],
  },
  {
    id: 'global-interface',
    group: 'global',
    titleKey: 'config_management.settings_center.pages.global_interface.title',
    descriptionKey: 'config_management.settings_center.pages.global_interface.description',
    dirtyPrefixes: [],
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
      'errorResponseRewrites',
      'fixedErrorCooldowns',
      'noCooldownStatusCodes',
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
      'logsRetentionDays',
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
      'codexSpoofSessionIdentity',
      'codexTurnStatePolicy',
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
    id: 'provider-chatgpt-web',
    group: 'providers',
    titleKey: 'config_management.settings_center.pages.provider_chatgpt_web.title',
    descriptionKey: 'config_management.settings_center.pages.provider_chatgpt_web.description',
    dirtyPrefixes: [
      'chatgptWebAutoRelogin',
      'chatgptWebAutoReloginWorkers',
      'chatgptWebAutoReloginQueueSize',
      'chatgptWebApi798AutoLoginEnabled',
      'chatgptWebSessionCookieRefreshOnTokenFailure',
      'chatgptWebForceSessionRefreshOnImport',
      'chatgptWebAutoDeleteDead',
      'chatgptWebInvalidPasskeyResponseAsDead',
      'chatgptWebImageUpstreamModel',
      'chatgptWebIgnoreUnsupportedImageParams',
      'chatgptWebRemoteImageUrlEnabled',
      'chatgptWebRemoteImageUrlDownloadMode',
      'chatgptWebAdaptSizeToAspectRatio',
      'chatgptWebStrictSize',
      'chatgptWebAspectRatioMaxErrorPercent',
      'chatgptWebResizeToRequestedSize',
      'chatgptWebResizeFilter',
      'chatgptWebMaxResizeEdgePixels',
      'chatgptWebMaxImageResponseMegabytes',
      'chatgptWebMaxN',
      'chatgptWebImageMaxInFlight',
      'chatgptWebImageAdmissionQueueSize',
      'chatgptWebImageAdmissionWaitMilliseconds',
      'chatgptWebImageMaxFinalizers',
      'chatgptWebImageCompletionReserveMegabytes',
      'chatgptWebImageMemoryCapacityMegabytes',
      'chatgptWebImagePollConcurrency',
      'chatgptWebImageMemoryFinalizerConcurrency',
    ],
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
    id: 'config-frontend-features',
    pageId: 'global-interface',
    labelKey: 'config_management.settings_center.frontend_features.title',
    yamlKeys: ['local:frontend-feature-visibility'],
    aliases: ['feature visibility', 'frontend features', '功能显示', '功能顯示', 'Agent Identity'],
  },
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
    yamlKeys: [
      'remote-management',
      'access-path',
      'panel-repo',
      'auth-files-pagination',
      'live-logs',
      'diagnostics',
      'detail-level',
    ],
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
    id: 'config-proxy-pools',
    pageId: 'global-network',
    labelKey: 'proxy_pools.title',
    yamlKeys: ['proxy-pools', 'proxy-rules'],
    aliases: ['structured proxy', '结构化代理', '代理池'],
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
    id: 'config-routing-per-auth-request-limit',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.routing_per_auth_request_limit',
    yamlKeys: ['routing.per-auth-request-limit'],
    aliases: ['per auth request limit', '每凭证限速', '每憑證限速'],
  },
  {
    id: 'config-routing-per-auth-request-window-minutes',
    pageId: 'global-network',
    labelKey: 'config_management.visual.sections.network.routing_per_auth_request_window_minutes',
    yamlKeys: ['routing.per-auth-request-window-minutes'],
    aliases: ['request limit window', '限速窗口', '限速視窗'],
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
      'routing.priority-overrides[].per-auth-request-limit',
      'routing.priority-overrides[].per-auth-request-window-minutes',
      'routing.priority-overrides[].subscription-overrides',
      'routing.priority-overrides[].subscription-overrides[].providers',
      'routing.priority-overrides[].subscription-overrides[].plan-types',
      'routing.priority-overrides[].subscription-overrides[].per-auth-request-limit',
      'routing.priority-overrides[].subscription-overrides[].per-auth-request-window-minutes',
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
    id: 'config-error-response-rewrites',
    pageId: 'global-request',
    labelKey: 'config_management.visual.sections.network.error_response_rewrites',
    yamlKeys: [
      'error-response-rewrites',
      'error-response-rewrites[].status-code',
      'error-response-rewrites[].message-contains',
      'error-response-rewrites[].response-status-code',
      'error-response-rewrites[].response-body',
    ],
    aliases: ['error rewrite', 'response rewrite', '错误响应改写', '响应改写'],
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
    yamlKeys: ['logging-to-file', 'logs-max-total-size-mb', 'logs-retention-days'],
    aliases: ['log retention', '日志保留', '日志清理'],
  },
  {
    id: 'config-usage-statistics',
    pageId: 'global-observability',
    labelKey: 'config_management.visual.sections.system.usage_statistics',
    yamlKeys: [
      'usage-statistics-enabled',
      'usage-statistics-persistence-enabled',
      'usage-statistics-persist-interval-seconds',
      'usage-statistics-detail-retention-days',
      'usage-statistics-max-storage-megabytes',
    ],
    aliases: ['usage persistence', 'usage retention', '统计落盘', '统计保留', '历史清理'],
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
      'codex.spoof-session-identity',
      'codex.turn-state-policy',
      'codex-fingerprint',
      'codex-fingerprint.default-mode',
      'codex-fingerprint.session-identity-pool-size',
      'codex-fingerprint.ja3',
      'codex-fingerprint.force-http1',
      'codex-fingerprint.images-force-http1',
    ],
    aliases: [
      'ja3',
      'tls clienthello',
      'session identity',
      'spoof session identity',
      'turn state policy',
      'default fingerprint mode',
      'session identity pool',
      '身份混淆',
      '会话身份伪装',
      '回合状态策略',
      '默认指纹模式',
      '会话身份池',
      '指纹',
    ],
  },
  {
    id: 'config-codex-headers',
    pageId: 'provider-codex',
    labelKey: 'config_management.visual.sections.network.codex_header_defaults_user_agent',
    yamlKeys: [
      'codex-header-defaults',
      'codex.enforce-software-identity',
      'codex-header-defaults.user-agent',
      'codex-header-defaults.beta-features',
      'codex-header-defaults.originator',
    ],
    aliases: [
      'software identity',
      'codex identity enforcement',
      'minimum user agent version',
      '软件身份',
      '统一软件身份',
      '最低 user-agent 版本',
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
    id: 'config-chatgpt-web-auto-relogin',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.auto_relogin',
    yamlKeys: ['chatgpt-web.auto-relogin'],
    aliases: ['chatgpt web', '自动重登', 'auto relogin'],
  },
  {
    id: 'config-chatgpt-web-auto-relogin-capacity',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.auto_relogin_capacity_title',
    yamlKeys: [
      'chatgpt-web.auto-relogin-workers',
      'chatgpt-web.auto-relogin-queue-size',
      'chatgpt-web.manual-relogin-concurrency',
    ],
    aliases: [
      '自动重登并发',
      '自动重登队列',
      '手动重登并发',
      'relogin workers',
      'relogin queue',
      'manual relogin',
    ],
  },
  {
    id: 'config-chatgpt-web-api798-auto-login',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.api798_auto_login',
    yamlKeys: ['chatgpt-web.api798-auto-login-enabled'],
    aliases: ['api798', '邮箱接码', 'email otp'],
  },
  {
    id: 'config-chatgpt-web-auto-delete-dead',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.auto_delete_dead_auths',
    yamlKeys: ['chatgpt-web.auto-delete-dead-auths'],
    aliases: ['死亡账号', '自动删除凭证', 'dead auth'],
  },
  {
    id: 'config-chatgpt-web-invalid-passkey-response-as-dead',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.invalid_passkey_response_as_dead',
    yamlKeys: ['chatgpt-web.invalid-passkey-response-as-dead'],
    aliases: ['invalid passkey response', 'passkey 死亡', '自动删除密钥凭证'],
  },
  {
    id: 'config-chatgpt-web-session-cookie-refresh-on-token-failure',
    pageId: 'provider-chatgpt-web',
    labelKey:
      'config_management.settings_center.chatgpt_web.session_cookie_refresh_on_token_failure',
    yamlKeys: ['chatgpt-web.session-cookie-refresh-on-token-failure'],
    aliases: ['session cookie', 'access token refresh', '会话刷新', '凭证死亡'],
  },
  {
    id: 'config-chatgpt-web-force-session-refresh-on-import',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.force_session_refresh_on_import',
    yamlKeys: ['chatgpt-web.force-session-refresh-on-import'],
    aliases: ['session import', '导入刷新', 'session 刷新'],
  },
  {
    id: 'config-chatgpt-web-import',
    pageId: 'provider-chatgpt-web',
    labelKey: 'chatgpt_web.import.title',
    yamlKeys: [
      'chatgpt-web.import',
      'chatgpt-web.import.workers',
      'chatgpt-web.import.validate-models-after-upload',
      'chatgpt-web.import.refresh-account-info-after-upload',
    ],
    aliases: [
      'fast import',
      'upload workers',
      'background validation',
      '快速上传',
      '后台验活',
      '导入 worker',
    ],
  },
  {
    id: 'config-chatgpt-web-auto-delete-dead-priorities',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.auto_delete_dead_priorities',
    yamlKeys: ['chatgpt-web.auto-delete-dead-priorities'],
    aliases: ['优先级', '優先順序', 'приоритеты', 'priority'],
  },
  {
    id: 'config-chatgpt-web-image-upstream-model',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.image_upstream_model',
    yamlKeys: ['images.chatgpt-web.upstream-model', 'images.chatgpt-web.ignore-unsupported-params'],
    aliases: ['picture_v2', 'web image', '图片参数', '忽略参数'],
  },
  {
    id: 'config-chatgpt-web-remote-image-url',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.remote_image_url_title',
    yamlKeys: [
      'images.chatgpt-web.remote-image-url-enabled',
      'images.chatgpt-web.remote-image-url-download-mode',
    ],
    aliases: [
      'image_url',
      'remote image',
      'credential proxy',
      '远程图片',
      '图片下载代理',
      '遠端圖片',
      'удалённое изображение',
    ],
  },
  {
    id: 'config-chatgpt-web-adapt-size-to-aspect-ratio',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.image_size_title',
    yamlKeys: [
      'images.chatgpt-web.adapt-size-to-aspect-ratio',
      'images.chatgpt-web.strict-size',
      'images.chatgpt-web.aspect-ratio-max-error-percent',
      'images.chatgpt-web.resize-to-requested-size',
      'images.chatgpt-web.resize-filter',
      'images.chatgpt-web.max-resize-edge-pixels',
      'images.chatgpt-web.max-image-response-megabytes',
      'images.chatgpt-web.max-n',
    ],
    aliases: [
      'aspect ratio',
      'resize',
      'max n',
      'image count',
      '比例适配',
      '严格模式',
      '精确缩放',
      '最大生成数量',
      'response budget',
    ],
  },
  {
    id: 'config-chatgpt-web-image-capacity',
    pageId: 'provider-chatgpt-web',
    labelKey: 'config_management.settings_center.chatgpt_web.image_capacity_title',
    yamlKeys: [
      'images.chatgpt-web.max-in-flight',
      'images.chatgpt-web.admission-queue-size',
      'images.chatgpt-web.admission-wait-milliseconds',
      'images.chatgpt-web.max-finalizers',
      'images.chatgpt-web.completion-reserve-megabytes',
      'images.chatgpt-web.memory-capacity-megabytes',
      'images.chatgpt-web.poll-concurrency',
      'images.chatgpt-web.memory-finalizer-concurrency',
    ],
    aliases: [
      'image concurrency',
      'image capacity',
      'in flight',
      'finalizer',
      'completion reserve',
      'working set memory',
      'memory capacity',
      'poll concurrency',
      'memory finalizer concurrency',
      '图片并发',
      '图片容量',
      '收尾队列',
      '生成排队',
      '工作集内存',
      '轮询并发',
      '重收尾并发',
    ],
  },
  {
    id: 'config-chatgpt-web-account-info',
    pageId: 'provider-chatgpt-web',
    labelKey: 'chatgpt_web.account_info.title',
    yamlKeys: [
      'chatgpt-web.account-info',
      'chatgpt-web.account-info.auto-refresh-enabled',
      'chatgpt-web.account-info.diagnostics-enabled',
      'chatgpt-web.account-info.raw-quota-response-enabled',
      'chatgpt-web.account-info.periodic-refresh-minutes',
      'chatgpt-web.account-info.refresh-workers',
      'chatgpt-web.account-info.refresh-queue-size',
      'chatgpt-web.account-info.refresh-ttl-minutes',
      'chatgpt-web.account-info.recovery-jitter-seconds',
      'chatgpt-web.account-info.max-retries',
    ],
    aliases: [
      'account info',
      'image quota',
      'periodic refresh',
      '账号信息',
      '图片额度',
      '周期查询',
      '刷新池',
      '内存诊断',
      'diagnostics',
    ],
  },
  {
    id: 'config-chatgpt-web-sentinel',
    pageId: 'provider-chatgpt-web',
    labelKey: 'chatgpt_web.sentinel.title',
    yamlKeys: [
      'chatgpt-web.sentinel',
      'chatgpt-web.sentinel.sdk-runtime-enabled',
      'chatgpt-web.sentinel.sdk-workers',
      'chatgpt-web.sentinel.sdk-queue-size',
      'chatgpt-web.sentinel.sdk-cache-versions',
    ],
    aliases: ['sentinel sdk', 'solver pool', '求解池'],
  },
  {
    id: 'config-chatgpt-web-login-proxy',
    pageId: 'provider-chatgpt-web',
    labelKey: 'chatgpt_web.login_proxy.title',
    yamlKeys: [
      'chatgpt-web.login-proxy',
      'chatgpt-web.login-proxy.enabled',
      'chatgpt-web.login-proxy.url-template',
      'chatgpt-web.login-proxy.placeholder-charset',
      'chatgpt-web.login-proxy.rotate-on-retry',
      'chatgpt-web.login-proxy.request-attempts',
      'chatgpt-web.login-proxy.flow-attempts',
      'chatgpt-web.login-proxy.retry-delay-milliseconds',
      'chatgpt-web.login-proxy.acquisition-timeout-seconds',
    ],
    aliases: ['login proxy', 'dynamic proxy', '登录代理', '动态代理', 'cloudflare'],
  },
  {
    id: 'config-chatgpt-web-usage-cache',
    pageId: 'provider-chatgpt-web',
    labelKey: 'chatgpt_web.usage_cache.title',
    yamlKeys: [
      'chatgpt-web.estimate-token-usage',
      'chatgpt-web.usage-cache',
      'chatgpt-web.usage-cache.enabled',
      'chatgpt-web.usage-cache.disk-threshold-mb',
      'chatgpt-web.usage-cache.max-disk-size-mb',
      'chatgpt-web.usage-cache.resource-guard-enabled',
      'chatgpt-web.usage-cache.min-available-disk-mb',
      'chatgpt-web.usage-cache.max-filesystem-used-percent',
      'chatgpt-web.usage-cache.orphan-retention-minutes',
      'chatgpt-web.usage-cache.path',
      'chatgpt-web.image-usage.auto-output-quality',
      'chatgpt-web.image-usage.fallback-usage',
      'chatgpt-web.image-usage.fallback-usage.enabled',
      'chatgpt-web.image-usage.fallback-usage.input-text-tokens',
      'chatgpt-web.image-usage.fallback-usage.input-image-tokens',
      'chatgpt-web.image-usage.fallback-usage.output-text-tokens',
      'chatgpt-web.image-usage.fallback-usage.output-image-tokens',
    ],
    aliases: ['usage cache', 'token estimation', 'fallback usage', '计费缓存', 'token 估算'],
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
