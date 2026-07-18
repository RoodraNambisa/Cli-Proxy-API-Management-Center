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
  entries: ProxyPoolEntry[];
}

export interface ProxyPoolPatch {
  name?: string;
  'placeholder-charset'?: string;
  'check-interval-seconds'?: number;
  'bind-attempts'?: number;
  entries?: ProxyPoolEntry[];
  'delete-entry-ids'?: string[];
}

export interface ProxyRule {
  name: string;
  pool: string;
  providers?: string[];
  priorities?: number[];
}

export interface ProxyBindingStatus {
  auth_id: string;
  auth_index?: string;
  provider?: string;
  pool: string;
  entry: string;
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
}

export interface ProxyPoolStatus {
  name: string;
  binding_count: number;
  healthy_count: number;
  unhealthy_count: number;
  unknown_count: number;
  last_check_at?: string;
  bindings?: ProxyBindingStatus[];
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
}

export interface ProxyRebindResult {
  auth_id: string;
  auth_index?: string;
  updated: boolean;
  binding?: ProxyBindingStatus;
  error?: string;
  status?: number;
}
