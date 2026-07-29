import type {
  SystemFilesystemSnapshot,
  SystemFilesystemStatus,
  SystemMetricsSnapshot,
  SystemRuntimeSnapshot,
} from '@/types';
import { apiClient } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toNonNegativeNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeFilesystemStatus = (value: unknown): SystemFilesystemStatus => {
  const status = toStringValue(value).trim().toLowerCase();
  if (status === 'ok' || status === 'unavailable' || status === 'unsupported') return status;
  return 'unsupported';
};

export const normalizeSystemFilesystem = (value: unknown): SystemFilesystemSnapshot => {
  const source = isRecord(value) ? value : {};
  return {
    status: normalizeFilesystemStatus(source.status),
    path: toStringValue(source.path),
    total_bytes: toNonNegativeNumber(source.total_bytes),
    used_bytes: toNonNegativeNumber(source.used_bytes),
    free_bytes: toNonNegativeNumber(source.free_bytes),
    available_bytes: toNonNegativeNumber(source.available_bytes),
    used_percent: Math.min(100, toNonNegativeNumber(source.used_percent)),
  };
};

const normalizeRuntime = (value: unknown): SystemRuntimeSnapshot => {
  const source = isRecord(value) ? value : {};
  return {
    go_version: toStringValue(source.go_version),
    goos: toStringValue(source.goos),
    goarch: toStringValue(source.goarch),
    logical_cpus: toNonNegativeNumber(source.logical_cpus),
    gomaxprocs: toNonNegativeNumber(source.gomaxprocs),
    goroutines: toNonNegativeNumber(source.goroutines),
    heap_alloc_bytes: toNonNegativeNumber(source.heap_alloc_bytes),
    heap_inuse_bytes: toNonNegativeNumber(source.heap_inuse_bytes),
    stack_inuse_bytes: toNonNegativeNumber(source.stack_inuse_bytes),
    runtime_sys_bytes: toNonNegativeNumber(source.runtime_sys_bytes),
    total_alloc_bytes: toNonNegativeNumber(source.total_alloc_bytes),
    gc_cycles: toNonNegativeNumber(source.gc_cycles),
    last_gc_at: typeof source.last_gc_at === 'string' ? source.last_gc_at : null,
  };
};

export const normalizeSystemMetricsSnapshot = (value: unknown): SystemMetricsSnapshot => {
  const source = isRecord(value) ? value : {};
  const filesystems = isRecord(source.filesystems) ? source.filesystems : {};
  return {
    collected_at: toStringValue(source.collected_at),
    runtime: normalizeRuntime(source.runtime),
    filesystems: {
      working_directory: normalizeSystemFilesystem(filesystems.working_directory),
      auth_directory: normalizeSystemFilesystem(filesystems.auth_directory),
      usage_cache: normalizeSystemFilesystem(filesystems.usage_cache),
    },
  };
};

export const systemMetricsApi = {
  async get(): Promise<SystemMetricsSnapshot> {
    const response = await apiClient.get('/system/metrics');
    return normalizeSystemMetricsSnapshot(response);
  },
};
