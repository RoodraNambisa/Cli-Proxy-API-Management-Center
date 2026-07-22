import type { AuthFileItem } from './authFile';

export type ChatGptWebLoginTaskState =
  | 'queued'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'completed_with_errors'
  | 'canceled';

export type ChatGptWebLoginResultStatus =
  | 'queued'
  | 'running'
  | 'committing'
  | 'success'
  | 'failed'
  | 'canceled';

export interface ChatGptWebLoginResult {
  line: number;
  email: string;
  status: ChatGptWebLoginResultStatus;
  name?: string;
  auth_index?: string;
  lifecycle_state?: string;
  error_category?: string;
  error?: string;
  http_status?: number;
}

export interface ChatGptWebLoginTask {
  id: string;
  state: ChatGptWebLoginTaskState;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  results: ChatGptWebLoginResult[];
}

export type ChatGptWebMutationTaskKind = 'import' | 'conversion';

export type ChatGptWebMutationResultStatus =
  | 'queued'
  | 'running'
  | 'committing'
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'failed'
  | 'canceled';

export interface ChatGptWebMutationResult {
  file?: string;
  source_name?: string;
  email?: string;
  status: ChatGptWebMutationResultStatus | string;
  name?: string;
  target_name?: string;
  auth_index?: string;
  credential_mode?: string;
  error_category?: string;
  error?: string;
  http_status?: number;
}

export interface ChatGptWebMutationTask {
  id: string;
  kind: ChatGptWebMutationTaskKind | string;
  state: ChatGptWebLoginTaskState;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  results: ChatGptWebMutationResult[];
}

export interface ChatGptWebReloginResponse {
  status: 'ok' | 'failed' | 'conflict' | string;
  auth?: AuthFileItem;
  warning?: string;
  error_category?: string;
  error?: string;
}

export interface ChatGptWebSentinelConfig {
  'sdk-runtime-enabled': boolean;
  'sdk-workers': number;
  'sdk-queue-size': number;
  'sdk-cache-versions': number;
}

export type ChatGptWebSentinelConfigPatch = Partial<ChatGptWebSentinelConfig>;

export interface ChatGptWebSentinelSnapshot extends ChatGptWebSentinelConfig {
  initialized: boolean;
  available: boolean;
  worker_limit: number;
  busy: number;
  queued: number;
  source_pending: number;
  source_waiters: number;
  bytecode_waiters: number;
  observer_sessions: number;
  sdk_version: string;
  sdk_sha256: string;
  source_cache_entries: number;
  bytecode_cache_entries: number;
  fallback_count: number;
  last_error: string;
}

export const isChatGptWebLoginTaskTerminal = (state: ChatGptWebLoginTaskState): boolean =>
  state === 'completed' || state === 'completed_with_errors' || state === 'canceled';

export const isChatGptWebMutationTaskTerminal = (state: ChatGptWebLoginTaskState): boolean =>
  isChatGptWebLoginTaskTerminal(state);
