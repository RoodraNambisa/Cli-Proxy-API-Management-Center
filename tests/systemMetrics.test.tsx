import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ChatGptWebUsageCachePanel,
  type ChatGptWebUsageCachePanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebUsageCachePanel';
import { SystemPage } from '@/pages/SystemPage';
import { chatGptWebApi, configApi, systemMetricsApi } from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import { apiClient } from '@/services/api/client';
import {
  normalizeSystemFilesystem,
  normalizeSystemMetricsSnapshot,
} from '@/services/api/systemMetrics';
import { useAuthStore, useConfigStore, useModelsStore, useNotificationStore } from '@/stores';
import type { ChatGptWebUsageSnapshot, SystemMetricsSnapshot } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  const i18n = { language: 'en' };
  return {
    ...actual,
    useTranslation: () => ({ t, i18n }),
  };
});

const createUsageSnapshot = (
  filesystem: ChatGptWebUsageSnapshot['filesystem']
): ChatGptWebUsageSnapshot => ({
  'estimate-token-usage': true,
  'usage-cache': {
    enabled: true,
    'disk-threshold-mb': 1,
    'max-disk-size-mb': 1024,
    path: '/tmp/usage-cache',
  },
  'image-usage': { 'auto-output-quality': 'medium' },
  stats: {
    active_memory_entries: 1,
    active_memory_bytes: 1024,
    active_disk_entries: 2,
    active_disk_bytes: 2048,
    peak_disk_bytes: 4096,
    successful_calculations: 3,
    failed_discards: 0,
    capacity_rejections: 0,
    write_errors: 0,
  },
  filesystem,
});

const createSystemSnapshot = (): SystemMetricsSnapshot => ({
  collected_at: '2026-07-29T12:00:00Z',
  runtime: {
    go_version: 'go1.26',
    goos: 'linux',
    goarch: 'amd64',
    logical_cpus: 8,
    gomaxprocs: 4,
    goroutines: 32,
    heap_alloc_bytes: 1024,
    heap_inuse_bytes: 2048,
    stack_inuse_bytes: 512,
    runtime_sys_bytes: 4096,
    total_alloc_bytes: 8192,
    gc_cycles: 5,
    last_gc_at: '2026-07-29T11:59:00Z',
  },
  filesystems: {
    working_directory: {
      status: 'ok',
      path: '/app',
      total_bytes: 1024,
      used_bytes: 512,
      free_bytes: 512,
      available_bytes: 384,
      used_percent: 50,
    },
    auth_directory: {
      status: 'unavailable',
      path: '/auths',
      total_bytes: 0,
      used_bytes: 0,
      free_bytes: 0,
      available_bytes: 0,
      used_percent: 0,
    },
    usage_cache: {
      status: 'ok',
      path: '/tmp',
      total_bytes: 2048,
      used_bytes: 1024,
      free_bytes: 1024,
      available_bytes: 768,
      used_percent: 50,
    },
  },
});

describe('system metrics and filesystem capacity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('__APP_VERSION__', 'test');
    localStorage.clear();
    apiClient.setConfig({
      apiBase: '',
      managementAccessPath: '',
      managementKey: '',
    });
    useAuthStore.setState({
      apiBase: 'http://metrics.test',
      connectionStatus: 'connected',
    });
    useNotificationStore.setState({ showNotification: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({
      apiBase: '',
      connectionStatus: 'disconnected',
    });
  });

  test('normalizes incomplete and invalid system metrics without fabricating capacity', () => {
    expect(normalizeSystemFilesystem({ status: 'ok', used_percent: 140 })).toEqual({
      status: 'ok',
      path: '',
      total_bytes: 0,
      used_bytes: 0,
      free_bytes: 0,
      available_bytes: 0,
      used_percent: 100,
    });

    const snapshot = normalizeSystemMetricsSnapshot({
      runtime: { goroutines: -2, heap_alloc_bytes: '1024' },
      filesystems: {
        working_directory: { status: 'unavailable', path: '/app' },
      },
    });
    expect(snapshot.runtime.goroutines).toBe(0);
    expect(snapshot.runtime.heap_alloc_bytes).toBe(1024);
    expect(snapshot.filesystems.working_directory).toMatchObject({
      status: 'unavailable',
      path: '/app',
    });
    expect(snapshot.filesystems.auth_directory.status).toBe('unsupported');
  });

  test('uses the lightweight management endpoint and normalizes its response', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      collected_at: '2026-07-29T12:00:00Z',
      runtime: { goroutines: 12 },
      filesystems: {
        usage_cache: {
          status: 'ok',
          path: '/tmp',
          total_bytes: 100,
          used_bytes: 25,
          free_bytes: 75,
          available_bytes: 70,
          used_percent: 25,
        },
      },
    });

    await expect(systemMetricsApi.get()).resolves.toMatchObject({
      runtime: { goroutines: 12 },
      filesystems: {
        usage_cache: { status: 'ok', path: '/tmp', used_percent: 25 },
      },
    });
    expect(get).toHaveBeenCalledWith('/system/metrics');
  });

  test('shows cache filesystem capacity and handles an older backend without the field', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const getUsageCache = vi
      .spyOn(chatGptWebApi, 'getUsageCache')
      .mockResolvedValueOnce(
        createUsageSnapshot({
          status: 'ok',
          path: '/var/cache/cpa',
          total_bytes: 1024 ** 3,
          used_bytes: 256 * 1024 ** 2,
          free_bytes: 768 * 1024 ** 2,
          available_bytes: 700 * 1024 ** 2,
          used_percent: 25,
        })
      )
      .mockResolvedValueOnce(createUsageSnapshot(undefined));

    const first = render(<ChatGptWebUsageCachePanel />);
    expect(await screen.findByText('/var/cache/cpa')).toBeTruthy();
    expect(screen.getByText('256.0 MiB')).toBeTruthy();
    expect(screen.getByText('700.0 MiB')).toBeTruthy();
    const filesystemTitle = screen.getByText('chatgpt_web.usage_cache.filesystem_title');
    const filesystemSection = filesystemTitle.parentElement?.parentElement?.parentElement;
    expect(filesystemSection).not.toBeNull();
    expect(within(filesystemSection as HTMLElement).getByText('1.0 GiB')).toBeTruthy();
    first.unmount();

    render(<ChatGptWebUsageCachePanel />);
    expect(await screen.findByText('chatgpt_web.usage_cache.filesystem_unsupported')).toBeTruthy();
    expect(getUsageCache).toHaveBeenCalledTimes(2);
  });

  test('omits resource guard fields when saving against an older backend', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const oldSnapshot = createUsageSnapshot(undefined);
    vi.spyOn(chatGptWebApi, 'getUsageCache').mockResolvedValue(oldSnapshot);
    const patchUsageCache = vi.spyOn(chatGptWebApi, 'patchUsageCache').mockResolvedValue({});
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    render(<ChatGptWebUsageCachePanel ref={panelRef} />);
    expect(
      await screen.findByText('chatgpt_web.usage_cache.resource_guard_unsupported')
    ).toBeTruthy();
    expect(screen.getByText('chatgpt_web.usage_cache.path_hint_legacy')).toBeTruthy();
    expect(screen.getByText('chatgpt_web.usage_cache.security_notice_legacy')).toBeTruthy();
    fireEvent.change(document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement, {
      target: { value: '2048' },
    });
    await act(async () => {
      await panelRef.current?.save();
    });

    await waitFor(() => expect(patchUsageCache).toHaveBeenCalledTimes(1));
    const payload = patchUsageCache.mock.calls[0]?.[0];
    expect(payload?.['usage-cache']).toEqual({
      enabled: true,
      'disk-threshold-mb': 1,
      'max-disk-size-mb': 2048,
      path: '/tmp/usage-cache',
    });
  });

  test('redetects resource guard support after switching server connections', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const supportedSnapshot = createUsageSnapshot(undefined);
    supportedSnapshot['usage-cache']['resource-guard-enabled'] = true;
    supportedSnapshot['usage-cache']['min-available-disk-mb'] = 1024;
    supportedSnapshot['usage-cache']['max-filesystem-used-percent'] = 95;
    const unsupportedSnapshot = createUsageSnapshot(undefined);
    const getUsageCache = vi
      .spyOn(chatGptWebApi, 'getUsageCache')
      .mockResolvedValueOnce(supportedSnapshot)
      .mockResolvedValueOnce(unsupportedSnapshot)
      .mockResolvedValueOnce(supportedSnapshot);

    const view = render(<ChatGptWebUsageCachePanel connectionGenerationKey="server-a" />);
    expect(await screen.findByText('chatgpt_web.usage_cache.resource_guard')).toBeTruthy();

    view.rerender(<ChatGptWebUsageCachePanel connectionGenerationKey="server-b" />);
    expect(
      await screen.findByText('chatgpt_web.usage_cache.resource_guard_unsupported')
    ).toBeTruthy();

    view.rerender(<ChatGptWebUsageCachePanel connectionGenerationKey="server-c" />);
    await waitFor(() =>
      expect(screen.queryByText('chatgpt_web.usage_cache.resource_guard_unsupported')).toBeNull()
    );
    expect(screen.getByText('chatgpt_web.usage_cache.resource_guard')).toBeTruthy();
    expect(getUsageCache).toHaveBeenCalledTimes(3);
  });

  test('does not report an unsupported backend before capability detection completes', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const supportedSnapshot = createUsageSnapshot(undefined);
    supportedSnapshot['usage-cache']['resource-guard-enabled'] = true;
    supportedSnapshot['usage-cache']['min-available-disk-mb'] = 1024;
    supportedSnapshot['usage-cache']['max-filesystem-used-percent'] = 95;
    let resolveSnapshot: ((snapshot: ChatGptWebUsageSnapshot) => void) | undefined;
    vi.spyOn(chatGptWebApi, 'getUsageCache').mockReturnValue(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      })
    );

    render(<ChatGptWebUsageCachePanel connectionGenerationKey="pending-server" />);
    expect(screen.queryByText('chatgpt_web.usage_cache.resource_guard_unsupported')).toBeNull();

    await act(async () => {
      resolveSnapshot?.(supportedSnapshot);
    });
    expect(await screen.findByText('chatgpt_web.usage_cache.resource_guard')).toBeTruthy();
  });

  test('rejects an empty minimum available disk threshold', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const snapshot = createUsageSnapshot(undefined);
    snapshot['usage-cache']['resource-guard-enabled'] = true;
    snapshot['usage-cache']['min-available-disk-mb'] = 1024;
    snapshot['usage-cache']['max-filesystem-used-percent'] = 95;
    vi.spyOn(chatGptWebApi, 'getUsageCache').mockResolvedValue(snapshot);
    const patchUsageCache = vi.spyOn(chatGptWebApi, 'patchUsageCache').mockResolvedValue({});
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    render(<ChatGptWebUsageCachePanel ref={panelRef} />);
    await screen.findByText('chatgpt_web.usage_cache.resource_guard');
    fireEvent.change(
      document.getElementById('chatgpt-web-usage-min-available') as HTMLInputElement,
      { target: { value: '' } }
    );

    expect(panelRef.current?.validate()).toBe(false);
    await act(async () => {
      expect(await panelRef.current?.save()).toBe(false);
    });
    expect(patchUsageCache).not.toHaveBeenCalled();
    expect(screen.getByText('chatgpt_web.usage_cache.validation_min_available')).toBeTruthy();
  });

  test('retains a dirty draft and blocks saving after the server connection changes', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const firstSnapshot = createUsageSnapshot(undefined);
    firstSnapshot['usage-cache']['resource-guard-enabled'] = true;
    firstSnapshot['usage-cache']['min-available-disk-mb'] = 1024;
    firstSnapshot['usage-cache']['max-filesystem-used-percent'] = 95;
    const secondSnapshot = createUsageSnapshot(undefined);
    secondSnapshot['usage-cache']['max-disk-size-mb'] = 4096;
    secondSnapshot['usage-cache']['resource-guard-enabled'] = true;
    secondSnapshot['usage-cache']['min-available-disk-mb'] = 1024;
    secondSnapshot['usage-cache']['max-filesystem-used-percent'] = 95;
    vi.spyOn(chatGptWebApi, 'getUsageCache')
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(secondSnapshot);
    const patchUsageCache = vi.spyOn(chatGptWebApi, 'patchUsageCache').mockResolvedValue({});
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    const view = render(
      <ChatGptWebUsageCachePanel ref={panelRef} connectionGenerationKey="server-a" />
    );
    await screen.findByText('chatgpt_web.usage_cache.resource_guard');
    const maxDiskInput = document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement;
    fireEvent.change(maxDiskInput, { target: { value: '2048' } });

    view.rerender(<ChatGptWebUsageCachePanel ref={panelRef} connectionGenerationKey="server-b" />);
    expect(
      await screen.findByText('chatgpt_web.usage_cache.connection_changed_draft_retained')
    ).toBeTruthy();
    expect((screen.getByDisplayValue('2048') as HTMLInputElement).value).toBe('2048');
    await act(async () => {
      expect(await panelRef.current?.save()).toBe(false);
    });
    expect(patchUsageCache).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('chatgpt_web.usage_cache.reset'));
    await waitFor(() =>
      expect((screen.getByDisplayValue('4096') as HTMLInputElement).value).toBe('4096')
    );
    expect(
      screen.queryByText('chatgpt_web.usage_cache.connection_changed_draft_retained')
    ).toBeNull();
  });

  test('blocks a dirty draft when polling observes changed server configuration', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const firstSnapshot = createUsageSnapshot(undefined);
    firstSnapshot['usage-cache']['orphan-retention-minutes'] = 60;
    firstSnapshot.stats.orphan_directory_count = 0;
    const secondSnapshot = createUsageSnapshot(undefined);
    secondSnapshot['usage-cache']['orphan-retention-minutes'] = 120;
    secondSnapshot.stats.orphan_directory_count = 0;
    const getUsageCache = vi
      .spyOn(chatGptWebApi, 'getUsageCache')
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(secondSnapshot);
    const patchUsageCache = vi.spyOn(chatGptWebApi, 'patchUsageCache').mockResolvedValue({});
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    render(<ChatGptWebUsageCachePanel ref={panelRef} />);
    await screen.findByDisplayValue('60');
    fireEvent.change(document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement, {
      target: { value: '2048' },
    });
    await act(async () => {
      await panelRef.current?.reload();
    });

    expect(getUsageCache).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText('chatgpt_web.usage_cache.server_configuration_changed_draft_retained')
    ).toBeTruthy();
    expect((screen.getByDisplayValue('60') as HTMLInputElement).value).toBe('60');
    await act(async () => {
      expect(await panelRef.current?.save()).toBe(false);
    });
    expect(patchUsageCache).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('chatgpt_web.usage_cache.reset'));
    await waitFor(() =>
      expect((screen.getByDisplayValue('120') as HTMLInputElement).value).toBe('120')
    );
  });

  test('does not overwrite edits made after a background reload starts', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const snapshot = createUsageSnapshot(undefined);
    snapshot['usage-cache']['orphan-retention-minutes'] = 60;
    snapshot.stats.orphan_directory_count = 0;
    let resolveReload: ((value: ChatGptWebUsageSnapshot) => void) | undefined;
    const getUsageCache = vi
      .spyOn(chatGptWebApi, 'getUsageCache')
      .mockResolvedValueOnce(snapshot)
      .mockImplementationOnce(
        () =>
          new Promise<ChatGptWebUsageSnapshot>((resolve) => {
            resolveReload = resolve;
          })
      );
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    render(<ChatGptWebUsageCachePanel ref={panelRef} />);
    await screen.findByDisplayValue('60');
    let reloadPromise: Promise<void> | undefined;
    act(() => {
      reloadPromise = panelRef.current?.reload();
    });
    await waitFor(() => expect(getUsageCache).toHaveBeenCalledTimes(2));
    fireEvent.change(document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement, {
      target: { value: '2048' },
    });
    await act(async () => {
      resolveReload?.(snapshot);
      await reloadPromise;
    });

    expect(
      (document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement).value
    ).toBe('2048');
  });

  test('polls while mounted and stops after leaving the system page', async () => {
    const snapshot = createSystemSnapshot();
    let resolveFirst: ((value: SystemMetricsSnapshot) => void) | undefined;
    const firstRequest = new Promise<SystemMetricsSnapshot>((resolve) => {
      resolveFirst = resolve;
    });
    const getMetrics = vi
      .spyOn(systemMetricsApi, 'get')
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValue(snapshot);
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);
    let poll: (() => void) | undefined;
    const setInterval = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') poll = handler;
      return 17;
    });
    const clearInterval = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

    const view = render(<SystemPage />);
    const initialCalls = getMetrics.mock.calls.length;
    expect(initialCalls).toBe(1);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);

    poll?.();
    expect(getMetrics).toHaveBeenCalledTimes(initialCalls);

    await act(async () => {
      resolveFirst?.(snapshot);
      await firstRequest;
    });
    poll?.();
    expect(getMetrics).toHaveBeenCalledTimes(initialCalls + 1);

    view.unmount();
    expect(clearInterval).toHaveBeenCalledWith(17);
    expect(getMetrics).toHaveBeenCalledTimes(initialCalls + 1);
  });

  test('rechecks support after switching from an older backend', async () => {
    const snapshot = createSystemSnapshot();
    const getMetrics = vi
      .spyOn(systemMetricsApi, 'get')
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
      .mockResolvedValueOnce(snapshot);
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);

    render(<SystemPage />);
    expect(await screen.findByText('system_info.metrics_unsupported')).toBeTruthy();
    expect(getMetrics).toHaveBeenCalledTimes(1);

    useAuthStore.setState((state) => ({
      apiBase: 'http://new-metrics.test',
      connectionGeneration: state.connectionGeneration + 1,
    }));

    expect(await screen.findByText('/app')).toBeTruthy();
    expect(getMetrics).toHaveBeenCalledTimes(2);
  });
});
