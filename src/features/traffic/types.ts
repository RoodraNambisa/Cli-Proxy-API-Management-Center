export interface QueueSettings {
  enabled: boolean;
  'max-waiting': number;
  'wait-timeout-seconds': number;
  [key: string]: unknown;
}
export interface RoutingAdmission {
  concurrency: number;
  queue: QueueSettings;
  maxQueuedRequests: number;
  maxQueuedBytes: number;
}
export const emptyQueue = (): QueueSettings => ({
  enabled: false,
  'max-waiting': 0,
  'wait-timeout-seconds': 0,
});
export const defaultRoutingAdmission = (): RoutingAdmission => ({
  concurrency: 0,
  queue: emptyQueue(),
  maxQueuedRequests: 1024,
  maxQueuedBytes: 268435456,
});
export interface TrafficSnapshot {
  id: string;
  active: number;
  waiting_credentials?: number;
  concurrency_limit: number;
  rpm_60s: number;
  current_minute: number;
  queued: number;
  rpm_limit: number;
  window_used: number;
  window_minutes: number;
  source?: string;
  concurrency_source?: string;
  as_of: string;
  queue_scope?: string;
}
export interface TrafficOverview {
  active: number;
  queued: number;
  queued_bytes: number;
  requests: number;
  rpm: number;
  started_at: string;
  as_of: string;
  window_seconds: number;
  bucket_seconds: number;
  items: { from: string; to: string; requests: number; rpm: number }[];
}
