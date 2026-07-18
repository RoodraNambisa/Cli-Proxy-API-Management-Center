import type { AuthFileItem } from './authFile';

export type ChatGptWebLoginTaskState =
  | 'queued'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'completed_with_errors'
  | 'canceled';

export type ChatGptWebLoginResultStatus =
  | 'queued'
  | 'running'
  | 'committing'
  | 'success'
  | 'failed'
  | 'canceled';

export interface ChatGptWebLoginResult {
  line: number;
  email: string;
  status: ChatGptWebLoginResultStatus;
  name?: string;
  auth_index?: string;
  lifecycle_state?: string;
  error_category?: string;
  error?: string;
  http_status?: number;
}

export interface ChatGptWebLoginTask {
  id: string;
  state: ChatGptWebLoginTaskState;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  results: ChatGptWebLoginResult[];
}

export interface ChatGptWebReloginResponse {
  status: 'ok' | 'failed' | 'conflict' | string;
  auth?: AuthFileItem;
  warning?: string;
  error_category?: string;
  error?: string;
}

export const isChatGptWebLoginTaskTerminal = (state: ChatGptWebLoginTaskState): boolean =>
  state === 'completed' || state === 'completed_with_errors' || state === 'canceled';
