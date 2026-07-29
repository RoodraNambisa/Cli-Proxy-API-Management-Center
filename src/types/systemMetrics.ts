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

export interface SystemMetricsSnapshot {
  collected_at: string;
  runtime: SystemRuntimeSnapshot;
  filesystems: {
    working_directory: SystemFilesystemSnapshot;
    auth_directory: SystemFilesystemSnapshot;
    usage_cache: SystemFilesystemSnapshot;
  };
}
