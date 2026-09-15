import { apiClient, type ApiClientConnectionSnapshot } from './client';

export type LibraryUsage = {
  used_bytes: number;
  allowed_bytes: number;
  remaining_bytes: number;
  is_over_limit: boolean;
};

export type LibraryCleanupResult = {
  name: string;
  stage: string;
  scanned: number;
  total_files: number;
  deleted_files: number;
  failed_files: number;
  skipped_files: number;
  before?: LibraryUsage;
  after?: LibraryUsage;
  error_code?: string;
  failure_stage?: string;
  http_status?: number;
  failure_reasons?: Record<string, number>;
};

export type LibraryCleanupTask = {
  source?: 'manual' | 'automatic';
  id: string;
  state: 'running' | 'canceling' | 'completed' | 'completed_with_errors' | 'canceled';
  concurrency: number;
  started_at: string;
  finished_at?: string;
  results: LibraryCleanupResult[];
  total_credentials: number;
  processed_credentials: number;
  deleted_files: number;
  page: number;
};

export const isLibraryCleanupActive = (task: LibraryCleanupTask | null) =>
  task?.state === 'running' || task?.state === 'canceling';

export const parseLibraryConcurrency = (value: string): number | null => {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 32 ? number : null;
};

const path = '/chatgpt-web/library-cleanup';
type Response = { task: LibraryCleanupTask | null };

export const readLibraryCleanupResponse = (value: unknown): Response => {
  if (!value || typeof value !== 'object' || !('task' in value))
    throw new Error('Invalid cleanup status');
  if (value.task === null) return { task: null };
  const task = value.task as LibraryCleanupTask;
  if (
    !task ||
    typeof task.id !== 'string' ||
    !task.id ||
    !['running', 'canceling', 'completed', 'completed_with_errors', 'canceled'].includes(
      task.state
    ) ||
    !Array.isArray(task.results)
  )
    throw new Error('Invalid cleanup status');
  for (const result of task.results) {
    if (
      !result ||
      typeof result.name !== 'string' ||
      typeof result.stage !== 'string' ||
      !['scanned', 'total_files', 'deleted_files', 'failed_files', 'skipped_files'].every(
        (key) =>
          Number.isSafeInteger(result[key as keyof LibraryCleanupResult]) &&
          Number(result[key as keyof LibraryCleanupResult]) >= 0
      )
    )
      throw new Error('Invalid cleanup progress');
    if (
      result.failure_reasons &&
      (typeof result.failure_reasons !== 'object' ||
        Object.values(result.failure_reasons).some(
          (count) => !Number.isSafeInteger(count) || count < 0
        ))
    )
      throw new Error('Invalid cleanup failure reasons');
  }
  if (
    ![task.total_credentials, task.processed_credentials, task.deleted_files, task.page].every(
      (n) => Number.isSafeInteger(n) && n >= 0
    ) ||
    task.page < 1
  )
    throw new Error('Invalid cleanup totals');
  return { task };
};

export const chatGptWebLibraryApi = {
  get: (connection: ApiClientConnectionSnapshot, signal?: AbortSignal, page = 1) =>
    apiClient
      .getAtConnection<Response>(connection, path, { signal, params: { page } })
      .then(readLibraryCleanupResponse),
  start: (
    connection: ApiClientConnectionSnapshot,
    selection: { names: string[] } | { all: true },
    concurrency: number
  ) =>
    apiClient
      .postAtConnection<Response>(connection, path, {
        ...selection,
        concurrency,
        confirm_delete_all_files: true,
      })
      .then(readLibraryCleanupResponse),
  cancel: (connection: ApiClientConnectionSnapshot, id: string) =>
    apiClient
      .deleteAtConnection<Response>(connection, `${path}/${encodeURIComponent(id)}`)
      .then(readLibraryCleanupResponse),
};
