import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { StartupHistoryPanel } from '@/features/system/StartupHistoryPanel';
import { historyStorageApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { StartupStatusSnapshot, StorageHistorySnapshot } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

const startup: StartupStatusSnapshot = {
  phase: 'ready',
  ready: true,
  started_at: '2026-08-18T00:00:00Z',
  updated_at: '2026-08-18T00:00:10Z',
  stages: [
    {
      name: 'auth_store_load',
      status: 'completed',
      started_at: '2026-08-18T00:00:01Z',
      completed_at: '2026-08-18T00:00:05Z',
      duration_milliseconds: 4000,
      processed: 100,
      error_code: '',
    },
  ],
};

const history: StorageHistorySnapshot = {
  usage: {
    collection_enabled: true,
    persistence_enabled: false,
    persist_interval_seconds: 0,
    detail_retention_days: 30,
    max_storage_megabytes: 512,
    detail_count: 947632,
    total_requests: 1_000_000,
    success_count: 400000,
    failure_count: 600000,
    oldest_at: '2026-08-01T00:00:00Z',
    newest_at: '2026-08-18T00:00:00Z',
    storage: {
      available: true,
      total_bytes: 64 * 1024 * 1024,
      main: { exists: true, size_bytes: 64 * 1024 * 1024, modified_at: null },
      pending: { exists: false, size_bytes: 0, modified_at: null },
      legacy: { exists: false, size_bytes: 0, modified_at: null },
    },
    restore: {
      enabled: true,
      status: 'completed',
      active: false,
      applied: true,
      needs_sidecar: false,
      started_at: null,
      completed_at: null,
      added: 947632,
      skipped: 0,
      error_code: '',
    },
  },
  logs: {
    file_logging_enabled: false,
    retention_days: 7,
    max_total_size_mb: 128,
    storage: {
      available: true,
      file_count: 3,
      total_bytes: 8 * 1024 * 1024,
      oldest_at: '2026-08-17T00:00:00Z',
      newest_at: '2026-08-18T00:00:00Z',
    },
  },
};

describe('startup and history storage panel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(historyStorageApi, 'getStartupStatus').mockResolvedValue(startup);
    vi.spyOn(historyStorageApi, 'getStorageHistory').mockResolvedValue(history);
  });

  test('shows startup stages and aggregate history without exposing paths', async () => {
    render(<StartupHistoryPanel connected connectionKey="server-a" />);

    const startupPanel = await screen.findByTestId('startup-status');
    expect(within(startupPanel).getByText('system_info.startup.phases.ready')).toBeTruthy();
    expect(within(startupPanel).getByText('4,000 ms')).toBeTruthy();
    const historyPanel = await screen.findByTestId('history-storage');
    expect(within(historyPanel).getByText('947,632')).toBeTruthy();
    expect(within(historyPanel).getByText('64.0 MiB')).toBeTruthy();
    expect(within(historyPanel).getByText('3')).toBeTruthy();
    expect(historyPanel.textContent).not.toContain('/tmp');
  });

  test('validates cleanup input and runs the confirmed server cleanup', async () => {
    const confirmation = vi.fn();
    const notification = vi.fn();
    useNotificationStore.setState({
      showConfirmation: confirmation,
      showNotification: notification,
    });
    const pruneUsage = vi.spyOn(historyStorageApi, 'pruneUsage').mockResolvedValue({
      pruned: 42,
      saved: true,
      size_bytes: 1024,
      detail_count_before: 100,
      detail_count_after: 58,
      total_requests_before: 100,
      total_requests_after: 58,
    });
    render(<StartupHistoryPanel connected connectionKey="server-a" />);
    const panel = await screen.findByTestId('history-storage');
    const cleanup = within(panel).getByText('system_info.history_storage.cleanup_usage');
    expect(cleanup.closest('button')?.disabled).toBe(false);

    fireEvent.change(
      within(panel).getAllByLabelText('system_info.history_storage.older_than_days')[0],
      { target: { value: '0' } }
    );
    fireEvent.change(
      within(panel).getAllByLabelText('system_info.history_storage.max_megabytes')[0],
      { target: { value: '0' } }
    );
    expect(cleanup.closest('button')?.disabled).toBe(true);

    fireEvent.change(
      within(panel).getAllByLabelText('system_info.history_storage.older_than_days')[0],
      { target: { value: '14' } }
    );
    fireEvent.click(cleanup);
    const options = confirmation.mock.calls[0][0] as { onConfirm: () => Promise<void> };
    await act(async () => options.onConfirm());
    expect(pruneUsage).toHaveBeenCalledWith({ older_than_days: 14, max_storage_megabytes: 0 });
    expect(notification).toHaveBeenCalledWith(
      'system_info.history_storage.cleanup_success',
      'success'
    );
  });

  test('degrades safely against an older backend', async () => {
    vi.mocked(historyStorageApi.getStartupStatus).mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
    vi.mocked(historyStorageApi.getStorageHistory).mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
    render(<StartupHistoryPanel connected connectionKey="legacy" />);
    await waitFor(() => {
      expect(screen.getByText('system_info.startup.unsupported')).toBeTruthy();
      expect(screen.getByText('system_info.history_storage.unsupported')).toBeTruthy();
    });
  });
});
