export interface StartupStageSnapshot {
  name: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_milliseconds: number;
  processed: number;
  skipped: number;
  error_code: string;
}

export interface StartupIssueSnapshot {
  stage: string;
  code: string;
  severity: string;
}

export type StartupServiceStatus = 'initializing' | 'ready' | 'degraded' | 'failed';

export interface StartupStatusSnapshot {
  phase: string;
  status: StartupServiceStatus;
  ready: boolean;
  degraded: boolean;
  started_at: string | null;
  updated_at: string | null;
  issues: StartupIssueSnapshot[];
  stages: StartupStageSnapshot[];
}

export interface UsageStorageFileSnapshot {
  exists: boolean;
  size_bytes: number;
  modified_at: string | null;
}

export interface UsageStorageSnapshot {
  available: boolean;
  total_bytes: number;
  main: UsageStorageFileSnapshot;
  pending: UsageStorageFileSnapshot;
  legacy: UsageStorageFileSnapshot;
}

export interface UsageRestoreSnapshot {
  enabled: boolean;
  status: string;
  active: boolean;
  applied: boolean;
  needs_sidecar: boolean;
  started_at: string | null;
  completed_at: string | null;
  added: number;
  skipped: number;
  error_code: string;
}

export interface UsageHistorySnapshot {
  collection_enabled: boolean;
  persistence_enabled: boolean;
  persist_interval_seconds: number;
  detail_retention_days: number;
  max_storage_megabytes: number;
  detail_count: number;
  total_requests: number;
  success_count: number;
  failure_count: number;
  oldest_at: string | null;
  newest_at: string | null;
  storage: UsageStorageSnapshot;
  restore: UsageRestoreSnapshot;
  prune_tasks: UsagePruneTaskHistory;
}

export interface LogDirectorySnapshot {
  available: boolean;
  file_count: number;
  total_bytes: number;
  oldest_at: string | null;
  newest_at: string | null;
}

export interface LogHistorySnapshot {
  file_logging_enabled: boolean;
  retention_days: number;
  max_total_size_mb: number;
  storage: LogDirectorySnapshot;
}

export interface StorageHistorySnapshot {
  usage: UsageHistorySnapshot;
  logs: LogHistorySnapshot;
}

export interface HistoryPruneRequest {
  older_than_days: number;
  max_storage_megabytes: number;
}

export type UsagePruneTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface UsagePruneTask {
  task_id: string;
  status: UsagePruneTaskStatus;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  policy: HistoryPruneRequest;
  safe_error_code: string;
  processed: number;
  pruned: number;
  saved: boolean;
  storage_bytes_before: number;
  storage_bytes_after: number;
  detail_count_before: number;
  detail_count_after: number;
  total_requests_before: number;
  total_requests_after: number;
}

export interface UsagePruneTaskHistory {
  active: UsagePruneTask | null;
  recent: UsagePruneTask[];
}

export interface LogPruneResult {
  removed_files: number;
  removed_bytes: number;
  failed_files: number;
  before: LogDirectorySnapshot;
  after: LogDirectorySnapshot;
}
