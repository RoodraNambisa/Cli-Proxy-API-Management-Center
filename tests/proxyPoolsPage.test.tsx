import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProxyPoolsPage } from '@/pages/ProxyPoolsPage';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';
import { proxyPoolsApi } from '@/services/api/proxyPools';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  ProxyCheckTask,
  ProxyHealthCheckConfig,
  ProxyPool,
  ProxyPoolStatus,
  ProxyRule,
} from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const pool: ProxyPool = {
  name: 'residential',
  'check-interval-seconds': 10,
  'bind-attempts': 3,
  entries: [{ id: 'primary', 'url-template': 'http://proxy.example:8080' }],
};

const status: ProxyPoolStatus = {
  name: pool.name,
  binding_count: 2,
  healthy_count: 2,
  unhealthy_count: 0,
  unknown_count: 0,
};

const healthConfig: ProxyHealthCheckConfig = {
  concurrency: 8,
  'endpoint-timeout-seconds': 8,
  'failure-threshold': 1,
  endpoints: [
    { name: 'primary', url: 'https://primary.example/check', mode: 'http-status' },
    { name: 'backup', url: 'https://backup.example/cdn-cgi/trace', mode: 'cloudflare-trace' },
  ],
};

const completedTask: ProxyCheckTask = {
  task_id: 'task-1',
  pool: pool.name,
  status: 'completed',
  total: 3,
  completed: 3,
  running: 0,
  succeeded: 3,
  failed: 0,
  bound: 2,
  sampled: 1,
  created_at: '2026-08-20T00:00:00Z',
  completed_at: '2026-08-20T00:00:01Z',
};

const runningTask: ProxyCheckTask = {
  ...completedTask,
  status: 'running',
  completed: 1,
  running: 2,
  succeeded: 1,
  completed_at: undefined,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProxyPoolsPage />
    </MemoryRouter>
  );
}

function mockBaseRequests() {
  vi.spyOn(proxyPoolsApi, 'getPools').mockResolvedValue([pool]);
  vi.spyOn(proxyPoolsApi, 'getRulesConfig').mockResolvedValue({ rules: [], schemaVersion: 2 });
  vi.spyOn(proxyPoolsApi, 'getBindings').mockResolvedValue([]);
  vi.spyOn(proxyPoolsApi, 'getPoolStatus').mockResolvedValue(status);
  vi.spyOn(proxyPoolsApi, 'getCheckTasks').mockResolvedValue([]);
  vi.spyOn(proxyPoolsApi, 'getHealthCheck').mockResolvedValue({
    config: healthConfig,
    runtime: {
      limit: 8,
      active: 0,
      queued: 0,
      peak_active: 0,
      peak_queued: 0,
      attempts: 0,
      acquired: 0,
      canceled: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
    },
  });
}

describe('structured proxy health management page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ connectionStatus: 'connected' });
    useNotificationStore.setState({ showNotification: vi.fn() });
    mockBaseRequests();
  });

  test('creates an asynchronous check task instead of waiting for all probes', async () => {
    const create = vi.spyOn(proxyPoolsApi, 'createCheckTask').mockResolvedValue(completedTask);
    const syncCheck = vi.spyOn(proxyPoolsApi, 'checkPool').mockResolvedValue([]);
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('button', { name: 'proxy_pools.check_pool' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(pool.name, 10));
    expect(syncCheck).not.toHaveBeenCalled();
    expect(await screen.findByText('proxy_pools.task_status.completed')).toBeTruthy();
  });

  test('edits concurrency and preserves the user-selected endpoint fallback order', async () => {
    const update = vi.spyOn(proxyPoolsApi, 'updateHealthCheck').mockResolvedValue({ status: 'ok' });
    renderPage();

    const concurrency = await screen.findByLabelText('proxy_pools.health_settings.concurrency');
    await waitFor(() => expect((concurrency as HTMLInputElement).value).toBe('8'));
    fireEvent.change(concurrency, { target: { value: '12' } });
    const moveDown = screen.getAllByRole('button', { name: 'common.move_down' });
    fireEvent.click(moveDown[0]);
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        ...healthConfig,
        concurrency: 12,
        endpoints: [healthConfig.endpoints[1], healthConfig.endpoints[0]],
      })
    );
  });

  test('resumes a running task after page reload and polls it to completion', async () => {
    vi.mocked(proxyPoolsApi.getCheckTasks).mockResolvedValue([runningTask]);
    const getTask = vi.spyOn(proxyPoolsApi, 'getCheckTask').mockResolvedValue(completedTask);
    renderPage();

    expect(await screen.findByText('proxy_pools.task_status.completed')).toBeTruthy();
    expect(getTask).toHaveBeenCalledWith(pool.name, runningTask.task_id);
  });

  test('reuses the active task returned after a duplicate submission conflict', async () => {
    const getTasks = vi
      .mocked(proxyPoolsApi.getCheckTasks)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([runningTask]);
    const create = vi
      .spyOn(proxyPoolsApi, 'createCheckTask')
      .mockRejectedValue({ status: 409, data: { task_id: runningTask.task_id } });
    vi.spyOn(proxyPoolsApi, 'getCheckTask').mockResolvedValue(completedTask);
    const syncCheck = vi.spyOn(proxyPoolsApi, 'checkPool').mockResolvedValue([]);
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('button', { name: 'proxy_pools.check_pool' }));

    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledOnce();
    expect(syncCheck).not.toHaveBeenCalled();
  });

  test('falls back to the legacy synchronous endpoint when task APIs are unavailable', async () => {
    vi.mocked(proxyPoolsApi.getCheckTasks).mockRejectedValue({ status: 404 });
    vi.mocked(proxyPoolsApi.getHealthCheck).mockRejectedValue({ status: 404 });
    const create = vi.spyOn(proxyPoolsApi, 'createCheckTask');
    const syncCheck = vi.spyOn(proxyPoolsApi, 'checkPool').mockResolvedValue([]);
    renderPage();

    await screen.findByText('proxy_pools.legacy_sync_warning');
    fireEvent.click(screen.getByRole('button', { name: 'proxy_pools.check_pool' }));

    await waitFor(() => expect(syncCheck).toHaveBeenCalledWith(pool.name, 10));
    expect(create).not.toHaveBeenCalled();
  });

  test('keeps rule-name focus while entering multiple characters', async () => {
    vi.mocked(proxyPoolsApi.getRulesConfig).mockResolvedValue({
      schemaVersion: 2,
      rules: [
        {
          name: '',
          targets: [{ pool: pool.name, priority: 0 }],
          providers: ['codex'],
          priorities: [4],
        },
      ],
    });
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('tab', { name: 'proxy_pools.tabs.rules' }));
    const nameInput = screen.getByLabelText('proxy_pools.rule_name') as HTMLInputElement;
    nameInput.focus();
    for (const value of ['c', 'co', 'cod', 'codex-route']) {
      fireEvent.change(nameInput, { target: { value } });
      expect(document.activeElement).toBe(nameInput);
    }
    expect(nameInput.value).toBe('codex-route');
  });

  test('allows a v2 direct-only rule when no physical proxy pools exist', async () => {
    vi.mocked(proxyPoolsApi.getPools).mockResolvedValue([]);
    vi.mocked(proxyPoolsApi.getRulesConfig).mockResolvedValue({ schemaVersion: 2, rules: [] });
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: 'proxy_pools.tabs.rules' }));
    const addRule = screen.getByRole('button', {
      name: 'proxy_pools.add_rule',
    }) as HTMLButtonElement;
    expect(addRule.disabled).toBe(false);
    fireEvent.click(addRule);

    const targetsGroup = screen.getByText('proxy_pools.rule_targets').closest('.form-group');
    if (!targetsGroup) throw new Error('proxy target editor is missing');
    fireEvent.click(within(targetsGroup).getByText('proxy_pools.select_rule_target'));
    fireEvent.click(await screen.findByRole('option', { name: 'proxy_pools.rule_target_direct' }));
    fireEvent.click(within(targetsGroup).getByRole('button', { name: 'common.add' }));
    expect(screen.getByText('proxy_pools.rule_target_direct')).toBeTruthy();
  });

  test('saves v2 pool and direct targets with independent priorities', async () => {
    const rules: ProxyRule[] = [
      {
        name: 'codex-route',
        targets: [{ pool: pool.name, priority: 10 }],
        providers: ['codex'],
        priorities: [4],
      },
    ];
    vi.mocked(proxyPoolsApi.getRulesConfig).mockResolvedValue({ schemaVersion: 2, rules });
    const save = vi.spyOn(proxyPoolsApi, 'saveRules').mockResolvedValue(rules);
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('tab', { name: 'proxy_pools.tabs.rules' }));
    const targetsGroup = screen.getByText('proxy_pools.rule_targets').closest('.form-group');
    if (!targetsGroup) throw new Error('proxy target editor is missing');
    fireEvent.click(within(targetsGroup).getByText('proxy_pools.select_rule_target'));
    fireEvent.click(await screen.findByRole('option', { name: 'proxy_pools.rule_target_direct' }));
    fireEvent.click(within(targetsGroup).getByRole('button', { name: 'common.add' }));
    const priorities = screen.getAllByLabelText('proxy_pools.rule_target_priority_for');
    fireEvent.change(priorities[1], { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        [
          {
            name: 'codex-route',
            targets: [
              { pool: pool.name, priority: 10 },
              { direct: true, priority: 5 },
            ],
            providers: ['codex'],
            priorities: [4],
          },
        ],
        2
      )
    );
  });

  test('keeps legacy backends in explicit single-pool compatibility mode', async () => {
    vi.mocked(proxyPoolsApi.getRulesConfig).mockResolvedValue({
      schemaVersion: 1,
      rules: [{ name: 'legacy', pool: pool.name, providers: ['codex'] }],
    });
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('tab', { name: 'proxy_pools.tabs.rules' }));
    expect(await screen.findByText('proxy_pools.legacy_rule_targets_hint')).toBeTruthy();
    expect(screen.queryByText('proxy_pools.rule_target_direct')).toBeNull();
  });

  test('keeps unversioned multi-target payloads read-only to prevent data loss', async () => {
    vi.mocked(proxyPoolsApi.getRulesConfig).mockResolvedValue({
      schemaVersion: 1,
      legacyTargetsUnsupported: true,
      rules: [
        {
          name: 'unversioned',
          targets: [{ pool: pool.name }, { direct: true }],
          providers: ['codex'],
        },
      ],
    });
    renderPage();

    await screen.findByText(pool.name);
    fireEvent.click(screen.getByRole('tab', { name: 'proxy_pools.tabs.rules' }));
    expect(await screen.findByText('proxy_pools.legacy_rule_targets_blocked')).toBeTruthy();
    expect((screen.getByLabelText('proxy_pools.rule_name') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('proxy_pools.rule_target_direct')).toBeTruthy();
  });

  test('provides health settings and asynchronous task labels in every supported locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      expect(locale.proxy_pools.health_settings.concurrency).toBeTruthy();
      expect(locale.proxy_pools.health_settings.timeout).toBeTruthy();
      expect(locale.proxy_pools.health_settings.failure_threshold).toBeTruthy();
      expect(locale.proxy_pools.health_settings.endpoints_hint).toBeTruthy();
      expect(locale.proxy_pools.task_status.running).toBeTruthy();
      expect(locale.proxy_pools.task_errors.proxy_configuration_changed).toBeTruthy();
      expect(locale.proxy_pools.task_errors.proxy_check_lost).toBeTruthy();
      expect(locale.proxy_pools.health_settings.test_errors.request_failed).toBeTruthy();
      expect(locale.proxy_pools.round_progress).toBeTruthy();
      expect(locale.proxy_pools.schedule_after_completion).toBeTruthy();
      expect(locale.proxy_pools.legacy_sync_warning).toBeTruthy();
      expect(locale.proxy_pools.results_truncated).toBeTruthy();
      expect(locale.proxy_pools.rule_targets).toBeTruthy();
      expect(locale.proxy_pools.rule_target_direct).toBeTruthy();
      expect(locale.proxy_pools.rule_target_priority).toBeTruthy();
      expect(locale.proxy_pools.rule_credential_priorities).toBeTruthy();
      expect(locale.proxy_pools.legacy_rule_targets_hint).toBeTruthy();
      expect(locale.proxy_pools.legacy_rule_targets_blocked).toBeTruthy();
      expect(locale.proxy_pools.validation_rule_targets).toBeTruthy();
      expect(locale.proxy_pools.health.not_applicable).toBeTruthy();
    }
  });
});
