import type {
  HistoryPruneRequest,
  LogDirectorySnapshot,
  LogPruneResult,
  StartupIssueSnapshot,
  StartupStageSnapshot,
  StartupStatusSnapshot,
  StorageHistorySnapshot,
  UsagePruneTask,
  UsagePruneTaskHistory,
  UsagePruneTaskStatus,
  UsageStorageFileSnapshot,
} from '@/types';
import { apiClient } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const numberValue = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '');
const nullableDate = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const startupStatus = (value: unknown, phase: string, ready: boolean, degraded: boolean) => {
  if (value === 'initializing' || value === 'ready' || value === 'degraded' || value === 'failed') {
    return value;
  }
  if (phase === 'failed') return 'failed';
  if (degraded) return 'degraded';
  return ready ? 'ready' : 'initializing';
};

const normalizeIssue = (value: unknown): StartupIssueSnapshot => {
  const source = record(value);
  return {
    stage: stringValue(source.stage),
    code: stringValue(source.code),
    severity: stringValue(source.severity),
  };
};

const normalizeStage = (value: unknown): StartupStageSnapshot => {
  const source = record(value);
  return {
    name: stringValue(source.name),
    status: stringValue(source.status),
    started_at: nullableDate(source.started_at),
    completed_at: nullableDate(source.completed_at),
    duration_milliseconds: numberValue(source.duration_milliseconds),
    processed: numberValue(source.processed),
    skipped: numberValue(source.skipped),
    error_code: stringValue(source.error_code),
  };
};

export const normalizeStartupStatus = (value: unknown): StartupStatusSnapshot => {
  const source = record(value);
  const phase = stringValue(source.phase);
  const ready = source.ready === true;
  const degraded = source.degraded === true;
  return {
    phase,
    status: startupStatus(source.status, phase, ready, degraded),
    ready,
    degraded,
    started_at: nullableDate(source.started_at),
    updated_at: nullableDate(source.updated_at),
    issues: Array.isArray(source.issues) ? source.issues.map(normalizeIssue) : [],
    stages: Array.isArray(source.stages) ? source.stages.map(normalizeStage) : [],
  };
};

const normalizeUsageFile = (value: unknown): UsageStorageFileSnapshot => {
  const source = record(value);
  return {
    exists: source.exists === true,
    size_bytes: numberValue(source.size_bytes),
    modified_at: nullableDate(source.modified_at),
  };
};

const normalizeLogDirectory = (value: unknown): LogDirectorySnapshot => {
  const source = record(value);
  return {
    available: source.available === true,
    file_count: numberValue(source.file_count),
    total_bytes: numberValue(source.total_bytes),
    oldest_at: nullableDate(source.oldest_at),
    newest_at: nullableDate(source.newest_at),
  };
};

const usagePruneTaskStatus = (value: unknown): UsagePruneTaskStatus => {
  if (value === 'queued' || value === 'running' || value === 'failed') return value;
  return 'completed';
};

export const normalizeUsagePruneTask = (value: unknown): UsagePruneTask => {
  const source = record(value);
  const policy = record(source.policy);
  const legacySize = numberValue(source.size_bytes);
  return {
    task_id: stringValue(source.task_id),
    status: source.task_id ? usagePruneTaskStatus(source.status) : 'completed',
    created_at: nullableDate(source.created_at),
    started_at: nullableDate(source.started_at),
    completed_at: nullableDate(source.completed_at),
    policy: {
      older_than_days: numberValue(policy.older_than_days),
      max_storage_megabytes: numberValue(policy.max_storage_megabytes),
    },
    safe_error_code: stringValue(source.safe_error_code),
    processed: numberValue(source.processed),
    pruned: numberValue(source.pruned),
    saved: source.saved === true,
    storage_bytes_before: numberValue(source.storage_bytes_before),
    storage_bytes_after:
      source.storage_bytes_after === undefined
        ? legacySize
        : numberValue(source.storage_bytes_after),
    detail_count_before: numberValue(source.detail_count_before),
    detail_count_after: numberValue(source.detail_count_after),
    total_requests_before: numberValue(source.total_requests_before),
    total_requests_after: numberValue(source.total_requests_after),
  };
};

const normalizeUsagePruneTaskHistory = (value: unknown): UsagePruneTaskHistory => {
  const source = record(value);
  const active = isRecord(source.active) ? normalizeUsagePruneTask(source.active) : null;
  const recent = Array.isArray(source.recent)
    ? source.recent.map(normalizeUsagePruneTask).filter((task) => task.task_id)
    : [];
  return {
    active: active?.task_id ? active : null,
    recent,
  };
};

export const normalizeStorageHistory = (value: unknown): StorageHistorySnapshot => {
  const source = record(value);
  const usage = record(source.usage);
  const meta = record(usage.meta);
  const usageStorage = record(usage.storage);
  const restore = record(usage.restore);
  const pruneTasks = usage.prune_tasks;
  const logs = record(source.logs);
  return {
    usage: {
      collection_enabled: usage.collection_enabled === true,
      persistence_enabled: usage.persistence_enabled === true,
      persist_interval_seconds: numberValue(usage.persist_interval_seconds),
      detail_retention_days: numberValue(usage.detail_retention_days),
      max_storage_megabytes: numberValue(usage.max_storage_megabytes),
      detail_count: numberValue(usage.detail_count),
      total_requests: numberValue(meta.total_requests),
      success_count: numberValue(meta.success_count),
      failure_count: numberValue(meta.failure_count),
      oldest_at: nullableDate(meta.oldest_at),
      newest_at: nullableDate(meta.newest_at),
      storage: {
        available: usageStorage.available === true,
        total_bytes: numberValue(usageStorage.total_bytes),
        main: normalizeUsageFile(usageStorage.main),
        pending: normalizeUsageFile(usageStorage.pending),
        legacy: normalizeUsageFile(usageStorage.legacy),
      },
      restore: {
        enabled: restore.enabled === true,
        status: stringValue(restore.status),
        active: restore.active === true,
        applied: restore.applied === true,
        needs_sidecar: restore.needs_sidecar === true,
        started_at: nullableDate(restore.started_at),
        completed_at: nullableDate(restore.completed_at),
        added: numberValue(restore.added),
        skipped: numberValue(restore.skipped),
        error_code: stringValue(restore.error_code),
      },
      prune_tasks: normalizeUsagePruneTaskHistory(pruneTasks),
    },
    logs: {
      file_logging_enabled: logs.file_logging_enabled === true,
      retention_days: numberValue(logs.retention_days),
      max_total_size_mb: numberValue(logs.max_total_size_mb),
      storage: normalizeLogDirectory(logs.storage),
    },
  };
};

const normalizeLogPrune = (value: unknown): LogPruneResult => {
  const source = record(value);
  return {
    removed_files: numberValue(source.removed_files),
    removed_bytes: numberValue(source.removed_bytes),
    failed_files: numberValue(source.failed_files),
    before: normalizeLogDirectory(source.before),
    after: normalizeLogDirectory(source.after),
  };
};

export const historyStorageApi = {
  async getStartupStatus(): Promise<StartupStatusSnapshot> {
    return normalizeStartupStatus(await apiClient.get('/startup/status'));
  },
  async getStorageHistory(): Promise<StorageHistorySnapshot> {
    return normalizeStorageHistory(await apiClient.get('/storage/history'));
  },
  async pruneUsage(request: HistoryPruneRequest): Promise<UsagePruneTask> {
    return normalizeUsagePruneTask(await apiClient.post('/usage/prune', request));
  },
  async getUsagePruneTask(taskId: string): Promise<UsagePruneTask> {
    return normalizeUsagePruneTask(
      await apiClient.get(`/usage/prune/${encodeURIComponent(taskId)}`)
    );
  },
  async pruneLogs(request: HistoryPruneRequest): Promise<LogPruneResult> {
    return normalizeLogPrune(await apiClient.post('/logs/prune', request));
  },
};
