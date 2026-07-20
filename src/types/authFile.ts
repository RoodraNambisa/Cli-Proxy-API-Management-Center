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

export interface AuthFileItem {
  name: string;
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
  lastRefresh?: string | number;
  modified?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
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
