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
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

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
