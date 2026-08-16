/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'xai'
  | 'chatgpt-web'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export type AuthCooldownScope = 'auth' | 'model';
export type CodexAuthMode = 'oauth' | 'agentIdentity';
export type CodexFingerprintMode = 'off' | 'device' | 'session' | 'full';
export type ChatGptWebQuotaState = 'unknown' | 'available' | 'exhausted';
export type ChatGptWebAccountInfoRecoveryState =
  | 'idle'
  | 'auto_retrying'
  | 'manual_checking'
  | 'manual_recovery_required'
  | 'relogin_pending'
  | 'reauth_required'
  | 'interaction_required';

export interface AuthFileModelItem {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
  cooldown_active?: boolean;
  cooldownActive?: boolean;
  scope?: AuthCooldownScope | string;
  until?: string;
  quota_state?: ChatGptWebQuotaState | string;
  quota_stale?: boolean;
  image_quota_remaining?: number | null;
  image_quota_reset_at?: string;
  quota_next_refresh_at?: string;
  image_quota_model?: boolean;
}

export interface AuthFileProxyBinding {
  pool?: string;
  entry?: string;
  port?: number;
  binding_id?: string;
  bound_at?: string;
  healthy?: boolean | null;
  last_check_at?: string;
  ip?: string;
  loc?: string;
  elapsed_ms?: number;
  error?: string;
  error_message?: string;
}

export interface AuthErrorDiagnostic {
  provider?: string;
  auth_index?: string;
  stage?: string;
  code?: string;
  response_type?: string;
  content_type?: string;
  cf_ray?: string;
  target_host?: string;
  target_path?: string;
  persona?: string;
  ua_major?: string;
  platform?: string;
  response_bytes?: number;
  response_body?: string;
  response_body_truncated?: boolean;
  attempts?: number;
  http_status?: number;
  cloudflare?: boolean;
  retryable?: boolean;
}

export interface AuthErrorSummary {
  code?: string;
  message?: string;
  retryable?: boolean;
  http_status?: number;
  diagnostic?: AuthErrorDiagnostic;
}

export interface AuthFileItem {
  name: string;
  email?: string;
  type?: AuthFileType | string;
  provider?: string;
  planType?: string | null;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastErrorStatusCode?: number;
  cooldown_active?: boolean;
  cooldown_scope?: AuthCooldownScope | string;
  cooldown_until?: string;
  cooldown_model_count?: number;
  cooldownActive?: boolean;
  cooldownScope?: AuthCooldownScope | string;
  cooldownUntil?: string;
  cooldownModelCount?: number;
  lifecycle_state?: string;
  lifecycle_reason?: string;
  lifecycle_updated_at?: string;
  token_expires_at?: string;
  token_expired?: boolean;
  token_refreshable?: boolean;
  last_login_at?: string;
  last_refresh_at?: string;
  last_relogin_at?: string;
  account_type?: string;
  plan_type?: string;
  image_quota_remaining?: number | null;
  image_quota_reset_at?: string;
  quota_state?: ChatGptWebQuotaState | string;
  quota_updated_at?: string;
  quota_stale?: boolean;
  quota_refreshing?: boolean;
  quota_next_refresh_at?: string;
  quota_last_error?: string;
  account_info_refreshable?: boolean;
  account_info_manual_recheckable?: boolean;
  account_info_recovery_state?: ChatGptWebAccountInfoRecoveryState | string;
  account_info_recovery_attempts?: number;
  account_info_recovery_max_attempts?: number;
  account_info_consecutive_failures?: number;
  account_info_recovery_stop_reason?: string;
  account_info_last_failure?: string;
  account_info_last_failure_at?: string;
  account_info_last_success_at?: string;
  credential_mode?: string;
  refresh_strategy?: string;
  token_only?: boolean;
  source_auth_id?: string;
  source_missing?: boolean;
  deletion_state?: string;
  retained_for_dependents?: boolean;
  dependent_count?: number;
  dependent_names?: string[];
  deletion_requested_at?: string;
  proxy_binding?: AuthFileProxyBinding;
  last_error?: AuthErrorSummary;
  last_diagnostic?: AuthErrorDiagnostic;
  auth_mode?: CodexAuthMode | string;
  auth_mode_label?: string;
  can_convert_to_agent_identity?: boolean;
  can_convert_to_oauth?: boolean;
  authMode?: CodexAuthMode | string;
  authModeLabel?: string;
  canConvertToAgentIdentity?: boolean;
  canConvertToOauth?: boolean;
  codex_fingerprint_mode?: CodexFingerprintMode | string;
  codexFingerprintMode?: CodexFingerprintMode | string;
  lastRefresh?: string | number;
  modified?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
  pagination?: AuthFilesPagination;
  facets?: AuthFilesFacets;
}

export interface AuthFilesPagination {
  enabled: boolean;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

export interface AuthFilesFacetValue {
  value: string;
  count: number;
}

export interface AuthFilesFacets {
  providers: AuthFilesFacetValue[];
  priorities: AuthFilesFacetValue[];
  plans: AuthFilesFacetValue[];
}

export type CodexPlanTypeRefreshState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export type CodexPlanTypeRefreshMode = 'all' | 'failed';

export type CodexPlanTypeRefreshResultStatus = 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface CodexPlanTypeRefreshSummary {
  eligible: number;
  processed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export interface CodexPlanTypeRefreshResult {
  name: string;
  authId?: string;
  status: CodexPlanTypeRefreshResultStatus | string;
  planTypeBefore?: string;
  planTypeAfter?: string;
  httpStatus?: number;
  error?: string;
}

export interface CodexPlanTypeRefreshTask {
  state: CodexPlanTypeRefreshState | string;
  running: boolean;
  paused?: boolean;
  pauseRequested?: boolean;
  mode?: CodexPlanTypeRefreshMode | string;
  canRetryFailed: boolean;
  startedAt?: string;
  finishedAt?: string;
  currentName?: string;
  summary: CodexPlanTypeRefreshSummary;
  results: CodexPlanTypeRefreshResult[];
}
