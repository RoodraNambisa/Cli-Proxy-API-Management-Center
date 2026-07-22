import type { CodexAuthMode } from './authFile';

export type CodexAgentIdentityTaskStatus =
  | 'queued'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'completed_with_errors'
  | 'canceled';

export type CodexAgentIdentityResultStatus =
  | 'queued'
  | 'running'
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'failed'
  | 'canceled';

export interface CodexAgentIdentityTaskResult {
  source_name: string;
  target_name?: string;
  source_mode?: CodexAuthMode | string;
  target_mode: CodexAuthMode | string;
  email?: string;
  account_id?: string;
  plan_type?: string;
  stage: string;
  progress_percent: number;
  status: CodexAgentIdentityResultStatus | string;
  error_category?: string;
  error?: string;
}

export interface CodexAgentIdentityTask {
  id: string;
  status: CodexAgentIdentityTaskStatus | string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  progress_percent: number;
  results: CodexAgentIdentityTaskResult[];
}

export const isCodexAgentIdentityTaskTerminal = (status: string): boolean =>
  status === 'completed' || status === 'completed_with_errors' || status === 'canceled';
