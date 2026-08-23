export interface ProxyPoolEntry {
  id: string;
  'url-template': string;
  ports?: string;
}

export interface ProxyPool {
  name: string;
  'placeholder-charset'?: string;
  'check-interval-seconds'?: number;
  'bind-attempts'?: number;
  'spread-bindings'?: boolean;
  entries: ProxyPoolEntry[];
}

export interface ProxyPoolPatch {
  name?: string;
  'placeholder-charset'?: string;
  'check-interval-seconds'?: number;
  'bind-attempts'?: number;
  'spread-bindings'?: boolean;
  entries?: ProxyPoolEntry[];
  'delete-entry-ids'?: string[];
}

export interface ProxyRule {
  name: string;
  pool?: string;
  targets?: ProxyRuleTarget[];
  providers?: string[];
  priorities?: number[];
}

export interface ProxyRuleTarget {
  pool?: string;
  direct?: boolean;
  priority?: number;
}

export interface ProxyRulesConfig {
  rules: ProxyRule[];
  schemaVersion: number;
  legacyTargetsUnsupported?: boolean;
}

export interface ProxyBindingStatus {
  auth_id: string;
  auth_index?: string;
  provider?: string;
  pool?: string;
  entry?: string;
  direct?: boolean;
  port?: number;
  binding_id: string;
  bound_at: string;
  healthy: boolean | null;
  last_check_at?: string;
  next_check_at?: string;
  ip?: string;
  loc?: string;
  elapsed_ms?: number;
  error?: string;
  error_message?: string;
  endpoint?: string;
  failure_streak?: number;
}

export interface ProxyPoolStatus {
  name: string;
  binding_count: number;
  healthy_count: number;
  unhealthy_count: number;
  unknown_count: number;
  last_check_at?: string;
  bindings?: ProxyBindingStatus[];
  check_running?: boolean;
  check_total?: number;
  check_completed?: number;
  check_failed?: number;
  round_started_at?: string;
  round_completed_at?: string;
  next_check_at?: string;
}

export interface ProxyCheckResult {
  pool: string;
  entry: string;
  port?: number;
  binding_id?: string;
  bound: boolean;
  ok: boolean;
  ip?: string;
  loc?: string;
  http?: string;
  tls?: string;
  colo?: string;
  elapsed_ms?: number;
  checked_at: string;
  error?: string;
  message?: string;
  endpoint?: string;
}

export type ProxyHealthCheckMode = 'cloudflare-trace' | 'http-status';

export interface ProxyHealthCheckEndpoint {
  name: string;
  url: string;
  mode: ProxyHealthCheckMode;
}

export interface ProxyHealthCheckConfig {
  concurrency: number;
  'endpoint-timeout-seconds': number;
  'failure-threshold': number;
  endpoints: ProxyHealthCheckEndpoint[];
}

export interface ProxyHealthCheckRuntime {
  limit?: number;
  active?: number;
  queued?: number;
  peak_active?: number;
  peak_queued?: number;
  attempts?: number;
  acquired?: number;
  canceled?: number;
  completed?: number;
  succeeded?: number;
  failed?: number;
}

export interface ProxyHealthEndpointTestResult {
  name: string;
  mode: ProxyHealthCheckMode;
  ok: boolean;
  elapsed_ms: number;
  error?: string;
}

export type ProxyCheckTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ProxyCheckTask {
  task_id: string;
  pool: string;
  status: ProxyCheckTaskStatus;
  total: number;
  completed: number;
  running: number;
  succeeded: number;
  failed: number;
  bound: number;
  sampled: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  results?: ProxyCheckResult[];
  results_truncated?: boolean;
}

export interface ProxyRebindResult {
  auth_id: string;
  auth_index?: string;
  updated: boolean;
  binding?: ProxyBindingStatus;
  error?: string;
  status?: number;
}
