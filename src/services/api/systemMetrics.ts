import type {
  SystemChatGptWebImageProtocolSnapshot,
  SystemImageExecutionAdmissionSnapshot,
  SystemImageMemorySnapshot,
  SystemImagePollSlotsSnapshot,
  SystemImagePollStallBreakerSnapshot,
  SystemImageRequestPhaseMetricSnapshot,
  SystemImageRequestPhaseRollingMetricSnapshot,
  SystemImageRequestPhasesSnapshot,
  SystemImageSpoolSnapshot,
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
    resident_set_bytes: toNonNegativeNumber(source.resident_set_bytes),
    resident_set_available: source.resident_set_available === true,
    total_alloc_bytes: toNonNegativeNumber(source.total_alloc_bytes),
    allocation_bytes_per_second: toNonNegativeNumber(source.allocation_bytes_per_second),
    gc_cycles: toNonNegativeNumber(source.gc_cycles),
    gc_cycles_per_second: toNonNegativeNumber(source.gc_cycles_per_second),
    gc_pause_percent: toNonNegativeNumber(source.gc_pause_percent),
    process_cpu_percent: toNonNegativeNumber(source.process_cpu_percent),
    process_cpu_normalized_percent: toNonNegativeNumber(source.process_cpu_normalized_percent),
    process_cpu_available: source.process_cpu_available === true,
    rate_sample_seconds: toNonNegativeNumber(source.rate_sample_seconds),
    rates_available: source.rates_available === true,
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
    shrinking: source.shrinking === true,
  };
};

const normalizeImagePollSlots = (value: unknown): SystemImagePollSlotsSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  const capacityDetailsAvailable =
    available &&
    [
      'queue_limit',
      'queued',
      'peak_queued',
      'immediate_rejects',
      'queue_rejects',
      'timed_out',
      'shrinking',
    ].every((key) => Object.prototype.hasOwnProperty.call(source, key));
  return {
    available,
    capacity_details_available: capacityDetailsAvailable,
    limit: toNonNegativeNumber(source.limit),
    queue_limit: toNonNegativeNumber(source.queue_limit),
    active: toNonNegativeNumber(source.active),
    queued: toNonNegativeNumber(source.queued),
    peak_active: toNonNegativeNumber(source.peak_active),
    peak_queued: toNonNegativeNumber(source.peak_queued),
    shrinking: source.shrinking === true,
    acquire_attempts: toNonNegativeNumber(source.acquire_attempts),
    acquired: toNonNegativeNumber(source.acquired),
    immediate_rejects: toNonNegativeNumber(source.immediate_rejects),
    queue_rejects: toNonNegativeNumber(source.queue_rejects),
    timed_out: toNonNegativeNumber(source.timed_out),
    canceled: toNonNegativeNumber(source.canceled),
    total_wait_nanos: toNonNegativeNumber(source.total_wait_nanos),
    max_wait_nanos: toNonNegativeNumber(source.max_wait_nanos),
  };
};

const normalizeImagePollStallBreaker = (value: unknown): SystemImagePollStallBreakerSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  const nullableString = (field: unknown): string | null => {
    const normalized = toStringValue(field);
    return normalized || null;
  };
  return {
    available,
    enabled: source.enabled === true,
    open: source.open === true,
    stall_seconds: toNonNegativeNumber(source.stall_seconds),
    opened_at: nullableString(source.opened_at),
    full_since: nullableString(source.full_since),
    last_completion_at: nullableString(source.last_completion_at),
    no_completion_age_nanos: toNonNegativeNumber(source.no_completion_age_nanos),
    rejected: toNonNegativeNumber(source.rejected),
    transport_completions: toNonNegativeNumber(source.transport_completions),
    canceled_completions: toNonNegativeNumber(source.canceled_completions),
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

const normalizeImagePhaseRollingMetric = (
  value: unknown
): SystemImageRequestPhaseRollingMetricSnapshot => {
  const source = isRecord(value) ? value : {};
  return {
    count: toNonNegativeNumber(source.count),
    total_nanos: toNonNegativeNumber(source.total_nanos),
    average_nanos: toNonNegativeNumber(source.average_nanos),
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
  const rawRolling = isRecord(source.rolling) ? source.rolling : {};
  const rawRollingMetrics = isRecord(rawRolling.metrics) ? rawRolling.metrics : {};
  const rollingMetrics: Record<string, SystemImageRequestPhaseRollingMetricSnapshot> = {};
  Object.entries(rawRollingMetrics).forEach(([name, metric]) => {
    if (!isRecord(metric)) return;
    rollingMetrics[name] = normalizeImagePhaseRollingMetric(metric);
  });
  return {
    available,
    handler_scope: toStringValue(source.handler_scope),
    chatgpt_web_scope: toStringValue(source.chatgpt_web_scope),
    response_write_count_semantics: toStringValue(source.response_write_count_semantics),
    metrics,
    rolling: {
      available: rawRolling.available === true,
      requested_window_seconds: toNonNegativeNumber(rawRolling.requested_window_seconds),
      sample_seconds: toNonNegativeNumber(rawRolling.sample_seconds),
      history_samples: toNonNegativeNumber(rawRolling.history_samples),
      metrics: rollingMetrics,
    },
  };
};

const normalizeImageSpool = (value: unknown): SystemImageSpoolSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  const currentBytes = toNonNegativeNumber(source.current_bytes);
  return {
    available,
    current_files: toNonNegativeNumber(source.current_files),
    current_bytes: currentBytes,
    peak_bytes: Math.max(currentBytes, toNonNegativeNumber(source.peak_bytes)),
    created_files: toNonNegativeNumber(source.created_files),
    cleaned_files: toNonNegativeNumber(source.cleaned_files),
    cleanup_failures: toNonNegativeNumber(source.cleanup_failures),
  };
};

const normalizeChatGptWebImageProtocol = (
  value: unknown
): SystemChatGptWebImageProtocolSnapshot => {
  const available = isRecord(value);
  const source = available ? value : {};
  return {
    available,
    task_ids_observed: toNonNegativeNumber(source.task_ids_observed),
    exact_streams_started: toNonNegativeNumber(source.exact_streams_started),
    exact_streams_completed: toNonNegativeNumber(source.exact_streams_completed),
    exact_stream_fallbacks: toNonNegativeNumber(source.exact_stream_fallbacks),
    final_messages_captured: toNonNegativeNumber(source.final_messages_captured),
    task_pages_fetched: toNonNegativeNumber(source.task_pages_fetched),
    hidden_outputs_ignored: toNonNegativeNumber(source.hidden_outputs_ignored),
    incomplete_pointers_observed: toNonNegativeNumber(source.incomplete_pointers_observed),
    all_sources_exhausted_without_output: toNonNegativeNumber(
      source.all_sources_exhausted_without_output
    ),
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
    chatgpt_web_image_memory_finalizers: normalizeImageAdmission(
      source.chatgpt_web_image_memory_finalizers
    ),
    chatgpt_web_image_poll_slots: normalizeImagePollSlots(source.chatgpt_web_image_poll_slots),
    chatgpt_web_image_poll_breaker: normalizeImagePollStallBreaker(
      source.chatgpt_web_image_poll_breaker
    ),
    chatgpt_web_image_protocol: normalizeChatGptWebImageProtocol(source.chatgpt_web_image_protocol),
    image_spool: normalizeImageSpool(source.image_spool),
    image_request_phases: normalizeImageRequestPhases(source.image_request_phases),
  };
};

export const systemMetricsApi = {
  async get(): Promise<SystemMetricsSnapshot> {
    const response = await apiClient.get('/system/metrics');
    return normalizeSystemMetricsSnapshot(response);
  },
};
