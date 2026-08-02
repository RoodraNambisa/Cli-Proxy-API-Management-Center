import { StrictMode, createRef } from 'react';
import { AxiosError } from 'axios';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { isChatGptWebAccountInfoRefreshable } from '@/features/authFiles/constants';
import {
  ChatGptWebAccountInfoPanel,
  type ChatGptWebAccountInfoPanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebAccountInfoPanel';
import {
  clearChatGptWebAccountInfoUnsupported,
  markChatGptWebAccountInfoUnsupported,
  resetChatGptWebAccountInfoCapabilityCache,
} from '@/features/chatgptWeb/accountInfoCapability';
import { useChatGptWebAccountInfoRefresh } from '@/features/authFiles/hooks/useChatGptWebAccountInfoRefresh';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { useAuthStore, useNotificationStore } from '@/stores';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';
import type {
  AuthFileItem,
  ChatGptWebAccountInfoRefreshTask,
  ChatGptWebAccountInfoSnapshot,
} from '@/types';
import { formatDateTime } from '@/utils/format';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    }),
  };
});

const createSnapshot = (): ChatGptWebAccountInfoSnapshot => ({
  config: {
    'refresh-workers': 4,
    'refresh-queue-size': 256,
    'refresh-ttl-minutes': 15,
    'recovery-jitter-seconds': 30,
    'max-retries': 3,
  },
  runtime: {
    busy: 2,
    queued: 3,
    scheduled: 4,
    inflight: 2,
    refresh_count: 11,
    retry_count: 5,
    failed_count: 1,
    last_error: '',
  },
});

const createCompletedTask = (names: string[] = ['web.json']): ChatGptWebAccountInfoRefreshTask => ({
  id: 'account-task',
  state: 'completed',
  total: names.length,
  processed: names.length,
  updated: names.length,
  results: names.map((name) => ({ name, status: 'updated' })),
});

const createCardProps = (file: AuthFileItem): AuthFileCardProps => ({
  file,
  cooldownAsOfMs: Date.parse('2026-07-27T00:00:00Z'),
  compact: false,
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

const validatePanel = (panel: ChatGptWebAccountInfoPanelHandle | null): boolean => {
  let valid = false;
  act(() => {
    valid = panel?.validate() ?? false;
  });
  return valid;
};

const flushModalOpen = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ChatGPT Web account info and image quota', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetChatGptWebAccountInfoCapabilityCache();
    localStorage.clear();
    apiClient.setConfig({
      apiBase: '',
      managementAccessPath: '',
      managementKey: '',
    });
    useAuthStore.setState({ connectionStatus: 'connected' });
    useNotificationStore.setState({ showNotification: vi.fn() });
  });

  test('uses the account-info settings and refresh task endpoints', async () => {
    const snapshot = createSnapshot();
    const task = { ...createCompletedTask(), id: 'task id', state: 'running' as const };
    const connection = {
      apiBase: 'https://old.example/v0/management',
      managementKey: 'secret',
      timeout: 30_000,
    };
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue(connection);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(snapshot);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const patchAtConnection = vi.spyOn(apiClient, 'patchAtConnection').mockResolvedValue({});
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue(task);
    const getTask = vi.spyOn(apiClient, 'getAtConnection').mockResolvedValue(task);
    const remove = vi.spyOn(apiClient, 'deleteAtConnection').mockResolvedValue(task);

    await chatGptWebApi.getAccountInfo();
    await chatGptWebApi.putAccountInfo(snapshot.config);
    await chatGptWebApi.patchAccountInfo({ 'refresh-workers': 6 });
    await chatGptWebApi.patchAccountInfo({ 'refresh-workers': 7 }, connection);
    await chatGptWebApi.startAccountInfoRefreshTask(['web.json'], false);
    await chatGptWebApi.getAccountInfoRefreshTask('task id');
    await chatGptWebApi.cancelAccountInfoRefreshTask('task id');

    expect(get).toHaveBeenNthCalledWith(1, '/chatgpt-web/account-info');
    expect(put).toHaveBeenCalledWith('/chatgpt-web/account-info', snapshot.config);
    expect(patch).toHaveBeenCalledWith('/chatgpt-web/account-info', {
      'refresh-workers': 6,
    });
    expect(patchAtConnection).toHaveBeenCalledWith(connection, '/chatgpt-web/account-info', {
      'refresh-workers': 7,
    });
    expect(post).toHaveBeenCalledWith(connection, '/chatgpt-web/account-info/refresh-tasks', {
      names: ['web.json'],
      force: false,
    });
    expect(getTask).toHaveBeenCalledWith(
      connection,
      '/chatgpt-web/account-info/refresh-tasks/task%20id'
    );
    expect(remove).toHaveBeenCalledWith(
      connection,
      '/chatgpt-web/account-info/refresh-tasks/task%20id'
    );
    expect(apiClient.captureConnection).toHaveBeenCalledTimes(1);
  });

  test('isolates scoped task responses from the current connection global events', async () => {
    apiClient.setConfig({
      apiBase: 'https://new.example',
      managementAccessPath: '',
      managementKey: 'new-secret',
    });
    const oldConnection = {
      apiBase: 'https://old.example/v0/management',
      managementKey: 'old-secret',
      timeout: 30_000,
    };
    const versionListener = vi.fn();
    const unauthorizedListener = vi.fn();
    window.addEventListener('server-version-update', versionListener);
    window.addEventListener('unauthorized', unauthorizedListener);

    await apiClient.getAtConnection(oldConnection, '/version', {
      adapter: async (config) => ({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { 'x-cpa-version': 'old-version' },
        config,
        request: {},
      }),
    });
    await expect(
      apiClient.getAtConnection(oldConnection, '/unauthorized', {
        adapter: async (config) => {
          throw new AxiosError(
            'unauthorized',
            AxiosError.ERR_BAD_REQUEST,
            config,
            {},
            {
              data: { error: 'unauthorized' },
              status: 401,
              statusText: 'Unauthorized',
              headers: {},
              config,
            }
          );
        },
      })
    ).rejects.toMatchObject({ status: 401 });
    expect(versionListener).not.toHaveBeenCalled();
    expect(unauthorizedListener).not.toHaveBeenCalled();

    await apiClient.get('/version', {
      adapter: async (config) => ({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { 'x-cpa-version': 'new-version' },
        config,
        request: {},
      }),
    });
    expect(versionListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('server-version-update', versionListener);
    window.removeEventListener('unauthorized', unauthorizedListener);
    apiClient.setConfig({
      apiBase: '',
      managementAccessPath: '',
      managementKey: '',
    });
  });

  test('releases a task connection after terminal and not-found responses', async () => {
    const connection = {
      apiBase: 'https://old.example/v0/management',
      managementKey: 'secret',
      timeout: 30_000,
    };
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue(connection);
    vi.spyOn(apiClient, 'postAtConnection')
      .mockResolvedValueOnce({ ...createCompletedTask(), id: 'failed-task', state: 'running' })
      .mockResolvedValueOnce({ ...createCompletedTask(), id: 'missing-task', state: 'running' });
    const getAtConnection = vi
      .spyOn(apiClient, 'getAtConnection')
      .mockResolvedValueOnce({ ...createCompletedTask(), id: 'failed-task', state: 'failed' })
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ ...createCompletedTask(), state: 'failed' });

    await chatGptWebApi.startAccountInfoRefreshTask(['failed.json'], false);
    await chatGptWebApi.getAccountInfoRefreshTask('failed-task');
    await chatGptWebApi.getAccountInfoRefreshTask('failed-task');
    expect(getAtConnection).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/chatgpt-web/account-info/refresh-tasks/failed-task');

    await chatGptWebApi.startAccountInfoRefreshTask(['missing.json'], false);
    await expect(chatGptWebApi.getAccountInfoRefreshTask('missing-task')).rejects.toMatchObject({
      status: 404,
    });
    await chatGptWebApi.getAccountInfoRefreshTask('missing-task');
    expect(getAtConnection).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith('/chatgpt-web/account-info/refresh-tasks/missing-task');
  });

  test('refreshes only eligible ChatGPT Web credentials', () => {
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'active.json',
        type: 'chatgpt-web',
        lifecycle_state: 'active',
      })
    ).toBe(true);
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'backend-disabled.json',
        type: 'chatgpt-web',
        account_info_refreshable: false,
      })
    ).toBe(false);
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'disabled.json',
        type: 'chatgpt-web',
        disabled: true,
      })
    ).toBe(false);
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'reauth.json',
        type: 'chatgpt-web',
        lifecycle_state: 'reauth_required',
      })
    ).toBe(false);
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'runtime.json',
        type: 'chatgpt-web',
        runtime_only: true,
      })
    ).toBe(false);
    expect(
      isChatGptWebAccountInfoRefreshable({
        name: 'codex.json',
        type: 'codex',
      })
    ).toBe(false);
  });

  test('defines connection, unsupported, stale, and loaded account-info states in every locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      expect(locale.chatgpt_web.account_info.unsupported).toBeTruthy();
      expect(locale.chatgpt_web.account_info.unsupported_stale_snapshot).toBeTruthy();
      expect(locale.chatgpt_web.account_info.stale).toBeTruthy();
      expect(locale.chatgpt_web.account_info.loaded).toBeTruthy();
      expect(locale.chatgpt_web.account_info.connection_changed_draft_retained).toBeTruthy();
      expect(locale.chatgpt_web.account_info.connection_snapshot_stale).toBeTruthy();
      expect(locale.chatgpt_web.account_info.confirm_draft).toBeTruthy();
    }
  });

  test('loads runtime state and saves only changed refresh-pool fields', async () => {
    const initial = createSnapshot();
    const updated = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 6 },
    };
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const saveConnection = {
      apiBase: 'https://save.example/v0/management',
      managementKey: 'save-secret',
      timeout: 30_000,
    };
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue(saveConnection);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();

    render(<ChatGptWebAccountInfoPanel ref={ref} />);

    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    expect(screen.getByText('2 / 4')).not.toBeNull();
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    await act(async () => {
      await ref.current?.save();
    });

    expect(patchAccountInfo).toHaveBeenCalledWith({ 'refresh-workers': 6 }, saveConnection);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    expect(getAccountInfo).toHaveBeenNthCalledWith(1, saveConnection, expect.any(AbortSignal));
    expect(getAccountInfo).toHaveBeenNthCalledWith(2, saveConnection, expect.any(AbortSignal));
  });

  test('defaults a missing auto-refresh field to enabled and saves the disabled switch', async () => {
    const initial = createSnapshot();
    const updated = {
      ...initial,
      config: { ...initial.config, 'auto-refresh-enabled': false },
    };
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();

    render(<ChatGptWebAccountInfoPanel ref={ref} />);

    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const toggle = screen.getByRole('checkbox', {
      name: 'chatgpt_web.account_info.auto_refresh_enabled',
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);

    await act(async () => {
      await ref.current?.save();
    });

    expect(patchAccountInfo).toHaveBeenCalledWith(
      { 'auto-refresh-enabled': false },
      expect.any(Object)
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    expect(toggle.checked).toBe(false);
  });

  test('restarts an aborted initial settings load during StrictMode effect replay', async () => {
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockImplementationOnce(
        (_connection, signal) =>
          new Promise<ChatGptWebAccountInfoSnapshot>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
              },
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(createSnapshot());

    render(
      <StrictMode>
        <ChatGptWebAccountInfoPanel />
      </StrictMode>
    );

    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    await waitFor(() => expect(screen.getByText('2 / 4')).not.toBeNull());
    expect(
      (document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement).disabled
    ).toBe(false);
  });

  test('synchronizes mounted account-info consumers through the shared capability cache', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const refresh = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        connectionGenerationKey: 'shared-connection',
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: [],
        reloadFiles: vi.fn().mockResolvedValue(undefined),
      })
    );
    render(<ChatGptWebAccountInfoPanel connectionGenerationKey="shared-connection" />);
    await waitFor(() => expect(chatGptWebApi.getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));

    act(() => markChatGptWebAccountInfoUnsupported('shared-connection'));
    expect(refresh.result.current.unsupported).toBe(true);
    expect(
      (document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement).disabled
    ).toBe(true);

    act(() => clearChatGptWebAccountInfoUnsupported('shared-connection'));
    expect(refresh.result.current.unsupported).toBe(false);
    expect(
      (document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement).disabled
    ).toBe(false);
  });

  test('rejects blank values for zero-minimum refresh-pool fields', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(chatGptWebApi.getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));

    for (const [field, original] of [
      ['queueSize', '256'],
      ['jitterSeconds', '30'],
      ['maxRetries', '3'],
    ] as const) {
      const input = document.getElementById(
        `chatgpt-web-account-info-${field}`
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '' } });
      expect(validatePanel(ref.current)).toBe(false);
      fireEvent.change(input, { target: { value: original } });
      expect(validatePanel(ref.current)).toBe(true);
    }
  });

  test('does not overwrite an edited draft with an in-flight background poll', async () => {
    const initial = createSnapshot();
    const remote = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 8 },
    };
    let resolveBackground!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const background = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveBackground = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(background);
    render(<ChatGptWebAccountInfoPanel />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(2);
      const workers = document.getElementById(
        'chatgpt-web-account-info-workers'
      ) as HTMLInputElement;
      fireEvent.change(workers, { target: { value: '6' } });
      await act(async () => {
        resolveBackground(remote);
        await background;
      });
      expect(workers.value).toBe('6');
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not overlap background status polling with a pending settings save', async () => {
    const initial = createSnapshot();
    const updated = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 6 },
    };
    let resolvePatch!: (value: unknown) => void;
    const patchPending = new Promise<unknown>((resolve) => {
      resolvePatch = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);
    vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockReturnValue(patchPending);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    vi.useFakeTimers();
    try {
      let savePromise!: Promise<boolean>;
      await act(async () => {
        savePromise = ref.current!.save();
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolvePatch({});
        await savePromise;
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('merges remote changes into untouched fields and patches only edited fields', async () => {
    const initial = createSnapshot();
    const remote = {
      ...initial,
      config: { ...initial.config, 'refresh-queue-size': 512 },
    };
    const saved = {
      ...remote,
      config: { ...remote.config, 'refresh-workers': 6 },
    };
    let resolveBackground!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const background = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveBackground = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(background)
      .mockResolvedValueOnce(saved);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
      const workers = document.getElementById(
        'chatgpt-web-account-info-workers'
      ) as HTMLInputElement;
      const queueSize = document.getElementById(
        'chatgpt-web-account-info-queueSize'
      ) as HTMLInputElement;
      fireEvent.change(workers, { target: { value: '6' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      await act(async () => {
        resolveBackground(remote);
        await background;
      });

      expect(workers.value).toBe('6');
      expect(queueSize.value).toBe('512');
      await act(async () => {
        await ref.current?.save();
      });
      expect(patchAccountInfo).toHaveBeenCalledWith({ 'refresh-workers': 6 }, expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });

  test('foreground reload waits for background polling and discards the edited draft', async () => {
    const initial = createSnapshot();
    const backgroundSnapshot = {
      ...initial,
      config: { ...initial.config, 'refresh-queue-size': 512 },
    };
    const reloaded = {
      ...backgroundSnapshot,
      config: { ...backgroundSnapshot.config, 'refresh-workers': 10 },
    };
    let resolveBackground!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const background = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveBackground = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(background)
      .mockResolvedValueOnce(reloaded);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo');
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
      const workers = document.getElementById(
        'chatgpt-web-account-info-workers'
      ) as HTMLInputElement;
      fireEvent.change(workers, { target: { value: '6' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      let reloadPromise!: Promise<void>;
      await act(async () => {
        reloadPromise = ref.current!.reload();
        await Promise.resolve();
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveBackground(backgroundSnapshot);
        await background;
        await reloadPromise;
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(3);
      expect(workers.value).toBe('10');
      await act(async () => {
        expect(await ref.current?.save()).toBe(true);
      });
      expect(patchAccountInfo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('explicit reload does not reuse an in-flight dirty-preserving reconnect request', async () => {
    const initial = createSnapshot();
    const reconnectSnapshot = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 9 },
    };
    const explicitReloadSnapshot = {
      ...reconnectSnapshot,
      config: { ...reconnectSnapshot.config, 'refresh-workers': 10 },
    };
    let resolveReconnect!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const reconnectRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveReconnect = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(reconnectRequest)
      .mockResolvedValueOnce(explicitReloadSnapshot);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo');
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-1" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));

    let reloadPromise!: Promise<void>;
    await act(async () => {
      reloadPromise = ref.current!.reload();
      await Promise.resolve();
    });
    expect(getAccountInfo).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveReconnect(reconnectSnapshot);
      await reconnectRequest;
      await reloadPromise;
    });

    expect(getAccountInfo).toHaveBeenCalledTimes(3);
    expect(workers.value).toBe('10');
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(patchAccountInfo).not.toHaveBeenCalled();
  });

  test('aborts an in-flight account-info snapshot when the connection changes', async () => {
    let resolveOld!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const oldRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveOld = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(createSnapshot());
    const view = render(<ChatGptWebAccountInfoPanel connectionGenerationKey="connection-1" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    const oldSignal = getAccountInfo.mock.calls[0]?.[1];
    expect(oldSignal).toBeInstanceOf(AbortSignal);
    expect(oldSignal?.aborted).toBe(false);

    view.rerender(<ChatGptWebAccountInfoPanel connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    expect(oldSignal?.aborted).toBe(true);
    expect(getAccountInfo.mock.calls[1]?.[1]?.aborted).toBe(false);

    await act(async () => {
      resolveOld(createSnapshot());
      await oldRequest;
    });
  });

  test('marks a generation change while inactive as unloaded and reloads when active', async () => {
    const initial = createSnapshot();
    const current = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 9 },
    };
    let resolveCurrent!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const currentRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveCurrent = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(currentRequest);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel ref={ref} active connectionGenerationKey="connection-1" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    expect(workers.disabled).toBe(false);

    view.rerender(
      <ChatGptWebAccountInfoPanel ref={ref} active={false} connectionGenerationKey="connection-2" />
    );
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(workers.disabled).toBe(true);
    expect(screen.getByText('chatgpt_web.account_info.connection_snapshot_stale')).not.toBeNull();

    view.rerender(
      <ChatGptWebAccountInfoPanel ref={ref} active connectionGenerationKey="connection-2" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    expect(workers.disabled).toBe(true);

    await act(async () => {
      resolveCurrent(current);
      await currentRequest;
    });
    await waitFor(() => expect(workers.disabled).toBe(false));
    expect(workers.value).toBe('9');
  });

  test('retains a dirty draft across generations until it is explicitly confirmed', async () => {
    const initial = createSnapshot();
    const current = {
      ...initial,
      config: {
        ...initial.config,
        'refresh-workers': 10,
        'refresh-queue-size': 512,
      },
    };
    const saved = {
      ...current,
      config: { ...current.config, 'refresh-workers': 6 },
    };
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(saved);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-1" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    const queueSize = document.getElementById(
      'chatgpt-web-account-info-queueSize'
    ) as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'chatgpt_web.account_info.confirm_draft',
        })
      ).not.toBeNull()
    );
    expect(workers.value).toBe('6');
    expect(queueSize.value).toBe('512');
    expect(workers.disabled).toBe(true);
    expect(validatePanel(ref.current)).toBe(false);
    await act(async () => {
      expect(await ref.current?.save()).toBe(false);
    });
    expect(patchAccountInfo).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'chatgpt_web.account_info.confirm_draft',
      })
    );
    expect(workers.disabled).toBe(false);
    expect(validatePanel(ref.current)).toBe(true);
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });
    expect(patchAccountInfo).toHaveBeenCalledWith({ 'refresh-workers': 6 }, expect.any(Object));
    expect(getAccountInfo).toHaveBeenCalledTimes(3);
  });

  test('discards an in-flight save result after the connection generation changes', async () => {
    const initial = createSnapshot();
    const current = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 10 },
      runtime: { ...initial.runtime, refresh_count: 99 },
    };
    let resolvePatch!: (value: unknown) => void;
    const patchPending = new Promise<unknown>((resolve) => {
      resolvePatch = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(current);
    const patchAccountInfo = vi
      .spyOn(chatGptWebApi, 'patchAccountInfo')
      .mockReturnValue(patchPending);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-1" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    let savePromise!: Promise<boolean>;
    await act(async () => {
      savePromise = ref.current!.save();
      await Promise.resolve();
    });
    await waitFor(() => expect(patchAccountInfo).toHaveBeenCalledTimes(1));

    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolvePatch({});
      expect(await savePromise).toBe(false);
    });

    expect(getAccountInfo).toHaveBeenCalledTimes(2);
    expect(workers.value).toBe('6');
    expect(
      screen.getByRole('button', {
        name: 'chatgpt_web.account_info.confirm_draft',
      })
    ).not.toBeNull();
    expect(validatePanel(ref.current)).toBe(false);
    expect(screen.getByText('2 / 10')).not.toBeNull();
  });

  test('does not start a post-save snapshot after the panel becomes inactive', async () => {
    const initial = createSnapshot();
    let resolvePatch!: (value: unknown) => void;
    const patchPending = new Promise<unknown>((resolve) => {
      resolvePatch = resolve;
    });
    const getAccountInfo = vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(initial);
    vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockReturnValue(patchPending);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(<ChatGptWebAccountInfoPanel ref={ref} active />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    let savePromise!: Promise<boolean>;
    await act(async () => {
      savePromise = ref.current!.save();
      await Promise.resolve();
    });
    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} active={false} />);
    await act(async () => {
      resolvePatch({});
      expect(await savePromise).toBe(true);
    });
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(workers.value).toBe('6');
    expect(validatePanel(ref.current)).toBe(true);
  });

  test('saves an already loaded draft while the panel is inactive', async () => {
    const initial = createSnapshot();
    const getAccountInfo = vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(initial);
    const patchAccountInfo = vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(<ChatGptWebAccountInfoPanel ref={ref} active />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} active={false} />);
    await act(async () => {
      expect(await ref.current?.save()).toBe(true);
    });

    expect(patchAccountInfo).toHaveBeenCalledWith({ 'refresh-workers': 6 }, expect.any(Object));
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(workers.value).toBe('6');
    expect(validatePanel(ref.current)).toBe(true);
  });

  test('does not start a post-save snapshot after the panel unmounts', async () => {
    const initial = createSnapshot();
    let resolvePatch!: (value: unknown) => void;
    const patchPending = new Promise<unknown>((resolve) => {
      resolvePatch = resolve;
    });
    const getAccountInfo = vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(initial);
    vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockReturnValue(patchPending);
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    let savePromise!: Promise<boolean>;
    await act(async () => {
      savePromise = ref.current!.save();
      await Promise.resolve();
    });
    view.unmount();
    await act(async () => {
      resolvePatch({});
      expect(await savePromise).toBe(false);
    });
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
  });

  test('aborts the post-save snapshot when the connection generation changes', async () => {
    const initial = createSnapshot();
    const current = {
      ...initial,
      config: { ...initial.config, 'refresh-workers': 10 },
    };
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(
        (_connection, signal) =>
          new Promise<ChatGptWebAccountInfoSnapshot>((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(current);
    vi.spyOn(chatGptWebApi, 'patchAccountInfo').mockResolvedValue({});
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-1" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });

    let savePromise!: Promise<boolean>;
    await act(async () => {
      savePromise = ref.current!.save();
      await Promise.resolve();
    });
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    const saveRefreshSignal = getAccountInfo.mock.calls[1]?.[1];
    expect(saveRefreshSignal).toBeInstanceOf(AbortSignal);
    expect(saveRefreshSignal?.aborted).toBe(false);

    view.rerender(<ChatGptWebAccountInfoPanel ref={ref} connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(saveRefreshSignal?.aborted).toBe(true));
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(3));
    await act(async () => {
      expect(await savePromise).toBe(false);
    });
    expect(getAccountInfo.mock.calls[2]?.[1]?.aborted).toBe(false);
  });

  test('marks every invalid field for assistive technology and focuses the first one', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    render(<ChatGptWebAccountInfoPanel ref={ref} />);
    await waitFor(() => expect(chatGptWebApi.getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));

    const queueSize = document.getElementById(
      'chatgpt-web-account-info-queueSize'
    ) as HTMLInputElement;
    const maxRetries = document.getElementById(
      'chatgpt-web-account-info-maxRetries'
    ) as HTMLInputElement;
    fireEvent.change(queueSize, { target: { value: '' } });
    fireEvent.change(maxRetries, { target: { value: '11' } });

    expect(validatePanel(ref.current)).toBe(false);
    expect(queueSize.getAttribute('aria-invalid')).toBe('true');
    expect(maxRetries.getAttribute('aria-invalid')).toBe('true');
    expect(queueSize.getAttribute('aria-describedby')).toContain(
      'chatgpt-web-account-info-queueSize-error'
    );
    expect(maxRetries.getAttribute('aria-describedby')).toContain(
      'chatgpt-web-account-info-maxRetries-error'
    );
    await waitFor(() => expect(document.activeElement).toBe(queueSize));
  });

  test('reprobes unsupported account info after the connection generation changes', async () => {
    const unsupportedError = Object.assign(new Error('not found'), { status: 404 });
    let resolveReconnect!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const reconnectRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveReconnect = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockRejectedValueOnce(unsupportedError)
      .mockReturnValueOnce(reconnectRequest);
    localStorage.setItem('config-management:chatgpt-web-account-info-expanded', 'true');
    const view = render(<ChatGptWebAccountInfoPanel connectionGenerationKey="connection-1" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    expect(
      document.getElementById('chatgpt-web-account-info-workers')?.hasAttribute('disabled')
    ).toBe(true);
    await waitFor(() =>
      expect(
        document.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent
      ).toContain('chatgpt_web.account_info.unsupported')
    );

    vi.useFakeTimers();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }

    view.rerender(<ChatGptWebAccountInfoPanel connectionGenerationKey="connection-2" />);
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    expect(
      document.getElementById('chatgpt-web-account-info-workers')?.hasAttribute('disabled')
    ).toBe(true);
    await act(async () => {
      resolveReconnect(createSnapshot());
      await reconnectRequest;
    });
    await waitFor(() =>
      expect(
        document.getElementById('chatgpt-web-account-info-workers')?.hasAttribute('disabled')
      ).toBe(false)
    );
    expect(document.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent).toBe(
      'chatgpt_web.account_info.loaded'
    );
  });

  test('reuses an unsupported account-info capability result after remounting the same connection', async () => {
    const unsupportedError = Object.assign(new Error('not found'), { status: 404 });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockRejectedValue(unsupportedError);
    localStorage.setItem('config-management:chatgpt-web-account-info-expanded', 'true');
    const firstView = render(
      <ChatGptWebAccountInfoPanel connectionGenerationKey="same-unsupported-connection" />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    firstView.unmount();

    render(<ChatGptWebAccountInfoPanel connectionGenerationKey="same-unsupported-connection" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(
      document.getElementById('chatgpt-web-account-info-workers')?.hasAttribute('disabled')
    ).toBe(true);
    expect(screen.getByText('chatgpt_web.account_info.unsupported')).toBeTruthy();
  });

  test('can discard an edited draft after the new backend reports unsupported', async () => {
    const unsupportedError = Object.assign(new Error('not found'), { status: 404 });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValueOnce(createSnapshot())
      .mockRejectedValueOnce(unsupportedError);
    const onDirtyChange = vi.fn();
    const ref = createRef<ChatGptWebAccountInfoPanelHandle>();
    const view = render(
      <ChatGptWebAccountInfoPanel
        ref={ref}
        connectionGenerationKey="connection-1"
        onDirtyChange={onDirtyChange}
      />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
    const workers = document.getElementById('chatgpt-web-account-info-workers') as HTMLInputElement;
    fireEvent.change(workers, { target: { value: '6' } });
    expect(workers.value).toBe('6');

    view.rerender(
      <ChatGptWebAccountInfoPanel
        ref={ref}
        connectionGenerationKey="connection-2"
        onDirtyChange={onDirtyChange}
      />
    );
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByText(
          'chatgpt_web.account_info.unsupported chatgpt_web.account_info.unsupported_stale_snapshot'
        )
      ).not.toBeNull()
    );

    act(() => {
      ref.current?.reset();
    });
    expect(workers.value).toBe('4');
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  test('announces foreground loads and one background error without announcing runtime polls', async () => {
    const initial = createSnapshot();
    const refreshed = {
      ...initial,
      runtime: { ...initial.runtime, refresh_count: 12 },
    };
    let resolveInitial!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const initialRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveInitial = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockReturnValueOnce(initialRequest)
      .mockResolvedValueOnce(refreshed)
      .mockRejectedValueOnce(new Error('temporary disconnect'));

    render(<ChatGptWebAccountInfoPanel />);
    const liveRegion = document.querySelector(
      '[aria-live="polite"][aria-atomic="true"]'
    ) as HTMLElement;
    expect(liveRegion.textContent).toBe('chatgpt_web.account_info.loading');

    await act(async () => {
      resolveInitial(initial);
      await initialRequest;
    });
    expect(liveRegion.textContent).toBe('chatgpt_web.account_info.loaded');

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(2);
      expect(liveRegion.textContent).toBe('chatgpt_web.account_info.loaded');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(3);
      expect(liveRegion.textContent).toContain('chatgpt_web.account_info.load_failed');
      expect(liveRegion.textContent).toContain('chatgpt_web.account_info.stale');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(getAccountInfo).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    {
      name: 'a transient load error',
      error: new Error('temporary disconnect'),
      expectedMessage: 'chatgpt_web.account_info.load_failed',
      staleSnapshotKey: 'chatgpt_web.account_info.stale_snapshot',
      liveStaleKey: 'chatgpt_web.account_info.stale',
    },
    {
      name: 'an unsupported response',
      error: Object.assign(new Error('not found'), { status: 404 }),
      expectedMessage: 'chatgpt_web.account_info.unsupported',
      staleSnapshotKey: 'chatgpt_web.account_info.unsupported_stale_snapshot',
      liveStaleKey: 'chatgpt_web.account_info.unsupported_stale',
    },
  ])(
    'keeps and labels the last snapshot after $name, then stops polling',
    async ({ error, expectedMessage, staleSnapshotKey, liveStaleKey }) => {
      const getAccountInfo = vi
        .spyOn(chatGptWebApi, 'getAccountInfo')
        .mockResolvedValueOnce(createSnapshot())
        .mockRejectedValue(error);
      render(<ChatGptWebAccountInfoPanel />);
      await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));

      vi.useFakeTimers();
      try {
        fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.account_info\.title/ }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getAccountInfo).toHaveBeenCalledTimes(2);
        const staleStatus = screen.getByText(
          (content, element) => element?.tagName === 'SPAN' && content.includes(staleSnapshotKey)
        );
        expect(staleStatus.textContent).toContain(expectedMessage);
        expect(staleStatus.textContent).toContain(staleSnapshotKey);
        const liveRegion = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
        expect(liveRegion?.textContent).toContain(expectedMessage);
        expect(liveRegion?.textContent).toContain(liveStaleKey);
        expect(screen.getByText('2 / 4')).not.toBeNull();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(15000);
        });
        expect(getAccountInfo).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  test('refreshes only visible names automatically and selected names with force', async () => {
    const connection = {
      apiBase: 'https://refresh.example/v0/management',
      managementKey: 'refresh-secret',
      timeout: 30_000,
    };
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue(connection);
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockImplementation(async (names) => createCompletedTask(names));
    const reloadFiles = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ visibleNames, visibleScopeKey }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey,
          visibleNames,
          selectedNames: ['selected-web.json'],
          reloadFiles,
        }),
      {
        initialProps: {
          visibleNames: ['visible-web.json'],
          visibleScopeKey: 'page-1',
        },
      }
    );

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(['visible-web.json'], false, expect.any(Object))
    );
    await waitFor(() => expect(reloadFiles).toHaveBeenCalledTimes(1));

    rerender({ visibleNames: ['replacement-web.json'], visibleScopeKey: 'page-1' });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ visibleNames: ['replacement-web.json'], visibleScopeKey: 'page-2' });
    await waitFor(() =>
      expect(start).toHaveBeenNthCalledWith(2, ['replacement-web.json'], false, expect.any(Object))
    );

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(start).toHaveBeenNthCalledWith(3, ['selected-web.json'], true, expect.any(Object));
    expect(reloadFiles).toHaveBeenCalledTimes(3);
    expect(
      getAccountInfo.mock.calls.every(([callConnection]) => callConnection === connection)
    ).toBe(true);
    expect(start.mock.calls.every(([, , callConnection]) => callConnection === connection)).toBe(
      true
    );
    expect(result.current.manualLiveMessage).toContain(
      'auth_files.chatgpt_web_account_refresh_success'
    );
  });

  test('refreshes explicit names and blocks a second manual run until completion', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    let completeTask: ((task: ChatGptWebAccountInfoRefreshTask) => void) | undefined;
    const start = vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockReturnValue(
      new Promise<ChatGptWebAccountInfoRefreshTask>((resolve) => {
        completeTask = resolve;
      })
    );
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        automaticRefreshEnabled: false,
        visibleScopeKey: 'page-1',
        visibleNames: [],
        selectedNames: [],
        reloadFiles: vi.fn().mockResolvedValue(undefined),
      })
    );

    let firstRun: Promise<void> | undefined;
    act(() => {
      firstRun = result.current.refreshNames(['single-web.json']);
    });
    await waitFor(() => expect(result.current.manualRefreshing).toBe(true));
    expect(result.current.manualRefreshingNames).toEqual(['single-web.json']);
    expect(start).toHaveBeenCalledWith(['single-web.json'], true, expect.any(Object));

    await act(async () => {
      await result.current.refreshNames(['ignored-web.json']);
    });
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      completeTask?.(createCompletedTask(['single-web.json']));
      await firstRun;
    });
    expect(result.current.manualRefreshing).toBe(false);
    expect(result.current.manualRefreshingNames).toEqual([]);
  });

  test('does not refresh the current page when visible refresh inputs are omitted', async () => {
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockImplementation(async (names) => createCompletedTask(names));
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        selectedNames: ['selected-web.json'],
        reloadFiles,
      })
    );

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    });
    expect(getAccountInfo).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(['selected-web.json'], true, expect.any(Object));
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
    expect(reloadFiles).toHaveBeenCalledTimes(1);
  });

  test('submits automatic refresh when the pool is saturated so the backend can return fresh', async () => {
    const getAccountInfo = vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
      ...createSnapshot(),
      config: {
        ...createSnapshot().config,
        'refresh-workers': 1,
        'refresh-queue-size': 0,
      },
      runtime: {
        ...createSnapshot().runtime,
        busy: 1,
        queued: 0,
      },
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockImplementation(async (names) => ({
        ...createCompletedTask(names),
        updated: 0,
        fresh: names.length,
        results: names.map((name) => ({ name, status: 'fresh' })),
      }));
    const reloadFiles = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: 'page-1',
        visibleNames: ['fresh-web.json'],
        selectedNames: [],
        reloadFiles,
      })
    );

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(['fresh-web.json'], false, expect.any(Object))
    );
    await waitFor(() => expect(reloadFiles).toHaveBeenCalledTimes(1));
    expect(getAccountInfo).not.toHaveBeenCalled();
  });

  test('retries unsuccessful visible names after account-info access recovers', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockRejectedValueOnce(new Error('temporary disconnect'))
      .mockImplementation(async (names) => createCompletedTask(names));
    const { rerender } = renderHook(
      ({ disabled }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled,
          visibleScopeKey: 'page-1',
          visibleNames: ['retry-web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { disabled: false } }
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    rerender({ disabled: true });
    rerender({ disabled: false });

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start).toHaveBeenLastCalledWith(['retry-web.json'], false, expect.any(Object));
  });

  test('retries a transient automatic refresh failure without leaving the visible scope', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockRejectedValueOnce(new Error('temporary disconnect'))
        .mockImplementation(async (names) => createCompletedTask(names));

      renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: 'page-1',
          visibleNames: ['retry-web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(start).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(start).toHaveBeenCalledTimes(2);
      expect(start).toHaveBeenLastCalledWith(['retry-web.json'], false, expect.any(Object));
    } finally {
      vi.useRealTimers();
    }
  });

  test('bounds automatic refresh retries for repeated transient failures', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockRejectedValue(new Error('temporary disconnect'));

      renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: 'page-1',
          visibleNames: ['retry-web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4800);
      });
      expect(start).toHaveBeenCalledTimes(4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(start).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not retry a permanent automatic refresh request error', async () => {
    vi.useFakeTimers();
    try {
      const permanentError = Object.assign(new Error('invalid request'), { status: 400 });
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockRejectedValue(permanentError);

      renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: 'page-1',
          visibleNames: ['invalid-web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(start).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('uses only the inner retry budget for automatic queue-full results', async () => {
    vi.useFakeTimers();
    try {
      const queueFullTask: ChatGptWebAccountInfoRefreshTask = {
        ...createCompletedTask(),
        state: 'completed_with_errors',
        failed: 1,
        updated: 0,
        results: [{ name: 'web.json', status: 'failed', error: 'refresh_queue_full' }],
      };
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockResolvedValue(queueFullTask);

      renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: 'page-1',
          visibleNames: ['web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(start).toHaveBeenCalledTimes(4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(start).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  test('refreshes the same visible scope again after leaving and re-entering the page', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockResolvedValue(createCompletedTask());
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ active }) =>
        useChatGptWebAccountInfoRefresh({
          active,
          disabled: false,
          visibleScopeKey: 'page-1',
          visibleNames: ['visible-web.json'],
          selectedNames: [],
          reloadFiles,
        }),
      { initialProps: { active: true } }
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    rerender({ active: true });

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start).toHaveBeenLastCalledWith(['visible-web.json'], false, expect.any(Object));
  });

  test('cancels an old automatic task when the visible scope changes', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const runningTask: ChatGptWebAccountInfoRefreshTask = {
      id: 'old-auto-task',
      state: 'running',
      total: 1,
      processed: 0,
      results: [{ name: 'old-web.json', status: 'running' }],
    };
    const canceledTask: ChatGptWebAccountInfoRefreshTask = {
      ...runningTask,
      state: 'canceled',
      processed: 1,
      canceled: 1,
      results: [{ name: 'old-web.json', status: 'canceled' }],
    };
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockResolvedValueOnce(runningTask)
      .mockResolvedValueOnce(createCompletedTask());
    const cancel = vi
      .spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask')
      .mockResolvedValue(canceledTask);
    const { rerender } = renderHook(
      ({ visibleScopeKey, visibleNames }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey,
          visibleNames,
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      {
        initialProps: {
          visibleScopeKey: 'page-1',
          visibleNames: ['old-web.json'],
        },
      }
    );

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(['old-web.json'], false, expect.any(Object))
    );
    rerender({ visibleScopeKey: 'page-2', visibleNames: ['new-web.json'] });

    await waitFor(() => expect(cancel).toHaveBeenCalledWith('old-auto-task'));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(['new-web.json'], false, expect.any(Object))
    );
  });

  test('aborts an in-flight task poll when the visible scope changes', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'aborted-poll-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'old-web.json', status: 'running' }],
      };
      vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue(runningTask);
      let pollSignal: AbortSignal | undefined;
      const getTask = vi
        .spyOn(chatGptWebApi, 'getAccountInfoRefreshTask')
        .mockImplementation((_taskId, signal) => {
          pollSignal = signal;
          return new Promise<ChatGptWebAccountInfoRefreshTask>((_resolve, reject) => {
            if (!signal) {
              reject(new Error('missing abort signal'));
              return;
            }
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          });
        });
      const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
        ...runningTask,
        state: 'canceled',
        processed: 1,
        canceled: 1,
        results: [{ name: 'old-web.json', status: 'canceled' }],
      });
      const { rerender } = renderHook(
        ({ visibleScopeKey, visibleNames }) =>
          useChatGptWebAccountInfoRefresh({
            active: true,
            disabled: false,
            visibleScopeKey,
            visibleNames,
            selectedNames: [],
            reloadFiles: vi.fn().mockResolvedValue(undefined),
          }),
        {
          initialProps: {
            visibleScopeKey: 'page-1',
            visibleNames: ['old-web.json'],
          },
        }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(getTask).toHaveBeenCalledWith(runningTask.id, expect.any(AbortSignal));
      expect(pollSignal?.aborted).toBe(false);

      rerender({ visibleScopeKey: 'page-2', visibleNames: [] });
      expect(pollSignal?.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledWith(runningTask.id);
      await act(async () => {
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('cancels a running manual task when the page becomes inactive', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'manual-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'web.json', status: 'running' }],
      };
      vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue(runningTask);
      const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
        ...runningTask,
        state: 'canceled',
        processed: 1,
        canceled: 1,
        results: [{ name: 'web.json', status: 'canceled' }],
      });
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderHook(
        ({ active }) =>
          useChatGptWebAccountInfoRefresh({
            active,
            disabled: false,
            visibleScopeKey: 'page-1',
            visibleNames: [],
            selectedNames: ['web.json'],
            reloadFiles,
          }),
        { initialProps: { active: true } }
      );

      let refreshPromise!: Promise<void>;
      await act(async () => {
        refreshPromise = result.current.refreshSelected();
        await Promise.resolve();
      });
      expect(chatGptWebApi.startAccountInfoRefreshTask).toHaveBeenCalledTimes(1);
      rerender({ active: false });
      expect(cancel).toHaveBeenCalledWith('manual-task');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
        await refreshPromise;
      });
      expect(reloadFiles).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    {
      name: 'page leave and re-entry',
      unavailable: { active: false, disabled: false },
    },
    {
      name: 'disable and re-enable',
      unavailable: { active: true, disabled: true },
    },
  ])('invalidates a pending task creation across $name', async ({ unavailable }) => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const runningTask: ChatGptWebAccountInfoRefreshTask = {
      id: 'stale-manual-task',
      state: 'running',
      total: 1,
      processed: 0,
      results: [{ name: 'web.json', status: 'running' }],
    };
    let resolveStart!: (value: ChatGptWebAccountInfoRefreshTask) => void;
    const startRequest = new Promise<ChatGptWebAccountInfoRefreshTask>((resolve) => {
      resolveStart = resolve;
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockReturnValue(startRequest);
    const getTask = vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask');
    const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
      ...runningTask,
      state: 'canceled',
      processed: 1,
      canceled: 1,
      results: [{ name: 'web.json', status: 'canceled' }],
    });
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ active, disabled }) =>
        useChatGptWebAccountInfoRefresh({
          active,
          disabled,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles,
        }),
      { initialProps: { active: true, disabled: false } }
    );

    let refresh!: Promise<void>;
    await act(async () => {
      refresh = result.current.refreshSelected();
      await Promise.resolve();
    });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    rerender(unavailable);
    rerender({ active: true, disabled: false });
    await act(async () => {
      resolveStart(runningTask);
      await refresh;
    });

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(runningTask.id);
    expect(getTask).not.toHaveBeenCalled();
    expect(reloadFiles).not.toHaveBeenCalled();
    expect(result.current.manualRefreshing).toBe(false);
  });

  test('does not cancel a terminal task returned after the connection changes', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const completedTask = createCompletedTask(['web.json']);
    let resolveStart!: (value: ChatGptWebAccountInfoRefreshTask) => void;
    const startRequest = new Promise<ChatGptWebAccountInfoRefreshTask>((resolve) => {
      resolveStart = resolve;
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockReturnValue(startRequest);
    const getTask = vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask');
    const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask');
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ connectionGenerationKey }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          connectionGenerationKey,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles,
        }),
      { initialProps: { connectionGenerationKey: 'connection-1' } }
    );

    let refresh!: Promise<void>;
    await act(async () => {
      refresh = result.current.refreshSelected();
      await Promise.resolve();
    });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    rerender({ connectionGenerationKey: 'connection-2' });
    await act(async () => {
      resolveStart(completedTask);
      await refresh;
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(getTask).not.toHaveBeenCalled();
    expect(reloadFiles).not.toHaveBeenCalled();
    expect(result.current.manualRefreshing).toBe(false);
  });

  test('cancels only a stale manual task after reconnect and keeps the new automatic task', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const staleManualTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'stale-manual-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'old-selected.json', status: 'running' }],
      };
      const currentAutomaticTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'current-automatic-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'new-visible.json', status: 'running' }],
      };
      const completedAutomaticTask: ChatGptWebAccountInfoRefreshTask = {
        ...currentAutomaticTask,
        state: 'completed',
        processed: 1,
        updated: 1,
        results: [{ name: 'new-visible.json', status: 'updated' }],
      };
      let resolveStaleStart!: (value: ChatGptWebAccountInfoRefreshTask) => void;
      const staleStartRequest = new Promise<ChatGptWebAccountInfoRefreshTask>((resolve) => {
        resolveStaleStart = resolve;
      });
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockImplementation((names) =>
          names[0] === 'old-selected.json'
            ? staleStartRequest
            : Promise.resolve(currentAutomaticTask)
        );
      const getTask = vi
        .spyOn(chatGptWebApi, 'getAccountInfoRefreshTask')
        .mockResolvedValue(completedAutomaticTask);
      const cancel = vi
        .spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask')
        .mockImplementation(async (taskId) => ({
          ...(taskId === staleManualTask.id ? staleManualTask : currentAutomaticTask),
          state: 'canceled',
          processed: 1,
          canceled: 1,
        }));
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderHook(
        ({ connectionGenerationKey, visibleNames, selectedNames }) =>
          useChatGptWebAccountInfoRefresh({
            active: true,
            disabled: false,
            connectionGenerationKey,
            visibleScopeKey: 'page-1',
            visibleNames,
            selectedNames,
            reloadFiles,
          }),
        {
          initialProps: {
            connectionGenerationKey: 'connection-1',
            visibleNames: [] as string[],
            selectedNames: ['old-selected.json'],
          },
        }
      );

      let staleRefresh!: Promise<void>;
      await act(async () => {
        staleRefresh = result.current.refreshSelected();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(start).toHaveBeenCalledWith(['old-selected.json'], true, expect.any(Object));

      rerender({
        connectionGenerationKey: 'connection-2',
        visibleNames: ['new-visible.json'],
        selectedNames: [],
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(start).toHaveBeenCalledWith(['new-visible.json'], false, expect.any(Object));

      await act(async () => {
        resolveStaleStart(staleManualTask);
        await staleRefresh;
      });
      expect(cancel).toHaveBeenCalledWith(staleManualTask.id);
      expect(cancel).not.toHaveBeenCalledWith(currentAutomaticTask.id);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(getTask).toHaveBeenCalledWith(currentAutomaticTask.id, expect.any(AbortSignal));
      expect(cancel).not.toHaveBeenCalledWith(currentAutomaticTask.id);
      expect(reloadFiles).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('cancels automatic and manual tasks when controls become disabled and stops polling', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const automaticTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'disabled-auto-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'visible-web.json', status: 'running' }],
      };
      const manualTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'disabled-manual-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'selected-web.json', status: 'running' }],
      };
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockResolvedValueOnce(automaticTask)
        .mockResolvedValueOnce(manualTask);
      const getTask = vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask');
      const cancel = vi
        .spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask')
        .mockImplementation(async (taskId) => ({
          ...(taskId === automaticTask.id ? automaticTask : manualTask),
          state: 'canceled',
        }));
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result, rerender } = renderHook(
        ({ disabled }) =>
          useChatGptWebAccountInfoRefresh({
            active: true,
            disabled,
            visibleScopeKey: 'page-1',
            visibleNames: ['visible-web.json'],
            selectedNames: ['selected-web.json'],
            reloadFiles,
          }),
        { initialProps: { disabled: false } }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(start).toHaveBeenCalledWith(['visible-web.json'], false, expect.any(Object));

      let manualRefresh!: Promise<void>;
      await act(async () => {
        manualRefresh = result.current.refreshSelected();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(start).toHaveBeenCalledWith(['selected-web.json'], true, expect.any(Object));

      rerender({ disabled: true });
      expect(cancel).toHaveBeenCalledWith(automaticTask.id);
      expect(cancel).toHaveBeenCalledWith(manualTask.id);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
        await manualRefresh;
      });
      expect(getTask).not.toHaveBeenCalled();
      expect(reloadFiles).not.toHaveBeenCalled();
      expect(result.current.manualRefreshing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not start a refresh task when controls are disabled during capacity lookup', async () => {
    let resolveSnapshot!: (snapshot: ChatGptWebAccountInfoSnapshot) => void;
    const pendingSnapshot = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockReturnValue(pendingSnapshot);
    const start = vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask');
    const { result, rerender } = renderHook(
      ({ disabled }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { disabled: false } }
    );

    let refresh!: Promise<void>;
    await act(async () => {
      refresh = result.current.refreshSelected();
      await Promise.resolve();
    });
    rerender({ disabled: true });
    await act(async () => {
      resolveSnapshot(createSnapshot());
      await refresh;
    });

    expect(start).not.toHaveBeenCalled();
    expect(result.current.manualRefreshing).toBe(false);
  });

  test('does not start a refresh task when the page becomes inactive during capacity lookup', async () => {
    let resolveSnapshot!: (snapshot: ChatGptWebAccountInfoSnapshot) => void;
    const pendingSnapshot = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockReturnValue(pendingSnapshot);
    const start = vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask');
    const { result, rerender } = renderHook(
      ({ active }) =>
        useChatGptWebAccountInfoRefresh({
          active,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { active: true } }
    );

    let refresh!: Promise<void>;
    await act(async () => {
      refresh = result.current.refreshSelected();
      await Promise.resolve();
    });
    rerender({ active: false });
    await act(async () => {
      resolveSnapshot(createSnapshot());
      await refresh;
    });

    expect(start).not.toHaveBeenCalled();
    expect(result.current.manualRefreshing).toBe(false);
  });

  test('cancels a manual task returned after the hook unmounts', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const runningTask: ChatGptWebAccountInfoRefreshTask = {
      id: 'unmount-manual-task',
      state: 'running',
      total: 1,
      processed: 0,
      results: [{ name: 'web.json', status: 'running' }],
    };
    let resolveStart!: (value: ChatGptWebAccountInfoRefreshTask) => void;
    const startRequest = new Promise<ChatGptWebAccountInfoRefreshTask>((resolve) => {
      resolveStart = resolve;
    });
    vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockReturnValue(startRequest);
    const getTask = vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask');
    const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
      ...runningTask,
      state: 'canceled',
      processed: 1,
      canceled: 1,
      results: [{ name: 'web.json', status: 'canceled' }],
    });
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: 'page-1',
        visibleNames: [],
        selectedNames: ['web.json'],
        reloadFiles,
      })
    );

    let refresh!: Promise<void>;
    await act(async () => {
      refresh = result.current.refreshSelected();
      await Promise.resolve();
    });
    expect(chatGptWebApi.startAccountInfoRefreshTask).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      resolveStart(runningTask);
      await refresh;
    });
    expect(cancel).toHaveBeenCalledWith('unmount-manual-task');
    expect(getTask).not.toHaveBeenCalled();
    expect(reloadFiles).not.toHaveBeenCalled();
  });

  test('does not reload files after a stale automatic task is canceled', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'stale-auto-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'old-web.json', status: 'running' }],
      };
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockResolvedValueOnce(runningTask)
        .mockImplementationOnce(async (names) => createCompletedTask(names));
      vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
        ...runningTask,
        state: 'canceled',
        processed: 1,
        canceled: 1,
        results: [{ name: 'old-web.json', status: 'canceled' }],
      });
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { rerender } = renderHook(
        ({ scope, names }) =>
          useChatGptWebAccountInfoRefresh({
            active: true,
            disabled: false,
            visibleScopeKey: scope,
            visibleNames: names,
            selectedNames: [],
            reloadFiles,
          }),
        { initialProps: { scope: 'page-1', names: ['old-web.json'] } }
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(start).toHaveBeenCalledWith(['old-web.json'], false, expect.any(Object));
      rerender({ scope: 'page-2', names: ['new-web.json'] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1800);
      });
      expect(start).toHaveBeenCalledWith(['new-web.json'], false, expect.any(Object));
      expect(reloadFiles).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('reprobes automatic refresh after an unsupported connection generation changes', async () => {
    const unsupportedError = Object.assign(new Error('not found'), { status: 404 });
    let resolveProbe!: (value: ChatGptWebAccountInfoSnapshot) => void;
    const probeRequest = new Promise<ChatGptWebAccountInfoSnapshot>((resolve) => {
      resolveProbe = resolve;
    });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockReturnValueOnce(probeRequest)
      .mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockRejectedValueOnce(unsupportedError)
      .mockImplementation(async (names) => createCompletedTask(names));
    const { result, rerender } = renderHook(
      ({ connectionGenerationKey }) =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          connectionGenerationKey,
          visibleScopeKey: 'page-1',
          visibleNames: ['visible-web.json'],
          selectedNames: ['selected-web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { connectionGenerationKey: 'connection-1' } }
    );

    await waitFor(() => expect(result.current.unsupported).toBe(true));
    expect(start).toHaveBeenCalledTimes(1);
    expect(getAccountInfo).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refreshSelected();
    });
    expect(getAccountInfo).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ connectionGenerationKey: 'connection-2' });
    await waitFor(() => expect(getAccountInfo).toHaveBeenCalledTimes(1));
    expect(result.current.unsupported).toBe(false);
    await act(async () => {
      resolveProbe(createSnapshot());
      await probeRequest;
    });
    await waitFor(() => expect(result.current.unsupported).toBe(false));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start).toHaveBeenLastCalledWith(['visible-web.json'], false, expect.any(Object));
    expect(getAccountInfo).toHaveBeenCalledTimes(1);
  });

  test('does not reprobe unsupported automatic refresh when the same connection becomes active again', async () => {
    const unsupportedError = Object.assign(new Error('not found'), { status: 404 });
    const getAccountInfo = vi
      .spyOn(chatGptWebApi, 'getAccountInfo')
      .mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockRejectedValueOnce(unsupportedError)
      .mockImplementation(async (names) => createCompletedTask(names));
    const { result, rerender } = renderHook(
      ({ active }) =>
        useChatGptWebAccountInfoRefresh({
          active,
          disabled: false,
          connectionGenerationKey: 'connection-1',
          visibleScopeKey: 'page-1',
          visibleNames: ['visible-web.json'],
          selectedNames: [],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { active: true } }
    );

    await waitFor(() => expect(result.current.unsupported).toBe(true));
    rerender({ active: false });
    rerender({ active: true });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.unsupported).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(getAccountInfo).not.toHaveBeenCalled();
  });

  test('marks a missing refresh-task route as unsupported', async () => {
    const routeMissing = Object.assign(new Error('route not found'), { status: 404 });
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockRejectedValue(routeMissing);
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: ['web.json'],
        reloadFiles,
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });
    expect(result.current.unsupported).toBe(true);
    expect(result.current.manualLiveMessage).toBe(
      'auth_files.chatgpt_web_account_refresh_unsupported'
    );
    expect(start).toHaveBeenCalledTimes(1);
    expect(reloadFiles).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
      'auth_files.chatgpt_web_account_refresh_unsupported',
      'warning'
    );
  });

  test('keeps a missing target result as a task failure instead of capability loss', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    const start = vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue({
      id: 'missing-target-task',
      state: 'completed_with_errors',
      total: 1,
      processed: 1,
      failed: 1,
      results: [
        {
          name: 'deleted-web.json',
          status: 'failed',
          error: 'credential_unavailable',
        },
      ],
    });
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: ['deleted-web.json'],
        reloadFiles,
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });
    expect(result.current.unsupported).toBe(false);
    expect(result.current.manualLiveMessage).toBe('auth_files.chatgpt_web_account_refresh_failed');
    expect(start).toHaveBeenCalledWith(['deleted-web.json'], true, expect.any(Object));
    expect(reloadFiles).toHaveBeenCalledTimes(1);
  });

  test('reports a failed refresh task even when it has no per-target results', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
    vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue({
      id: 'failed-without-results',
      state: 'failed',
      total: 1,
      processed: 0,
      failed: 1,
    });
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: ['web.json'],
        reloadFiles,
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(result.current.manualLiveMessage).toBe('auth_files.chatgpt_web_account_refresh_failed');
    expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
      'auth_files.chatgpt_web_account_refresh_failed',
      'error'
    );
    expect(reloadFiles).toHaveBeenCalledTimes(1);
  });

  test('cleans up a missing poll task after backend restart and allows a later refresh', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'lost-after-restart',
        state: 'running',
        total: 1,
        processed: 0,
      };
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockResolvedValueOnce(runningTask)
        .mockResolvedValueOnce(createCompletedTask(['web.json']));
      const taskMissing = Object.assign(new Error('task not found'), { status: 404 });
      vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask').mockRejectedValueOnce(taskMissing);
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles,
        })
      );

      let firstRefresh!: Promise<void>;
      await act(async () => {
        firstRefresh = result.current.refreshSelected();
        await vi.advanceTimersByTimeAsync(1500);
        await firstRefresh;
      });
      expect(result.current.unsupported).toBe(false);
      expect(start).toHaveBeenCalledTimes(1);
      expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
        'auth_files.chatgpt_web_account_refresh_failed',
        'error'
      );

      await act(async () => {
        await result.current.refreshSelected();
      });
      expect(start).toHaveBeenCalledTimes(2);
      expect(reloadFiles).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('retries a transient task polling failure without losing the server task', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'transient-poll-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'web.json', status: 'running' }],
      };
      vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue(runningTask);
      const getTask = vi
        .spyOn(chatGptWebApi, 'getAccountInfoRefreshTask')
        .mockRejectedValueOnce(new Error('temporary disconnect'))
        .mockResolvedValueOnce(createCompletedTask());
      const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask');
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles,
        })
      );

      await act(async () => {
        const refresh = result.current.refreshSelected();
        await vi.advanceTimersByTimeAsync(3000);
        await refresh;
      });

      expect(getTask).toHaveBeenCalledTimes(2);
      expect(cancel).not.toHaveBeenCalled();
      expect(reloadFiles).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('cancels a task after ten minutes without processing progress', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'stalled-poll-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'web.json', status: 'running' }],
      };
      vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue(runningTask);
      const getTask = vi
        .spyOn(chatGptWebApi, 'getAccountInfoRefreshTask')
        .mockResolvedValue(runningTask);
      const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
        ...runningTask,
        state: 'canceled',
        processed: 1,
        canceled: 1,
        results: [{ name: 'web.json', status: 'canceled' }],
      });
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        const refresh = result.current.refreshSelected();
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        await refresh;
      });

      expect(getTask).toHaveBeenCalledTimes(400);
      expect(cancel).toHaveBeenCalledWith(runningTask.id);
      expect(result.current.manualRefreshing).toBe(false);
      expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
        'auth_files.chatgpt_web_account_refresh_failed',
        'error'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('reports repeated task polling failures even when best-effort cancellation succeeds', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue(createSnapshot());
      const runningTask: ChatGptWebAccountInfoRefreshTask = {
        id: 'failed-poll-task',
        state: 'running',
        total: 1,
        processed: 0,
        results: [{ name: 'web.json', status: 'running' }],
      };
      vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask').mockResolvedValue(runningTask);
      vi.spyOn(chatGptWebApi, 'getAccountInfoRefreshTask').mockRejectedValue(
        new Error('persistent disconnect')
      );
      const cancel = vi.spyOn(chatGptWebApi, 'cancelAccountInfoRefreshTask').mockResolvedValue({
        ...runningTask,
        state: 'canceled',
        processed: 1,
        canceled: 1,
        results: [{ name: 'web.json', status: 'canceled' }],
      });
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        const refresh = result.current.refreshSelected();
        await vi.advanceTimersByTimeAsync(4500);
        await refresh;
      });

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(result.current.manualLiveMessage).toContain(
        'auth_files.chatgpt_web_account_refresh_failed'
      );
      expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
        expect.stringContaining('auth_files.chatgpt_web_account_refresh_failed'),
        'error'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not count delayed recovery schedules against runnable refresh capacity', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
      ...createSnapshot(),
      config: {
        ...createSnapshot().config,
        'refresh-workers': 1,
        'refresh-queue-size': 0,
      },
      runtime: {
        ...createSnapshot().runtime,
        busy: 0,
        queued: 0,
        scheduled: 1000,
      },
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockResolvedValue(createCompletedTask());
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: ['web.json'],
        reloadFiles: vi.fn().mockResolvedValue(undefined),
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(start).toHaveBeenCalledWith(['web.json'], true, expect.any(Object));
  });

  test('stops waiting when refresh capacity remains saturated', async () => {
    vi.useFakeTimers();
    try {
      const getAccountInfo = vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
        ...createSnapshot(),
        config: {
          ...createSnapshot().config,
          'refresh-workers': 1,
          'refresh-queue-size': 0,
        },
        runtime: {
          ...createSnapshot().runtime,
          busy: 1,
          queued: 0,
          scheduled: 0,
        },
      });
      const start = vi.spyOn(chatGptWebApi, 'startAccountInfoRefreshTask');
      const reloadFiles = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles,
        })
      );

      await act(async () => {
        const refresh = result.current.refreshSelected();
        for (let poll = 0; poll < 20; poll += 1) {
          await vi.advanceTimersByTimeAsync(1500);
        }
        await refresh;
      });

      expect(getAccountInfo).toHaveBeenCalledTimes(20);
      expect(start).not.toHaveBeenCalled();
      expect(reloadFiles).toHaveBeenCalledTimes(1);
      expect(result.current.manualRefreshing).toBe(false);
      expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
        'auth_files.chatgpt_web_account_refresh_failed',
        'error'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('splits manual refresh selections and keeps later batches when list reload fails', async () => {
    const selectedNames = Array.from({ length: 501 }, (_, index) => `web-${index}.json`);
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
      ...createSnapshot(),
      config: {
        ...createSnapshot().config,
        'refresh-workers': 4,
        'refresh-queue-size': 496,
      },
      runtime: {
        ...createSnapshot().runtime,
        busy: 0,
        queued: 0,
        scheduled: 0,
      },
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockResolvedValue(createCompletedTask());
    const reloadFiles = vi.fn().mockRejectedValue(new Error('list reload failed'));

    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames,
        reloadFiles,
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(1, selectedNames.slice(0, 500), true, expect.any(Object));
    expect(start).toHaveBeenNthCalledWith(2, selectedNames.slice(500), true, expect.any(Object));
    expect(reloadFiles).toHaveBeenCalledTimes(1);
  });

  test('retries names rejected by a concurrent backend queue-capacity race', async () => {
    vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
      ...createSnapshot(),
      config: {
        ...createSnapshot().config,
        'refresh-workers': 1,
        'refresh-queue-size': 0,
      },
      runtime: {
        ...createSnapshot().runtime,
        busy: 0,
        queued: 0,
        scheduled: 0,
      },
    });
    const start = vi
      .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
      .mockResolvedValueOnce({
        ...createCompletedTask(),
        state: 'completed_with_errors',
        failed: 1,
        updated: 0,
        results: [{ name: 'web.json', status: 'failed', error: 'refresh_queue_full' }],
      })
      .mockResolvedValueOnce(createCompletedTask());
    const reloadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useChatGptWebAccountInfoRefresh({
        active: true,
        disabled: false,
        visibleScopeKey: '',
        visibleNames: [],
        selectedNames: ['web.json'],
        reloadFiles,
      })
    );

    await act(async () => {
      await result.current.refreshSelected();
    });

    expect(start).toHaveBeenCalledTimes(2);
    expect(reloadFiles).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
      expect.stringContaining('auth_files.chatgpt_web_account_refresh_success'),
      'success'
    );
  });

  test('stops retrying a name after repeated backend queue-capacity races', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(chatGptWebApi, 'getAccountInfo').mockResolvedValue({
        ...createSnapshot(),
        config: {
          ...createSnapshot().config,
          'refresh-workers': 1,
          'refresh-queue-size': 0,
        },
        runtime: {
          ...createSnapshot().runtime,
          busy: 0,
          queued: 0,
          scheduled: 0,
        },
      });
      const queueFullTask: ChatGptWebAccountInfoRefreshTask = {
        ...createCompletedTask(),
        state: 'completed_with_errors',
        failed: 1,
        updated: 0,
        results: [{ name: 'web.json', status: 'failed', error: 'refresh_queue_full' }],
      };
      const start = vi
        .spyOn(chatGptWebApi, 'startAccountInfoRefreshTask')
        .mockResolvedValue(queueFullTask);
      const { result } = renderHook(() =>
        useChatGptWebAccountInfoRefresh({
          active: true,
          disabled: false,
          visibleScopeKey: '',
          visibleNames: [],
          selectedNames: ['web.json'],
          reloadFiles: vi.fn().mockResolvedValue(undefined),
        })
      );

      await act(async () => {
        const refresh = result.current.refreshSelected();
        for (let retry = 0; retry < 3; retry += 1) {
          await vi.advanceTimersByTimeAsync(1500);
        }
        await refresh;
      });

      expect(start).toHaveBeenCalledTimes(4);
      expect(result.current.manualRefreshing).toBe(false);
      expect(useNotificationStore.getState().showNotification).toHaveBeenCalledWith(
        'auth_files.chatgpt_web_account_refresh_failed',
        'error'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('shows exhausted image quota without duplicating the generic model cooldown', () => {
    render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'web.json',
            type: 'chatgpt-web',
            lifecycle_state: 'active',
            account_type: 'oauth',
            plan_type: 'team',
            image_quota_remaining: 0,
            image_quota_reset_at: '2026-07-27T01:00:00Z',
            quota_state: 'exhausted',
            quota_updated_at: '2026-07-27T00:30:00Z',
            quota_stale: true,
            quota_next_refresh_at: '2026-07-27T01:00:30Z',
            cooldown_active: true,
            cooldown_scope: 'model',
            cooldown_until: '2026-07-27T01:00:30Z',
            cooldown_model_count: 1,
          })}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('exhausted')).not.toBeNull();
    expect(screen.getByText('auth_files.chatgpt_web_image_quota_stale')).not.toBeNull();
    expect(screen.getAllByText('team').length).toBeGreaterThan(0);
    expect(screen.getAllByText('oauth').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('codex_quota.plan_team')).toBeNull();
    expect(screen.queryByText(/auth_files\.cooldown_models_until/)).toBeNull();
    expect(screen.queryByText(/auth_files\.cooldown_auth_until/)).toBeNull();
    expect(screen.getAllByText('active').length).toBeGreaterThan(0);
  });

  test('ignores an auth-file response from an older connection generation', async () => {
    const oldConnection = {
      apiBase: 'https://old.example/v0/management',
      managementKey: 'old-secret',
      timeout: 30_000,
    };
    const currentConnection = {
      apiBase: 'https://current.example/v0/management',
      managementKey: 'current-secret',
      timeout: 30_000,
    };
    vi.spyOn(apiClient, 'captureConnection')
      .mockReturnValueOnce(oldConnection)
      .mockReturnValueOnce(currentConnection);
    type AuthFilesResponse = Awaited<ReturnType<typeof authFilesApi.list>>;
    let resolveOld!: (value: AuthFilesResponse) => void;
    let resolveCurrent!: (value: AuthFilesResponse) => void;
    const oldResponse = new Promise<AuthFilesResponse>((resolve) => {
      resolveOld = resolve;
    });
    const currentResponse = new Promise<AuthFilesResponse>((resolve) => {
      resolveCurrent = resolve;
    });
    const list = vi
      .spyOn(authFilesApi, 'list')
      .mockReturnValueOnce(oldResponse)
      .mockReturnValueOnce(currentResponse);
    const refreshKeyStats = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ connectionGenerationKey }) =>
        useAuthFilesData({
          refreshKeyStats,
          active: false,
          connectionGenerationKey,
        }),
      { initialProps: { connectionGenerationKey: 'old-server' } }
    );
    let oldRequest = Promise.resolve();
    let currentRequest = Promise.resolve();

    act(() => {
      oldRequest = result.current.loadFiles({ background: true });
    });
    rerender({ connectionGenerationKey: 'current-server' });
    act(() => {
      currentRequest = result.current.loadFiles({ background: true });
    });

    await act(async () => {
      resolveCurrent({ files: [{ name: 'current.json', type: 'chatgpt-web' }] });
      await currentRequest;
    });
    await act(async () => {
      resolveOld({ files: [{ name: 'old.json', type: 'chatgpt-web' }] });
      await oldRequest;
    });

    expect(result.current.files.map((file) => file.name)).toEqual(['current.json']);
    expect(list).toHaveBeenNthCalledWith(1, oldConnection, expect.any(AbortSignal));
    expect(list).toHaveBeenNthCalledWith(2, currentConnection, expect.any(AbortSignal));
    expect(list.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(list.mock.calls[1]?.[1]?.aborted).toBe(false);
  });

  test('infers the standard image model without duplicating image cooldown', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          account_type: 'oauth',
          plan_type: 'team',
          quota_state: 'exhausted',
          image_quota_remaining: 7,
          quota_stale: true,
          image_quota_reset_at: '2026-07-27T01:00:00Z',
          quota_next_refresh_at: '2026-07-27T01:00:30Z',
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            cooldown_active: true,
            scope: 'model',
            until: '2026-07-27T01:00:30Z',
          },
          { id: 'gpt-5.6', type: 'text' },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.getByText('auth_files.chatgpt_web_image_quota_model_badge')).not.toBeNull();
    expect(screen.queryByText('auth_files.models_cooldown_model_badge')).toBeNull();
    expect(screen.getByText('gpt-5.6')).not.toBeNull();
    expect(screen.getAllByText('auth_files.chatgpt_web_image_quota_model_badge')).toHaveLength(1);
    expect(screen.getByText(/auth_files\.chatgpt_web_plan_type/).textContent).toContain('team');
    expect(screen.getByText(/auth_files\.chatgpt_web_image_quota_remaining/).textContent).toContain(
      '7'
    );
    expect(screen.getByText('auth_files.chatgpt_web_image_quota_stale')).not.toBeNull();
  });

  test('does not display an authentication type as a missing plan type', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{ name: 'web.json', type: 'chatgpt-web', account_type: 'oauth' }}
        loading={false}
        error={null}
        models={[{ id: 'gpt-5.6', type: 'text' }]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_plan_type/)).toBeNull();
  });

  test('shows image quota cooling for a prefixed image model', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{ name: 'web.json', type: 'chatgpt-web', quota_state: 'exhausted' }}
        loading={false}
        error={null}
        models={[
          {
            id: 'team/gpt-image-2',
            type: 'image',
            quota_state: 'exhausted',
            image_quota_reset_at: '2026-07-27T01:00:00Z',
          },
          { id: 'team/gpt-5.6', type: 'text' },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.getAllByText('auth_files.chatgpt_web_image_quota_model_badge')).toHaveLength(1);
    expect(screen.getByText('team/gpt-image-2')).not.toBeNull();
  });

  test('uses an explicit backend image-model flag for nonstandard model IDs', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{ name: 'web.json', type: 'chatgpt-web', quota_state: 'exhausted' }}
        loading={false}
        error={null}
        models={[
          {
            id: 'custom-image-model',
            image_quota_model: true,
            quota_state: 'exhausted',
            cooldown_active: true,
            scope: 'model',
            until: '2026-07-27T01:00:00Z',
          },
          {
            id: 'text-model',
            quota_state: 'exhausted',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.getAllByText('auth_files.chatgpt_web_image_quota_model_badge')).toHaveLength(1);
    expect(screen.queryByText('auth_files.models_cooldown_model_badge')).toBeNull();
    expect(screen.getByText('custom-image-model')).not.toBeNull();
    expect(screen.getByText('text-model')).not.toBeNull();
  });

  test('prefers a newer auth-file quota snapshot over stale model data', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'available',
          image_quota_remaining: 5,
          quota_stale: false,
          cooldown_active: false,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'exhausted',
            image_quota_remaining: 0,
            quota_stale: true,
            cooldown_active: true,
            scope: 'model',
            until: '2099-01-01T01:00:00Z',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.getByText(/auth_files\.chatgpt_web_image_quota_remaining/).textContent).toContain(
      '5'
    );
    expect(screen.queryByText('auth_files.chatgpt_web_image_quota_model_badge')).toBeNull();
    expect(screen.queryByText('auth_files.chatgpt_web_image_quota_stale')).toBeNull();
  });

  test('keeps a newer explicit unknown quota instead of restoring a stale model count', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'unknown',
          image_quota_remaining: null,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'available',
            image_quota_remaining: 7,
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_image_quota_remaining/)).toBeNull();
  });

  test('keeps a newer omitted unknown quota instead of restoring a stale model count', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'unknown',
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'available',
            image_quota_remaining: 7,
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_image_quota_remaining/)).toBeNull();
  });

  test('treats a newer auth-file snapshot with no quota fields as unknown', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'available',
            image_quota_remaining: 7,
            image_quota_reset_at: '2099-01-01T01:00:00Z',
            quota_stale: true,
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_image_quota_remaining/)).toBeNull();
    expect(screen.queryByText('auth_files.chatgpt_web_image_quota_stale')).toBeNull();
  });

  test('keeps an explicit unknown model quota instead of restoring a stale file count', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'available',
          image_quota_remaining: 7,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'unknown',
            image_quota_remaining: null,
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_image_quota_remaining/)).toBeNull();
  });

  test('keeps an omitted field in a newer model quota snapshot instead of mixing old file data', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'available',
          image_quota_remaining: 7,
          image_quota_reset_at: '2099-01-01T01:00:00Z',
          quota_stale: true,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'unknown',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText(/auth_files\.chatgpt_web_image_quota_remaining/)).toBeNull();
    expect(screen.queryByText('auth_files.chatgpt_web_image_quota_stale')).toBeNull();
  });

  test('does not project an aggregated model cooldown onto the image model', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'available',
          image_quota_remaining: 5,
          cooldown_active: true,
          cooldown_scope: 'model',
          cooldown_until: '2099-01-01T01:00:00Z',
          cooldown_model_count: 1,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'available',
            image_quota_remaining: 5,
            cooldown_active: false,
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText('auth_files.models_cooldown_model_badge')).toBeNull();
    expect(screen.queryByText('auth_files.chatgpt_web_image_quota_model_badge')).toBeNull();
  });

  test('uses a newer explicit no-cooldown snapshot over stale model cooldown data', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'available',
          image_quota_remaining: 5,
          cooldown_active: false,
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            quota_state: 'available',
            image_quota_remaining: 5,
            cooldown_active: true,
            scope: 'model',
            until: '2099-01-01T01:00:00Z',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        fileLoadedAtMs={Date.parse('2026-07-27T00:05:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.queryByText('auth_files.models_cooldown_model_badge')).toBeNull();
    expect(screen.queryByText('auth_files.models_cooldown_auth_badge')).toBeNull();
  });

  test('shows auth-wide cooldown alongside an exhausted image quota in the model modal', async () => {
    render(
      <AuthFileModelsModal
        open
        fileName="web.json"
        fileType="chatgpt-web"
        file={{
          name: 'web.json',
          type: 'chatgpt-web',
          quota_state: 'exhausted',
          image_quota_reset_at: '2099-01-01T00:00:00Z',
        }}
        loading={false}
        error={null}
        models={[
          {
            id: 'gpt-image-2',
            type: 'image',
            image_quota_model: true,
            cooldown_active: true,
            scope: 'auth',
            until: '2099-01-01T01:00:00Z',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );
    await flushModalOpen();

    expect(screen.getByText('auth_files.models_cooldown_auth_badge')).not.toBeNull();
    expect(screen.getByText('auth_files.chatgpt_web_image_quota_model_badge')).not.toBeNull();
    const recheck = screen.getByText(/auth_files\.chatgpt_web_image_quota_recheck_at/);
    expect(recheck.textContent).toContain(formatDateTime(new Date('2099-01-01T00:00:00Z')));
    expect(recheck.textContent).not.toContain(formatDateTime(new Date('2099-01-01T01:00:00Z')));
  });

  test.each([
    {
      name: 'inactive cooldown',
      cooldownActive: false,
      cooldownUntil: '2099-01-01T01:00:00Z',
    },
    {
      name: 'expired cooldown',
      cooldownActive: true,
      cooldownUntil: '2020-01-01T01:00:00Z',
    },
  ])(
    'falls back to the next quota refresh for an $name',
    async ({ cooldownActive, cooldownUntil }) => {
      const nextRefreshAt = '2099-01-02T01:00:00Z';
      render(
        <AuthFileModelsModal
          open
          fileName="web.json"
          fileType="chatgpt-web"
          file={{
            name: 'web.json',
            type: 'chatgpt-web',
            quota_state: 'exhausted',
            image_quota_reset_at: '2099-01-03T01:00:00Z',
            quota_next_refresh_at: nextRefreshAt,
          }}
          loading={false}
          error={null}
          models={[
            {
              id: 'gpt-image-2',
              cooldown_active: cooldownActive,
              scope: 'model',
              until: cooldownUntil,
            },
          ]}
          loadedAtMs={Date.parse('2026-07-27T00:00:00Z')}
          excluded={{}}
          onClose={vi.fn()}
          onCopyText={vi.fn()}
        />
      );
      await flushModalOpen();

      const expectedTime = formatDateTime(new Date(nextRefreshAt));
      const ignoredTime = formatDateTime(new Date(cooldownUntil));
      const recheck = screen.getByText(/auth_files\.chatgpt_web_image_quota_recheck_at/);
      expect(recheck.textContent).toContain(expectedTime);
      expect(recheck.textContent).not.toContain(ignoredTime);
    }
  );
});
