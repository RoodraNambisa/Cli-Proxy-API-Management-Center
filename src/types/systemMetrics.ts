export type SystemFilesystemStatus = 'ok' | 'unavailable' | 'unsupported';

export interface SystemFilesystemSnapshot {
  status: SystemFilesystemStatus;
  path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  available_bytes: number;
  used_percent: number;
}

export interface SystemRuntimeSnapshot {
  go_version: string;
  goos: string;
  goarch: string;
  logical_cpus: number;
  gomaxprocs: number;
  goroutines: number;
  heap_alloc_bytes: number;
  heap_inuse_bytes: number;
  stack_inuse_bytes: number;
  runtime_sys_bytes: number;
  total_alloc_bytes: number;
  gc_cycles: number;
  last_gc_at: string | null;
}

export interface SystemImageMemorySnapshot {
  available: boolean;
  capacity_bytes: number;
  queue_limit: number;
  waiting_tasks: number;
  waiting_bytes: number;
  processing_tasks: number;
  processing_bytes: number;
  peak_processing_bytes: number;
  acquisitions: number;
  canceled_waits: number;
  queue_rejected: number;
  immediate_rejected: number;
  completion_reservations: number;
  revoked_completion_reservations: number;
  bypassed_completion_reservations: number;
  finalization_active: number;
  finalization_waiting: number;
}

export interface SystemImageExecutionAdmissionSnapshot {
  available: boolean;
  limit: number;
  queue_limit: number;
  active: number;
  queued: number;
  peak_active: number;
  peak_queued: number;
  admitted: number;
  immediate_rejects: number;
  queue_rejects: number;
  timed_out: number;
  canceled: number;
  total_wait_nanos: number;
  max_wait_nanos: number;
  oldest_active_age_nanos: number;
  active_over_5_minutes: number;
  active_over_15_minutes: number;
  active_over_25_minutes: number;
  shrinking: boolean;
}

export interface SystemImagePollSlotsSnapshot {
  available: boolean;
  capacity_details_available: boolean;
  limit: number;
  queue_limit: number;
  active: number;
  queued: number;
  peak_active: number;
  peak_queued: number;
  shrinking: boolean;
  acquire_attempts: number;
  acquired: number;
  immediate_rejects: number;
  queue_rejects: number;
  timed_out: number;
  canceled: number;
  total_wait_nanos: number;
  max_wait_nanos: number;
}

export interface SystemImageRequestPhaseMetricSnapshot {
  count: number;
  total_nanos: number;
  max_nanos: number;
  up_to_1_millisecond: number;
  over_1_to_10_milliseconds: number;
  over_10_to_100_milliseconds: number;
  over_100_milliseconds_to_1_second: number;
  over_1_to_10_seconds: number;
  over_10_seconds: number;
}

export interface SystemImageRequestPhasesSnapshot {
  available: boolean;
  handler_scope: string;
  chatgpt_web_scope: string;
  response_write_count_semantics: string;
  metrics: Record<string, SystemImageRequestPhaseMetricSnapshot>;
}

export interface SystemImageSpoolSnapshot {
  available: boolean;
  current_files: number;
  current_bytes: number;
  peak_bytes: number;
  created_files: number;
  cleaned_files: number;
  cleanup_failures: number;
}

export interface SystemChatGptWebImageProtocolSnapshot {
  available: boolean;
  task_ids_observed: number;
  exact_streams_started: number;
  exact_streams_completed: number;
  exact_stream_fallbacks: number;
  final_messages_captured: number;
  task_pages_fetched: number;
  hidden_outputs_ignored: number;
  incomplete_pointers_observed: number;
  all_sources_exhausted_without_output: number;
}

export interface SystemMetricsSnapshot {
  collected_at: string;
  runtime: SystemRuntimeSnapshot;
  filesystems: {
    working_directory: SystemFilesystemSnapshot;
    auth_directory: SystemFilesystemSnapshot;
    usage_cache: SystemFilesystemSnapshot;
  };
  image_request_memory: SystemImageMemorySnapshot;
  chatgpt_web_image_in_flight: SystemImageExecutionAdmissionSnapshot;
  chatgpt_web_image_finalizers: SystemImageExecutionAdmissionSnapshot;
  chatgpt_web_image_memory_finalizers: SystemImageExecutionAdmissionSnapshot;
  chatgpt_web_image_poll_slots: SystemImagePollSlotsSnapshot;
  chatgpt_web_image_protocol: SystemChatGptWebImageProtocolSnapshot;
  image_spool: SystemImageSpoolSnapshot;
  image_request_phases: SystemImageRequestPhasesSnapshot;
}
