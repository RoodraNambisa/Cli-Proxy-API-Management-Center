import type { AuthFileItem } from './authFile';
import type { SystemFilesystemSnapshot } from './systemMetrics';

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

export interface ChatGptWebAccountInfoConfig {
  'refresh-workers': number;
  'refresh-queue-size': number;
  'refresh-ttl-minutes': number;
  'recovery-jitter-seconds': number;
  'max-retries': number;
}

export interface ChatGptWebAccountInfoRuntime {
  busy: number;
  queued: number;
  scheduled: number;
  inflight: number;
  refresh_count: number;
  retry_count: number;
  failed_count: number;
  last_error: string;
}

export interface ChatGptWebAccountInfoSnapshot {
  config: ChatGptWebAccountInfoConfig;
  runtime: ChatGptWebAccountInfoRuntime;
}

export type ChatGptWebAccountInfoConfigPatch = Partial<ChatGptWebAccountInfoConfig>;

export type ChatGptWebAccountInfoRefreshTaskState =
  | 'queued'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'canceled';

export type ChatGptWebAccountInfoRefreshResultStatus =
  | 'updated'
  | 'unchanged'
  | 'fresh'
  | 'partial'
  | 'failed'
  | 'canceled';

export interface ChatGptWebAccountInfoRefreshResult {
  name: string;
  auth_index?: string;
  status: ChatGptWebAccountInfoRefreshResultStatus | string;
  attempts?: number;
  account_type?: string;
  plan_type?: string;
  image_quota_remaining?: number | null;
  image_quota_reset_at?: string;
  quota_state?: string;
  http_status?: number;
  error?: string;
}

export interface ChatGptWebAccountInfoRefreshTask {
  id: string;
  state: ChatGptWebAccountInfoRefreshTaskState | string;
  force?: boolean;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  total?: number;
  processed?: number;
  succeeded?: number;
  updated?: number;
  unchanged?: number;
  fresh?: number;
  partial?: number;
  failed?: number;
  canceled?: number;
  results?: ChatGptWebAccountInfoRefreshResult[];
}

export const isChatGptWebAccountInfoRefreshTaskTerminal = (state: string): boolean =>
  state === 'completed' ||
  state === 'completed_with_errors' ||
  state === 'failed' ||
  state === 'canceled';

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

export type ChatGptWebImageUsageQuality = 'low' | 'medium' | 'high';

export interface ChatGptWebUsageCacheSettings {
  enabled: boolean;
  'disk-threshold-mb': number;
  'max-disk-size-mb': number;
  'resource-guard-enabled'?: boolean;
  'min-available-disk-mb'?: number;
  'max-filesystem-used-percent'?: number;
  'orphan-retention-minutes'?: number;
  path: string;
}

export interface ChatGptWebUsageConfig {
  'estimate-token-usage': boolean;
  'usage-cache': ChatGptWebUsageCacheSettings;
  'image-usage': {
    'auto-output-quality': ChatGptWebImageUsageQuality;
  };
}

export interface ChatGptWebUsageCacheStats {
  active_memory_entries: number;
  active_memory_bytes: number;
  active_disk_entries: number;
  active_disk_bytes: number;
  peak_disk_bytes: number;
  successful_calculations: number;
  failed_discards: number;
  capacity_rejections: number;
  resource_rejections?: number;
  write_errors: number;
  instance_directory?: string;
  ownership_status?: string;
  orphan_directory_count?: number;
  orphan_file_count?: number;
  orphan_bytes?: number;
  legacy_directory_count?: number;
  legacy_file_count?: number;
  legacy_bytes?: number;
  cleanup_count?: number;
  cleanup_errors?: number;
  last_cleanup_at?: string | null;
  retained_orphan_bytes?: number;
}

export interface ChatGptWebUsageSnapshot extends ChatGptWebUsageConfig {
  stats: ChatGptWebUsageCacheStats;
  filesystem?: SystemFilesystemSnapshot;
}

export const isChatGptWebLoginTaskTerminal = (state: ChatGptWebLoginTaskState): boolean =>
  state === 'completed' || state === 'completed_with_errors' || state === 'canceled';

export const isChatGptWebMutationTaskTerminal = (state: ChatGptWebLoginTaskState): boolean =>
  isChatGptWebLoginTaskTerminal(state);
