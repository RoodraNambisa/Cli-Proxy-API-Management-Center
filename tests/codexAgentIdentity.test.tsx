import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { CodexAgentIdentityTaskPanel } from '@/features/authFiles/components/CodexAgentIdentityTaskPanel';
import { resolveCodexAuthModeSummary } from '@/features/authFiles/constants';
import { useCodexAgentIdentityConversion } from '@/features/authFiles/hooks/useCodexAgentIdentityConversion';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi, codexAgentIdentityApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import { normalizeAuthFileEntry } from '@/services/api/authFiles';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, CodexAgentIdentityTask } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const createTask = (overrides: Partial<CodexAgentIdentityTask> = {}): CodexAgentIdentityTask => ({
  id: 'agent-task-1',
  status: 'completed',
  created_at: '2026-07-22T12:00:00Z',
  completed_at: '2026-07-22T12:00:01Z',
  total: 1,
  processed: 1,
  succeeded: 1,
  failed: 0,
  canceled: 0,
  progress_percent: 100,
  results: [
    {
      source_name: 'codex.json',
      target_name: 'codex.json',
      source_mode: 'oauth',
      target_mode: 'agentIdentity',
      stage: 'completed',
      progress_percent: 100,
      status: 'updated',
    },
  ],
  ...overrides,
});

const createCardProps = (file: AuthFileItem): AuthFileCardProps => ({
  file,
  cooldownAsOfMs: Date.parse('2026-07-22T00:00:00Z'),
  compact: true,
  selected: false,
  resolvedTheme: 'light',
  disableControls: false,
  deleting: null,
  statusUpdating: {},
  xaiFieldsUpdating: {},
  quotaFilterType: null,
  keyStats: { bySource: {}, byAuthIndex: {} },
  statusBarCache: new Map(),
  usageSummaryCache: new Map(),
  usageLoading: false,
  onShowModels: vi.fn(),
  onDownload: vi.fn(),
  onOpenPrefixProxyEditor: vi.fn(),
  onDelete: vi.fn(),
  onToggleStatus: vi.fn(),
  onToggleXaiField: vi.fn(),
  onToggleSelect: vi.fn(),
});

describe('Codex Agent Identity management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useNotificationStore.getState().clearAll();
  });

  test('normalizes list mode fields and falls back legacy Codex credentials to OAuth', () => {
    const agent = normalizeAuthFileEntry({
      name: 'agent.json',
      type: 'codex',
      auth_mode: 'agentIdentity',
      auth_mode_label: 'Agent Identity',
      can_convert_to_agent_identity: false,
      can_convert_to_oauth: true,
    });

    expect(agent).toMatchObject({
      authMode: 'agentIdentity',
      authModeLabel: 'Agent Identity',
      canConvertToAgentIdentity: false,
      canConvertToOauth: true,
    });
    expect(resolveCodexAuthModeSummary(agent)).toEqual({
      mode: 'agentIdentity',
      label: 'Agent Identity',
      canConvertToAgentIdentity: false,
      canConvertToOauth: true,
    });
    expect(resolveCodexAuthModeSummary({ name: 'legacy.json', type: 'codex' })?.label).toBe(
      'OAuth'
    );
    expect(
      resolveCodexAuthModeSummary({ name: 'key.json', type: 'codex', auth_kind: 'api_key' })
    ).toBeNull();
  });

  test('shows only backend-authorized conversion actions on a Codex card', () => {
    const onConvert = vi.fn();
    render(
      <AuthFileCard
        {...createCardProps({
          name: 'agent.json',
          type: 'codex',
          auth_mode: 'agentIdentity',
          auth_mode_label: 'Agent Identity',
          can_convert_to_oauth: true,
          can_convert_to_agent_identity: false,
        })}
        onConvertCodexAuthMode={onConvert}
      />
    );

    expect(screen.getByText('Agent Identity')).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'auth_files.codex_identity_convert_to_agent' })
    ).toBeNull();
    const convert = screen.getByRole('button', {
      name: 'auth_files.codex_identity_convert_to_oauth',
    });
    fireEvent.click(convert);
    expect(onConvert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'agent.json' }),
      'oauth'
    );
  });

  test('submits all names and access tokens without a frontend item limit', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createTask());
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createTask());
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue(createTask());
    const names = Array.from({ length: 175 }, (_, index) => `codex-${index}.json`);
    const tokens = Array.from({ length: 175 }, (_, index) => `token-${index}`);

    await codexAgentIdentityApi.startNamesTask(names, 'agentIdentity');
    await codexAgentIdentityApi.startAccessTokensTask(tokens);
    await codexAgentIdentityApi.startNamesTask(['agent.json'], 'oauth');
    await codexAgentIdentityApi.getTask('task/with slash');
    await codexAgentIdentityApi.cancelTask('task/with slash');

    expect(post).toHaveBeenNthCalledWith(1, '/codex/agent-identity/conversion-tasks', {
      names,
      target_mode: 'agentIdentity',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/codex/agent-identity/conversion-tasks', {
      access_tokens: tokens,
      target_mode: 'agentIdentity',
    });
    expect(post).toHaveBeenNthCalledWith(3, '/codex/agent-identity/conversion-tasks', {
      names: ['agent.json'],
      target_mode: 'oauth',
    });
    expect(get).toHaveBeenCalledWith('/codex/agent-identity/conversion-tasks/task%2Fwith%20slash');
    expect(remove).toHaveBeenCalledWith(
      '/codex/agent-identity/conversion-tasks/task%2Fwith%20slash'
    );
  });

  test('clears access tokens after task creation and never persists them', async () => {
    const startTask = vi
      .spyOn(codexAgentIdentityApi, 'startAccessTokensTask')
      .mockResolvedValue(createTask());
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCodexAgentIdentityConversion({
        loadFiles,
        deselectAll: vi.fn(),
        replaceSelection: vi.fn(),
      })
    );

    act(() => result.current.openAccessTokens());
    act(() => result.current.setAccessTokenText('token-a\ntoken-b'));
    await act(async () => result.current.start());

    expect(startTask).toHaveBeenCalledWith(['token-a', 'token-b']);
    expect(result.current.state.accessTokenText).toBe('');
    expect(result.current.state.task?.status).toBe('completed');
    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test('retains failed in-place conversions in the current selection', async () => {
    const task = createTask({
      status: 'completed_with_errors',
      total: 2,
      processed: 2,
      succeeded: 1,
      failed: 1,
      results: [
        {
          source_name: 'ok.json',
          target_name: 'ok.json',
          target_mode: 'agentIdentity',
          stage: 'completed',
          progress_percent: 100,
          status: 'updated',
        },
        {
          source_name: 'failed.json',
          target_name: 'failed.json',
          target_mode: 'agentIdentity',
          stage: 'validating',
          progress_percent: 100,
          status: 'failed',
          error: 'conversion failed',
        },
      ],
    });
    vi.spyOn(codexAgentIdentityApi, 'startNamesTask').mockResolvedValue(task);
    const replaceSelection = vi.fn();
    const { result } = renderHook(() =>
      useCodexAgentIdentityConversion({
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
        replaceSelection,
      })
    );

    act(() => result.current.openNames(['ok.json', 'failed.json'], 'agentIdentity'));
    await act(async () => result.current.start());

    expect(codexAgentIdentityApi.startNamesTask).toHaveBeenCalledWith(
      ['ok.json', 'failed.json'],
      'agentIdentity'
    );
    expect(replaceSelection).toHaveBeenCalledWith(['failed.json']);
  });

  test('does not let an older task snapshot regress current progress', async () => {
    vi.spyOn(codexAgentIdentityApi, 'startNamesTask').mockResolvedValue(
      createTask({
        status: 'running',
        processed: 0,
        succeeded: 0,
        progress_percent: 70,
      })
    );
    vi.spyOn(codexAgentIdentityApi, 'getTask').mockResolvedValue(
      createTask({
        status: 'queued',
        processed: 0,
        succeeded: 0,
        progress_percent: 0,
      })
    );
    const { result } = renderHook(() =>
      useCodexAgentIdentityConversion({
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
        replaceSelection: vi.fn(),
      })
    );

    act(() => result.current.openNames(['codex.json'], 'agentIdentity'));
    await act(async () => result.current.start());
    await act(async () => result.current.refresh());

    expect(result.current.state.task?.status).toBe('running');
    expect(result.current.state.task?.progress_percent).toBe(70);
  });

  test('renders backend task and per-item progress values directly', () => {
    render(
      <CodexAgentIdentityTaskPanel
        task={createTask({
          status: 'running',
          progress_percent: 42,
          processed: 0,
          succeeded: 0,
          results: [
            {
              source_name: 'source.json',
              target_name: 'source.json',
              target_mode: 'agentIdentity',
              stage: 'registering_identity',
              progress_percent: 65,
              status: 'running',
            },
          ],
        })}
        refreshing={false}
        canceling={false}
        onRefresh={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText('65%')).not.toBeNull();
    expect(screen.getByText('registering_identity')).not.toBeNull();
    expect(screen.getAllByText('source.json')).toHaveLength(2);
  });

  test('loads the complete Agent Identity JSON only through the existing download path', async () => {
    const completeCredential = JSON.stringify({
      type: 'codex',
      auth_mode: 'agentIdentity',
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      agent_private_key: 'private-secret',
      task_id: 'credential-task-secret',
    });
    const downloadText = vi
      .spyOn(authFilesApi, 'downloadText')
      .mockResolvedValue(completeCredential);
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
      })
    );

    await act(async () =>
      result.current.openPrefixProxyEditor({
        name: 'agent.json',
        type: 'codex',
        auth_mode: 'agentIdentity',
      })
    );

    expect(downloadText).toHaveBeenCalledWith('agent.json');
    expect(result.current.prefixProxyEditor?.rawText).toContain('access-secret');
    expect(result.current.prefixProxyEditor?.rawText).toContain('refresh-secret');
    expect(result.current.prefixProxyEditor?.rawText).toContain('private-secret');
    expect(result.current.prefixProxyEditor?.rawText).toContain('credential-task-secret');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
