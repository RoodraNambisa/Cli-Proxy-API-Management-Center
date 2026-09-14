import type { ChatGptWebSentinelCompatibility } from './chatgptWeb';

export type SentinelScope = 'images' | 'chat' | 'login';
export interface SentinelNode {
  name: string;
  url: string;
  'api-key': string;
}
export interface SentinelRemote {
  scopes?: SentinelScope[];
  nodes?: SentinelNode[];
  'budget-seconds'?: number;
}
export interface SentinelNodeStatus {
  rules_hash?: string;
  sdk_sha256?: string;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  name: string;
  url: string;
  requests: number;
  failures: number;
  go_success: number;
  sdk_success: number;
  local_fallbacks: number;
  last_error: string;
  last_latency_ms: number;
  cooldown_until?: string;
}
export interface SentinelSolverConfig {
  enabled: boolean;
  listen?: string;
  'api-keys'?: string[];
  tls?: { enable: boolean; cert: string; key: string };
  'sdk-fallback-enabled': boolean;
  'go-vm-compatibility'?: ChatGptWebSentinelCompatibility;
  'go-workers'?: number;
  'queue-size'?: number;
  'max-sessions'?: number;
  'memory-budget-mib'?: number;
  'sdk-workers'?: number;
  'sdk-queue-size'?: number;
  'sdk-cache-versions'?: number;
  'session-idle-seconds'?: number;
  'drain-timeout-seconds'?: number;
}
export interface SentinelSolverSnapshot {
  config: SentinelSolverConfig;
  status: {
    running: boolean;
    address: string;
    restart_required: boolean;
    last_error: string;
    runtime: {
      enabled: boolean;
      draining: boolean;
      active: number;
      queued: number;
      sessions: number;
      reserved_bytes: number;
      go_success: number;
      sdk_success: number;
      failures: number;
      rules_hash: string;
      sdk?: { sdk_version?: string; sdk_sha256?: string };
    };
  } | null;
}
