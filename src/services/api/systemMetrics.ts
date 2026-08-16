import type {
  SystemImageExecutionAdmissionSnapshot,
  SystemImageMemorySnapshot,
  SystemImagePollSlotsSnapshot,
  SystemImageRequestPhaseMetricSnapshot,
  SystemImageRequestPhasesSnapshot,
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

const normalizeImageMemory = (value: unknown): SystemImageMemorySnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  return {
    available,
    capacity_bytes: toNonNegativeNumber(source.capacity_bytes),
    queue_limit: toNonNegativeNumber(source.queue_limit),
    waiting_tasks: toNonNegativeNumber(source.waiting_tasks),
    waiting_bytes: toNonNegativeNumber(source.waiting_bytes),
    processing_tasks: toNonNegativeNumber(source.processing_tasks),
    processing_bytes: toNonNegativeNumber(source.processing_bytes),
    peak_processing_bytes: toNonNegativeNumber(source.peak_processing_bytes),
    acquisitions: toNonNegativeNumber(source.acquisitions),
    canceled_waits: toNonNegativeNumber(source.canceled_waits),
    queue_rejected: toNonNegativeNumber(source.queue_rejected),
    immediate_rejected: toNonNegativeNumber(source.immediate_rejected),
    completion_reservations: toNonNegativeNumber(source.completion_reservations),
    revoked_completion_reservations: toNonNegativeNumber(source.revoked_completion_reservations),
    bypassed_completion_reservations: toNonNegativeNumber(source.bypassed_completion_reservations),
    finalization_active: toNonNegativeNumber(source.finalization_active),
    finalization_waiting: toNonNegativeNumber(source.finalization_waiting),
  };
};

const normalizeImageAdmission = (value: unknown): SystemImageExecutionAdmissionSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  return {
    available,
    limit: toNonNegativeNumber(source.limit),
    queue_limit: toNonNegativeNumber(source.queue_limit),
    active: toNonNegativeNumber(source.active),
    queued: toNonNegativeNumber(source.queued),
    peak_active: toNonNegativeNumber(source.peak_active),
    peak_queued: toNonNegativeNumber(source.peak_queued),
    admitted: toNonNegativeNumber(source.admitted),
    immediate_rejects: toNonNegativeNumber(source.immediate_rejects),
    queue_rejects: toNonNegativeNumber(source.queue_rejects),
    timed_out: toNonNegativeNumber(source.timed_out),
    canceled: toNonNegativeNumber(source.canceled),
    total_wait_nanos: toNonNegativeNumber(source.total_wait_nanos),
    max_wait_nanos: toNonNegativeNumber(source.max_wait_nanos),
    oldest_active_age_nanos: toNonNegativeNumber(source.oldest_active_age_nanos),
    active_over_5_minutes: toNonNegativeNumber(source.active_over_5_minutes),
    active_over_15_minutes: toNonNegativeNumber(source.active_over_15_minutes),
    active_over_25_minutes: toNonNegativeNumber(source.active_over_25_minutes),
  };
};

const normalizeImagePollSlots = (value: unknown): SystemImagePollSlotsSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  return {
    available,
    limit: toNonNegativeNumber(source.limit),
    active: toNonNegativeNumber(source.active),
    peak_active: toNonNegativeNumber(source.peak_active),
    acquire_attempts: toNonNegativeNumber(source.acquire_attempts),
    acquired: toNonNegativeNumber(source.acquired),
    canceled: toNonNegativeNumber(source.canceled),
    total_wait_nanos: toNonNegativeNumber(source.total_wait_nanos),
    max_wait_nanos: toNonNegativeNumber(source.max_wait_nanos),
  };
};

const normalizeImagePhaseMetric = (value: unknown): SystemImageRequestPhaseMetricSnapshot => {
  const source = isRecord(value) ? value : {};
  return {
    count: toNonNegativeNumber(source.count),
    total_nanos: toNonNegativeNumber(source.total_nanos),
    max_nanos: toNonNegativeNumber(source.max_nanos),
    up_to_1_millisecond: toNonNegativeNumber(source.up_to_1_millisecond),
    over_1_to_10_milliseconds: toNonNegativeNumber(source.over_1_to_10_milliseconds),
    over_10_to_100_milliseconds: toNonNegativeNumber(source.over_10_to_100_milliseconds),
    over_100_milliseconds_to_1_second: toNonNegativeNumber(
      source.over_100_milliseconds_to_1_second
    ),
    over_1_to_10_seconds: toNonNegativeNumber(source.over_1_to_10_seconds),
    over_10_seconds: toNonNegativeNumber(source.over_10_seconds),
  };
};

const normalizeImageRequestPhases = (value: unknown): SystemImageRequestPhasesSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  const rawMetrics = isRecord(source.metrics) ? source.metrics : {};
  const metrics: Record<string, SystemImageRequestPhaseMetricSnapshot> = {};
  Object.entries(rawMetrics).forEach(([name, metric]) => {
    if (!isRecord(metric)) return;
    metrics[name] = normalizeImagePhaseMetric(metric);
  });
  return {
    available,
    handler_scope: toStringValue(source.handler_scope),
    chatgpt_web_scope: toStringValue(source.chatgpt_web_scope),
    response_write_count_semantics: toStringValue(source.response_write_count_semantics),
    metrics,
  };
};

export const normalizeSystemMetricsSnapshot = (value: unknown): SystemMetricsSnapshot => {
  const source = isRecord(value) ? value : {};
  const filesystems = isRecord(source.filesystems) ? source.filesystems : {};
  const imageMemorySource = isRecord(source.image_request_memory)
    ? source.image_request_memory
    : source.image_post_processing;
  return {
    collected_at: toStringValue(source.collected_at),
    runtime: normalizeRuntime(source.runtime),
    filesystems: {
      working_directory: normalizeSystemFilesystem(filesystems.working_directory),
      auth_directory: normalizeSystemFilesystem(filesystems.auth_directory),
      usage_cache: normalizeSystemFilesystem(filesystems.usage_cache),
    },
    image_request_memory: normalizeImageMemory(imageMemorySource),
    chatgpt_web_image_in_flight: normalizeImageAdmission(source.chatgpt_web_image_in_flight),
    chatgpt_web_image_finalizers: normalizeImageAdmission(source.chatgpt_web_image_finalizers),
    chatgpt_web_image_poll_slots: normalizeImagePollSlots(source.chatgpt_web_image_poll_slots),
    image_request_phases: normalizeImageRequestPhases(source.image_request_phases),
  };
};

export const systemMetricsApi = {
  async get(): Promise<SystemMetricsSnapshot> {
    const response = await apiClient.get('/system/metrics');
    return normalizeSystemMetricsSnapshot(response);
  },
};
