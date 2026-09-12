import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { LogsPage } from '@/pages/LogsPage';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api/authFiles';
import { logsApi } from '@/services/api/logs';
import type { LiveLogCallbacks } from '@/services/api/liveLogs';

const streams = vi.hoisted(() => ({
  callbacks: null as LiveLogCallbacks | null,
  queries: [] as unknown[],
}));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/api/liveLogs', async (original) => ({
  ...(await original<typeof import('@/services/api/liveLogs')>()),
  streamLiveLogs: async (query: unknown, callbacks: LiveLogCallbacks, signal: AbortSignal) => {
    streams.queries.push(query);
    streams.callbacks = callbacks;
    callbacks.onOpen?.();
    await new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true })
    );
  },
}));

beforeEach(() => {
  streams.callbacks = null;
  streams.queries = [];
  window.localStorage.clear();
  window.localStorage.setItem('logsPage.liveEnabled', 'true');
  useAuthStore.setState({
    connectionStatus: 'connected',
    apiBase: 'http://fixture.test',
    managementKey: 'fixture-management',
  });
  useConfigStore.setState({ config: { loggingToFile: false } });
  useNotificationStore.getState().hideConfirmation();
  vi.spyOn(authFilesApi, 'list').mockResolvedValue({
    files: [{ name: 'my-current-credential.json', auth_index: 'hash-fixture' }],
  });
  vi.spyOn(logsApi, 'fetchLogs').mockResolvedValue({
    lines: [],
    'line-count': 0,
    'latest-timestamp': 0,
  });
  vi.spyOn(logsApi, 'clearLogs').mockResolvedValue(undefined);
});

const sendEvent = (cursor: number, message = 'quota exhausted', authName?: string) =>
  act(() => {
    streams.callbacks!.onEvent({
      cursor,
      timestamp: '2026-09-12T19:46:37.274802484Z',
      level: 'warning',
      request_id: 'a5c2bae8',
      provider: 'codex',
      auth_index: 'hash-fixture',
      auth_name: authName,
      status: 429,
      code: 'usage_limit_reached',
      message,
      response_body: '{"error":{"message":"quota exhausted"}}',
    });
  });

test('shows explicit request identity and resolves legacy credential indexes by file name', async () => {
  render(<LogsPage />);
  await waitFor(() => expect(streams.callbacks).not.toBeNull());
  sendEvent(1);
  expect(screen.getByText('logs.request_id_label: a5c2bae8')).toBeTruthy();
  await screen.findByText('logs.credential_label: my-current-credential.json');
  expect(screen.getByText('WARN')).toBeTruthy();
  expect(screen.getByText('429')).toBeTruthy();
  expect(screen.getByText('logs.response_body_label')).toBeTruthy();
  expect(logsApi.fetchLogs).not.toHaveBeenCalled();
  expect(screen.queryByText('logging to file disabled')).toBeNull();
  sendEvent(2, 'captured account', 'name-at-request-time.json');
  expect(screen.getByText('logs.credential_label: name-at-request-time.json')).toBeTruthy();
});

test('clears only the live display, retains the cursor and accepts new events', async () => {
  render(<LogsPage />);
  await waitFor(() => expect(streams.callbacks).not.toBeNull());
  sendEvent(10, 'first event');
  fireEvent.click(screen.getByRole('button', { name: 'logs.clear_display_button' }));
  expect(screen.queryByText('first event')).toBeNull();
  expect(logsApi.clearLogs).not.toHaveBeenCalled();
  sendEvent(11, 'new event');
  expect(screen.getByText('new event')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'logs.refresh_button' }));
  await waitFor(() => expect(streams.queries).toHaveLength(2));
  expect(streams.queries[1]).toMatchObject({ cursor: 11 });
  expect(logsApi.fetchLogs).not.toHaveBeenCalled();
});

test('reports disabled file logging as a translated state and does not repeatedly fetch it', async () => {
  window.localStorage.setItem('logsPage.liveEnabled', 'false');
  useConfigStore.setState({ config: { loggingToFile: true } });
  vi.mocked(logsApi.fetchLogs).mockRejectedValue(new Error('logging to file disabled'));
  render(<LogsPage />);
  await screen.findByText('logs.file_logging_disabled_hint');
  expect(screen.queryByText('logging to file disabled')).toBeNull();
  expect(logsApi.fetchLogs).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'logs.clear_display_button' }));
  expect(logsApi.clearLogs).not.toHaveBeenCalled();
});

test('a delayed file response cannot overwrite newly selected live logs', async () => {
  window.localStorage.setItem('logsPage.liveEnabled', 'false');
  useConfigStore.setState({ config: { loggingToFile: true } });
  let finish!: (value: Awaited<ReturnType<typeof logsApi.fetchLogs>>) => void;
  vi.mocked(logsApi.fetchLogs).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(<LogsPage />);
  await waitFor(() => expect(logsApi.fetchLogs).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('checkbox', { name: 'logs.live_connection' }));
  await waitFor(() => expect(streams.callbacks).not.toBeNull());
  sendEvent(5, 'current live event');
  await act(async () =>
    finish({ lines: ['old file event'], 'line-count': 1, 'latest-timestamp': 1 })
  );
  expect(screen.getByText('current live event')).toBeTruthy();
  expect(screen.queryByText('old file event')).toBeNull();
});

test('file-mode clear still deletes server files after confirmation', async () => {
  window.localStorage.setItem('logsPage.liveEnabled', 'false');
  useConfigStore.setState({ config: { loggingToFile: true } });
  vi.mocked(logsApi.fetchLogs).mockResolvedValue({
    lines: ['[2026-09-13 04:00:00] [a5c2bae8] [warn] retained event'],
    'line-count': 1,
    'latest-timestamp': 1,
  });
  render(<LogsPage />);
  await screen.findByText('retained event');
  fireEvent.click(screen.getByRole('button', { name: 'logs.clear_button' }));
  expect(logsApi.clearLogs).not.toHaveBeenCalled();
  await act(async () => {
    await useNotificationStore.getState().confirmation.options?.onConfirm();
  });
  expect(logsApi.clearLogs).toHaveBeenCalledOnce();
  expect(screen.queryByText('retained event')).toBeNull();
});

test('an old server response cannot dismiss the new server loading state', async () => {
  window.localStorage.setItem('logsPage.liveEnabled', 'false');
  useConfigStore.setState({ config: { loggingToFile: true } });
  const finishes: Array<(value: Awaited<ReturnType<typeof logsApi.fetchLogs>>) => void> = [];
  vi.mocked(logsApi.fetchLogs).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishes.push(resolve);
      })
  );
  render(<LogsPage />);
  await waitFor(() => expect(finishes).toHaveLength(1));
  act(() => useAuthStore.setState({ apiBase: 'http://second-fixture.test' }));
  await waitFor(() => expect(finishes).toHaveLength(2));
  await act(async () =>
    finishes[0]({ lines: ['old server'], 'line-count': 1, 'latest-timestamp': 1 })
  );
  expect(screen.getByText('logs.loading')).toBeTruthy();
  expect(screen.queryByText('old server')).toBeNull();
  await act(async () =>
    finishes[1]({ lines: ['new server'], 'line-count': 1, 'latest-timestamp': 2 })
  );
  expect(screen.getByText('new server')).toBeTruthy();
  expect(screen.queryByText('logs.loading')).toBeNull();
});
