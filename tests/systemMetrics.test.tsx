import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ChatGptWebUsageCachePanel,
  type ChatGptWebUsageCachePanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebUsageCachePanel';
import { SystemPage } from '@/pages/SystemPage';
import { chatGptWebApi, configApi, historyStorageApi, systemMetricsApi } from '@/services/api';
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
  image_request_memory: {
    available: true,
    capacity_bytes: 512 * 1024 ** 2,
    queue_limit: 64,
    waiting_tasks: 0,
    waiting_bytes: 0,
    processing_tasks: 20,
    processing_bytes: 128 * 1024 ** 2,
    peak_processing_bytes: 256 * 1024 ** 2,
    acquisitions: 100,
    canceled_waits: 2,
    queue_rejected: 4,
    immediate_rejected: 5,
    completion_reservations: 6,
    revoked_completion_reservations: 7,
    bypassed_completion_reservations: 8,
    finalization_active: 1,
    finalization_waiting: 2,
  },
  chatgpt_web_image_in_flight: {
    available: true,
    limit: 64,
    queue_limit: 64,
    active: 55,
    queued: 5,
    peak_active: 64,
    peak_queued: 20,
    admitted: 200,
    immediate_rejects: 9,
    queue_rejects: 10,
    timed_out: 11,
    canceled: 12,
    total_wait_nanos: 2_000_000,
    max_wait_nanos: 1_000_000,
    oldest_active_age_nanos: 6 * 60 * 1_000_000_000,
    active_over_5_minutes: 3,
    active_over_15_minutes: 2,
    active_over_25_minutes: 1,
    shrinking: false,
  },
  chatgpt_web_image_finalizers: {
    available: true,
    limit: 8,
    queue_limit: 64,
    active: 2,
    queued: 4,
    peak_active: 8,
    peak_queued: 12,
    admitted: 80,
    immediate_rejects: 0,
    queue_rejects: 0,
    timed_out: 1,
    canceled: 2,
    total_wait_nanos: 4_000_000,
    max_wait_nanos: 3_000_000,
    oldest_active_age_nanos: 16 * 60 * 1_000_000_000,
    active_over_5_minutes: 2,
    active_over_15_minutes: 1,
    active_over_25_minutes: 0,
    shrinking: false,
  },
  chatgpt_web_image_memory_finalizers: {
    available: true,
    limit: 4,
    queue_limit: 64,
    active: 3,
    queued: 2,
    peak_active: 4,
    peak_queued: 7,
    admitted: 50,
    immediate_rejects: 1,
    queue_rejects: 2,
    timed_out: 3,
    canceled: 4,
    total_wait_nanos: 6_000_000,
    max_wait_nanos: 5_000_000,
    oldest_active_age_nanos: 7 * 60 * 1_000_000_000,
    active_over_5_minutes: 1,
    active_over_15_minutes: 0,
    active_over_25_minutes: 0,
    shrinking: true,
  },
  chatgpt_web_image_poll_slots: {
    available: true,
    capacity_details_available: true,
    limit: 64,
    queue_limit: 64,
    active: 70,
    queued: 6,
    peak_active: 32,
    peak_queued: 12,
    shrinking: false,
    acquire_attempts: 500,
    acquired: 480,
    immediate_rejects: 3,
    queue_rejects: 4,
    timed_out: 5,
    canceled: 20,
    total_wait_nanos: 5_000_000,
    max_wait_nanos: 2_000_000,
  },
  chatgpt_web_image_poll_breaker: {
    available: true,
    enabled: true,
    open: true,
    stall_seconds: 120,
    opened_at: '2026-07-29T11:58:00Z',
    full_since: '2026-07-29T11:57:30Z',
    last_completion_at: '2026-07-29T11:57:00Z',
    no_completion_age_nanos: 180_000_000_000,
    rejected: 7,
    transport_completions: 480,
    canceled_completions: 20,
  },
  chatgpt_web_image_protocol: {
    available: true,
    task_ids_observed: 41,
    exact_streams_started: 37,
    exact_streams_completed: 29,
    exact_stream_fallbacks: 8,
    final_messages_captured: 31,
    task_pages_fetched: 52,
    hidden_outputs_ignored: 6,
    incomplete_pointers_observed: 14,
    all_sources_exhausted_without_output: 3,
  },
  image_spool: {
    available: true,
    current_files: 2,
    current_bytes: 6 * 1024 ** 2,
    peak_bytes: 24 * 1024 ** 2,
    created_files: 120,
    cleaned_files: 118,
    cleanup_failures: 0,
  },
  image_request_phases: {
    available: true,
    handler_scope: 'all_image_routes',
    chatgpt_web_scope: 'chatgpt_web_only_after_executor_selection',
    response_write_count_semantics: 'write_operations',
    metrics: {
      route_request_total: {
        count: 10,
        total_nanos: 100_000_000,
        max_nanos: 30_000_000,
        up_to_1_millisecond: 0,
        over_1_to_10_milliseconds: 2,
        over_10_to_100_milliseconds: 8,
        over_100_milliseconds_to_1_second: 0,
        over_1_to_10_seconds: 0,
        over_10_seconds: 0,
      },
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
      serverVersion: null,
      serverCommit: null,
      serverBuildDate: null,
    });
    useNotificationStore.setState({
      showNotification: vi.fn(),
      confirmation: { isOpen: false, isLoading: false, options: null },
    });
    vi.spyOn(chatGptWebApi, 'getImageTasks').mockResolvedValue({
      collected_at: '2026-07-29T12:00:00Z',
      active: 0,
      canceling: 0,
      active_over_15_minutes: 0,
      registry_capacity: 64,
      tasks: [],
    });
    vi.spyOn(historyStorageApi, 'getStartupStatus').mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
    vi.spyOn(historyStorageApi, 'getStorageHistory').mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({
      apiBase: '',
      connectionStatus: 'disconnected',
      serverVersion: null,
      serverCommit: null,
      serverBuildDate: null,
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
    expect(snapshot.image_request_memory.available).toBe(false);
    expect(snapshot.chatgpt_web_image_in_flight.available).toBe(false);
    expect(snapshot.chatgpt_web_image_finalizers.available).toBe(false);
    expect(snapshot.chatgpt_web_image_memory_finalizers.available).toBe(false);
    expect(snapshot.chatgpt_web_image_poll_slots.available).toBe(false);
    expect(snapshot.chatgpt_web_image_poll_slots.capacity_details_available).toBe(false);
    expect(snapshot.chatgpt_web_image_poll_breaker.available).toBe(false);
    expect(snapshot.chatgpt_web_image_protocol.available).toBe(false);
    expect(snapshot.image_spool.available).toBe(false);
    expect(snapshot.image_request_phases.available).toBe(false);

    const imageSnapshot = normalizeSystemMetricsSnapshot({
      image_post_processing: {
        capacity_bytes: '536870912',
        processing_bytes: -1,
        bypassed_completion_reservations: 17,
      },
      chatgpt_web_image_in_flight: { active: 4, limit: 64, timed_out: '3' },
      chatgpt_web_image_finalizers: { active_over_25_minutes: 2 },
      chatgpt_web_image_memory_finalizers: {
        active: 3,
        limit: 2,
        shrinking: true,
      },
      chatgpt_web_image_poll_slots: {
        active: 5,
        queue_limit: 8,
        queued: 2,
        peak_queued: 3,
        immediate_rejects: 1,
        queue_rejects: 4,
        timed_out: 3,
        shrinking: false,
        max_wait_nanos: '9000000',
      },
      chatgpt_web_image_protocol: {
        task_ids_observed: '12',
        exact_streams_started: -1,
        exact_streams_completed: 7,
        all_sources_exhausted_without_output: '2',
      },
      image_spool: {
        current_files: -1,
        current_bytes: '2048',
        peak_bytes: 1024,
        created_files: 5,
        cleaned_files: 4,
        cleanup_failures: '1',
      },
      image_request_phases: {
        metrics: {
          route_request_total: { count: 2, total_nanos: 100, max_nanos: -5 },
          malformed: null,
        },
      },
    });
    expect(imageSnapshot.image_request_memory).toMatchObject({
      available: true,
      capacity_bytes: 536870912,
      processing_bytes: 0,
      bypassed_completion_reservations: 17,
    });
    expect(imageSnapshot.chatgpt_web_image_in_flight).toMatchObject({
      available: true,
      active: 4,
      limit: 64,
      timed_out: 3,
    });
    expect(imageSnapshot.chatgpt_web_image_finalizers.active_over_25_minutes).toBe(2);
    expect(imageSnapshot.chatgpt_web_image_memory_finalizers).toMatchObject({
      available: true,
      active: 3,
      limit: 2,
      shrinking: true,
    });
    expect(imageSnapshot.chatgpt_web_image_poll_slots).toMatchObject({
      capacity_details_available: true,
      queue_limit: 8,
      queued: 2,
      queue_rejects: 4,
      timed_out: 3,
    });
    expect(imageSnapshot.chatgpt_web_image_poll_slots.max_wait_nanos).toBe(9_000_000);
    expect(imageSnapshot.chatgpt_web_image_protocol).toMatchObject({
      available: true,
      task_ids_observed: 12,
      exact_streams_started: 0,
      exact_streams_completed: 7,
      exact_stream_fallbacks: 0,
      all_sources_exhausted_without_output: 2,
    });
    expect(imageSnapshot.image_spool).toMatchObject({
      available: true,
      current_files: 0,
      current_bytes: 2048,
      peak_bytes: 2048,
      cleanup_failures: 1,
    });

    const legacyPoll = normalizeSystemMetricsSnapshot({
      chatgpt_web_image_poll_slots: { active: 5, peak_active: 6, max_wait_nanos: 7 },
    }).chatgpt_web_image_poll_slots;
    expect(legacyPoll).toMatchObject({
      available: true,
      capacity_details_available: false,
      active: 5,
      peak_active: 6,
      max_wait_nanos: 7,
    });
    expect(imageSnapshot.image_request_phases.metrics).toEqual({
      route_request_total: expect.objectContaining({ count: 2, total_nanos: 100, max_nanos: 0 }),
    });
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
    expect(payload?.['image-usage']['fallback-usage']).toBeUndefined();
  });

  test('edits and saves fixed image usage fallback values', async () => {
    localStorage.setItem('config-management:chatgpt-web-usage-cache-expanded', 'true');
    const snapshot = createUsageSnapshot(undefined);
    snapshot['estimate-token-usage'] = false;
    snapshot['image-usage']['fallback-usage'] = {
      enabled: false,
      'input-text-tokens': 0,
      'input-image-tokens': 0,
      'output-text-tokens': 0,
      'output-image-tokens': 2000,
    };
    vi.spyOn(chatGptWebApi, 'getUsageCache').mockResolvedValue(snapshot);
    const patchUsageCache = vi.spyOn(chatGptWebApi, 'patchUsageCache').mockResolvedValue({});
    const panelRef = createRef<ChatGptWebUsageCachePanelHandle>();

    render(<ChatGptWebUsageCachePanel ref={panelRef} />);
    const enabled = await screen.findByLabelText('chatgpt_web.usage_cache.fallback_enabled');
    fireEvent.click(enabled);
    fireEvent.change(
      document.getElementById('chatgpt-web-usage-fallbackOutputImageTokens') as HTMLInputElement,
      { target: { value: '2400' } }
    );
    await act(async () => {
      expect(await panelRef.current?.save()).toBe(true);
    });

    expect(patchUsageCache).toHaveBeenCalledWith(
      expect.objectContaining({
        'estimate-token-usage': false,
        'image-usage': {
          'auto-output-quality': 'medium',
          'fallback-usage': {
            enabled: true,
            'input-text-tokens': 0,
            'input-image-tokens': 0,
            'output-text-tokens': 0,
            'output-image-tokens': 2400,
          },
        },
      })
    );
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

    expect((document.getElementById('chatgpt-web-usage-max-disk') as HTMLInputElement).value).toBe(
      '2048'
    );
  });

  test('shows bounded image runtime capacity and compact phase diagnostics', async () => {
    useAuthStore.setState({
      serverVersion: 'v7.2.136-fork.1',
      serverCommit: 'abcdef123456',
      serverBuildDate: '2026-08-19T09:00:00Z',
    });
    vi.spyOn(systemMetricsApi, 'get').mockResolvedValue(createSystemSnapshot());
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);

    render(<SystemPage />);
    expect(screen.getByText('v7.2.136-fork.1')).toBeTruthy();
    expect(screen.getByText('abcdef123456')).toBeTruthy();
    const runtime = await screen.findByTestId('image-runtime-metrics');
    expect(within(runtime).getByText('system_info.image_runtime.title')).toBeTruthy();
    expect(within(runtime).getByText('128.0 MiB')).toBeTruthy();
    expect(within(runtime).getByText('/ 512.0 MiB')).toBeTruthy();
    expect(within(runtime).getAllByText('55 / 64').length).toBeGreaterThan(0);
    expect(within(runtime).getByText('2 / 8')).toBeTruthy();
    expect(within(runtime).getAllByText('3 / 4').length).toBeGreaterThan(0);
    expect(within(runtime).getAllByText('70 / 64').length).toBeGreaterThan(0);
    expect(
      within(runtime).getAllByText('system_info.image_runtime.memory_finalizers').length
    ).toBeGreaterThan(0);
    expect(within(runtime).getByText('system_info.image_runtime.shrinking')).toBeTruthy();
    expect(
      within(runtime).getByText('system_info.image_runtime.bypassed_reservations').parentElement
        ?.textContent
    ).toContain('8');
    const pressure = within(runtime).getByTestId('image-resource-pressure');
    expect(
      within(pressure)
        .getByText('system_info.image_runtime.in_flight')
        .closest('article')
        ?.getAttribute('data-state')
    ).toBe('warning');
    const pressurePoll = within(pressure)
      .getByText('system_info.image_runtime.poll_slots')
      .closest('article');
    expect(pressurePoll?.getAttribute('data-state')).toBe('critical');
    expect(within(pressurePoll as HTMLElement).getByText('109%')).toBeTruthy();
    expect((pressurePoll as HTMLElement).querySelector('[style="width: 100%;"]')).not.toBeNull();
    expect(
      within(pressure).getAllByText('system_info.image_runtime.rejected_cumulative')
    ).toHaveLength(4);
    expect(within(pressure).getByText('system_info.image_runtime.tuning_lifecycle')).toBeTruthy();
    expect(within(pressure).getByText('system_info.image_runtime.tuning_poll')).toBeTruthy();
    expect(
      within(pressure).getByText('system_info.image_runtime.tuning_memory_finalizer')
    ).toBeTruthy();
    expect(within(pressure).queryByText('system_info.image_runtime.tuning_memory')).toBeNull();
    const spoolPanel = within(runtime)
      .getByText('system_info.image_runtime.spool')
      .closest('article');
    expect(spoolPanel).not.toBeNull();
    expect(within(spoolPanel as HTMLElement).getByText('6.0 MiB')).toBeTruthy();
    expect(within(spoolPanel as HTMLElement).getByText('24.0 MiB')).toBeTruthy();
    const breakerPanel = within(runtime)
      .getByText('system_info.image_runtime.poll_breaker')
      .closest('article');
    expect(breakerPanel).not.toBeNull();
    expect(
      within(breakerPanel as HTMLElement).getByText('system_info.image_runtime.breaker_open')
    ).toBeTruthy();
    expect(
      within(breakerPanel as HTMLElement).getByText('system_info.image_runtime.breaker_rejected')
        .parentElement?.textContent
    ).toContain('7');

    const protocol = within(runtime).getByTestId('image-protocol-convergence');
    expect(
      within(protocol).getByText('system_info.image_runtime.protocol_convergence')
    ).toBeTruthy();
    fireEvent.click(within(protocol).getByText('system_info.image_runtime.protocol_convergence'));
    expect(
      within(protocol).getByText('system_info.image_runtime.protocol_metrics.task_ids_observed')
        .parentElement?.textContent
    ).toContain('41');
    expect(
      within(protocol).getByText(
        'system_info.image_runtime.protocol_metrics.all_sources_exhausted_without_output'
      ).parentElement?.textContent
    ).toContain('3');
    expect(within(protocol).getByText('system_info.image_runtime.protocol_note')).toBeTruthy();

    fireEvent.click(within(runtime).getByText('system_info.image_runtime.phases'));
    expect(
      within(runtime).getByText('system_info.image_runtime.phase_names.route_request_total')
    ).toBeTruthy();
    expect(within(runtime).getByText('system_info.image_runtime.phase_note')).toBeTruthy();
  });

  test('shows bounded active image tasks and confirms an administrative cancel', async () => {
    vi.mocked(chatGptWebApi.getImageTasks).mockResolvedValue({
      collected_at: '2026-07-29T12:00:00Z',
      active: 1,
      canceling: 0,
      active_over_15_minutes: 1,
      registry_capacity: 64,
      tasks: [
        {
          id: 'task-safe-id',
          status: 'running',
          stage: 'polling',
          started_at: '2026-07-29T11:40:00Z',
          duration_milliseconds: 1_200_000,
          last_progress_at: '2026-07-29T11:59:30Z',
          last_progress_age_milliseconds: 30_000,
          last_poll_completed_at: '2026-07-29T11:59:30Z',
          polls_in_flight: 1,
          credential_fingerprint: 'cred-7ab1',
          canceling: false,
          cancellation_requested_at: null,
          over_15_minutes: true,
        },
      ],
    });
    const cancelTask = vi
      .spyOn(chatGptWebApi, 'cancelImageTask')
      .mockResolvedValue({ id: 'task-safe-id', status: 'canceling' });
    vi.spyOn(systemMetricsApi, 'get').mockResolvedValue(createSystemSnapshot());
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);

    render(<SystemPage />);
    const diagnostics = await screen.findByTestId('image-task-diagnostics');
    expect(chatGptWebApi.getImageTasks).not.toHaveBeenCalled();
    fireEvent.click(within(diagnostics).getByText('system_info.image_runtime.tasks_title'));
    expect(await within(diagnostics).findByText('task-safe-id')).toBeTruthy();
    expect(chatGptWebApi.getImageTasks).toHaveBeenCalledTimes(1);
    expect(
      within(diagnostics).getByText('system_info.image_runtime.task_stages.polling')
    ).toBeTruthy();
    expect(within(diagnostics).getByText('cred-7ab1')).toBeTruthy();

    fireEvent.click(within(diagnostics).getByText('system_info.image_runtime.task_cancel'));
    const confirmation = useNotificationStore.getState().confirmation.options;
    expect(confirmation?.message).toBe('system_info.image_runtime.task_cancel_confirm_message');
    await act(async () => confirmation?.onConfirm());
    expect(cancelTask).toHaveBeenCalledWith('task-safe-id');
  });

  test('does not present missing image runtime groups as healthy zero capacity', async () => {
    vi.spyOn(systemMetricsApi, 'get').mockResolvedValue(
      normalizeSystemMetricsSnapshot({
        collected_at: '2026-07-29T12:00:00Z',
        runtime: { goroutines: 1 },
        filesystems: {},
      })
    );
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);

    render(<SystemPage />);
    const runtime = await screen.findByTestId('image-runtime-metrics');
    expect(within(runtime).getByText('system_info.image_runtime.unavailable')).toBeTruthy();
    expect(within(runtime).queryByTestId('image-protocol-convergence')).toBeNull();
    expect(within(runtime).queryByText('/ 0 B')).toBeNull();
  });

  test('does not fabricate queue health for a legacy poll snapshot', async () => {
    vi.spyOn(systemMetricsApi, 'get').mockResolvedValue(
      normalizeSystemMetricsSnapshot({
        runtime: { goroutines: 1 },
        filesystems: {},
        chatgpt_web_image_poll_slots: {
          limit: 64,
          active: 5,
          peak_active: 6,
          acquire_attempts: 12,
          acquired: 10,
          canceled: 2,
          max_wait_nanos: 7,
        },
      })
    );
    vi.spyOn(configApi, 'getControlPanelUpdateStatus').mockResolvedValue({} as never);
    vi.spyOn(apiKeysApi, 'list').mockResolvedValue([]);
    vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue({} as never);
    vi.spyOn(useModelsStore.getState(), 'fetchModels').mockResolvedValue([]);

    render(<SystemPage />);
    const runtime = await screen.findByTestId('image-runtime-metrics');
    const pollHeading = within(runtime)
      .getAllByText('system_info.image_runtime.poll_slots')
      .find((element) => element.tagName === 'H4');
    expect(pollHeading).toBeTruthy();
    const pollPanel = pollHeading.closest('article');
    expect(pollPanel).not.toBeNull();
    const poll = within(pollPanel as HTMLElement);
    expect(poll.getByText('5 / 64')).toBeTruthy();
    expect(poll.queryByText('system_info.image_runtime.queue')).toBeNull();
    expect(poll.queryByText('system_info.image_runtime.rejected')).toBeNull();
    expect(poll.queryByText('system_info.image_runtime.resize_state')).toBeNull();
    const pressure = within(runtime).getByTestId('image-resource-pressure');
    const pressurePollPanel = within(pressure)
      .getByText('system_info.image_runtime.poll_slots')
      .closest('article');
    expect(pressurePollPanel).not.toBeNull();
    const pressurePoll = within(pressurePollPanel as HTMLElement);
    expect(pressurePoll.getByText('5 / 64')).toBeTruthy();
    expect(pressurePoll.queryByText('system_info.image_runtime.current_queue')).toBeNull();
    expect(pressurePoll.queryByText('system_info.image_runtime.rejected_cumulative')).toBeNull();
    expect(pressurePoll.queryByText('system_info.image_runtime.timed_out_cumulative')).toBeNull();
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
