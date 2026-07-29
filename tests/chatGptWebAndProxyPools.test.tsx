import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { ChatGptWebSentinelPanel } from '@/features/chatgptWeb/components/ChatGptWebSentinelPanel';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';
import { ChatGptWebPage } from '@/pages/ChatGptWebPage';
import { apiClient } from '@/services/api/client';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { proxyPoolsApi } from '@/services/api/proxyPools';
import { useAuthStore, useNotificationStore } from '@/stores';
import type {
  AuthFileItem,
  ChatGptWebLoginTask,
  ChatGptWebMutationTask,
  ChatGptWebSentinelSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import { normalizeModelList } from '@/utils/models';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const createCardProps = (file: AuthFileItem): AuthFileCardProps => ({
  file,
  cooldownAsOfMs: Date.parse('2026-07-18T00:00:00Z'),
  compact: false,
  selected: false,
  resolvedTheme: 'light',
  disableControls: false,
  deleting: null,
  statusUpdating: {},
  xaiFieldsUpdating: {},
  chatGptWebReloginUpdating: {},
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
  onChatGptWebRelogin: vi.fn(),
  onToggleSelect: vi.fn(),
});

const createLoginTask = (): ChatGptWebLoginTask => ({
  id: 'task-1',
  state: 'queued',
  created_at: '2026-07-18T00:00:00Z',
  total: 1,
  processed: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
  results: [],
});

const createMutationTask = (
  overrides: Partial<ChatGptWebMutationTask> = {}
): ChatGptWebMutationTask => ({
  id: 'mutation-1',
  kind: 'import',
  state: 'queued',
  created_at: '2026-07-18T00:00:00Z',
  total: 2,
  processed: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
  results: [
    { file: 'first.json', status: 'queued' },
    { file: 'second.json', status: 'queued' },
  ],
  ...overrides,
});

const createSentinelSnapshot = (
  overrides: Partial<ChatGptWebSentinelSnapshot> = {}
): ChatGptWebSentinelSnapshot => ({
  'sdk-runtime-enabled': true,
  'sdk-workers': 0,
  'sdk-queue-size': 32,
  'sdk-cache-versions': 3,
  initialized: false,
  available: false,
  worker_limit: 4,
  busy: 0,
  queued: 0,
  source_pending: 0,
  source_waiters: 0,
  bytecode_waiters: 0,
  observer_sessions: 0,
  sdk_version: '',
  sdk_sha256: '',
  source_cache_entries: 0,
  bytecode_cache_entries: 0,
  fallback_count: 0,
  last_error: '',
  ...overrides,
});

describe('ChatGPT Web management compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({ connectionStatus: 'connected' });
    useNotificationStore.setState({ showNotification: vi.fn() });
    vi.spyOn(chatGptWebApi, 'getSentinel').mockResolvedValue(createSentinelSnapshot());
  });

  test('uses the dedicated Sentinel GET, PUT, and PATCH endpoints', async () => {
    vi.mocked(chatGptWebApi.getSentinel).mockRestore();
    const snapshot = createSentinelSnapshot();
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(snapshot);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'ok' });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });

    await expect(chatGptWebApi.getSentinel()).resolves.toEqual(snapshot);
    await chatGptWebApi.putSentinel({
      'sdk-runtime-enabled': true,
      'sdk-workers': 2,
      'sdk-queue-size': 64,
      'sdk-cache-versions': 4,
    });
    await chatGptWebApi.patchSentinel({ 'sdk-workers': 3 });

    expect(get).toHaveBeenCalledWith('/chatgpt-web/sentinel');
    expect(put).toHaveBeenCalledWith('/chatgpt-web/sentinel', {
      'sdk-runtime-enabled': true,
      'sdk-workers': 2,
      'sdk-queue-size': 64,
      'sdk-cache-versions': 4,
    });
    expect(patch).toHaveBeenCalledWith('/chatgpt-web/sentinel', { 'sdk-workers': 3 });
  });

  test('defers the Sentinel status request until its config page becomes active', async () => {
    const getSentinel = vi.mocked(chatGptWebApi.getSentinel);
    const view = render(<ChatGptWebSentinelPanel active={false} />);

    expect(getSentinel).not.toHaveBeenCalled();

    view.rerender(<ChatGptWebSentinelPanel active />);
    await waitFor(() => expect(getSentinel).toHaveBeenCalledTimes(1));
  });

  test('loads Sentinel lazily, disables settings with the switch off, and refetches after PATCH', async () => {
    const getSentinel = vi.mocked(chatGptWebApi.getSentinel);
    getSentinel.mockReset();
    const initialSnapshot = Object.assign(
      createSentinelSnapshot({
        'sdk-runtime-enabled': false,
        last_error: 'sentinel_sdk_busy',
      }),
      {
        sdk_source: 'SENTINEL_SOURCE_MUST_NOT_RENDER',
        challenge: 'SENTINEL_CHALLENGE_MUST_NOT_RENDER',
      }
    );
    getSentinel.mockResolvedValueOnce(initialSnapshot).mockResolvedValueOnce(
      createSentinelSnapshot({
        'sdk-runtime-enabled': true,
        'sdk-workers': 4,
        initialized: true,
        available: true,
        busy: 2,
        queued: 3,
        sdk_version: 'sentinel-v1',
        sdk_sha256: 'safe-sha256',
        fallback_count: 9,
      })
    );
    const patchSentinel = vi
      .spyOn(chatGptWebApi, 'patchSentinel')
      .mockResolvedValue({ status: 'ok' });

    render(<ChatGptWebSentinelPanel />);

    await waitFor(() => expect(getSentinel).toHaveBeenCalledTimes(1));
    const runtimeSwitch = screen.getByRole('checkbox', {
      name: 'chatgpt_web.sentinel.runtime_enabled',
    }) as HTMLInputElement;
    const workers = document.getElementById('chatgpt-web-sentinel-workers') as HTMLInputElement;
    const queueSize = document.getElementById(
      'chatgpt-web-sentinel-queue-size'
    ) as HTMLInputElement;
    const cacheVersions = document.getElementById(
      'chatgpt-web-sentinel-cache-versions'
    ) as HTMLInputElement;

    expect(runtimeSwitch.checked).toBe(false);
    expect(workers.disabled).toBe(true);
    expect(queueSize.disabled).toBe(true);
    expect(cacheVersions.disabled).toBe(true);
    expect(screen.getByText('chatgpt_web.sentinel.automatic')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.sentinel.initialized_lazy')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.errors.sentinel_sdk_busy')).not.toBeNull();
    expect(document.body.textContent).not.toContain('SENTINEL_SOURCE_MUST_NOT_RENDER');
    expect(document.body.textContent).not.toContain('SENTINEL_CHALLENGE_MUST_NOT_RENDER');

    fireEvent.click(runtimeSwitch);
    expect(workers.disabled).toBe(false);
    fireEvent.change(workers, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(patchSentinel).toHaveBeenCalledWith({
        'sdk-runtime-enabled': true,
        'sdk-workers': 4,
      })
    );
    await waitFor(() => expect(getSentinel).toHaveBeenCalledTimes(2));
    expect(screen.getByText('sentinel-v1')).not.toBeNull();
    expect(screen.getByText('safe-sha256')).not.toBeNull();
    expect(screen.getByText('2 / 4')).not.toBeNull();
  });

  test('does not load or render Sentinel settings on the account-login task page', () => {
    const getSentinel = vi.mocked(chatGptWebApi.getSentinel);

    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );

    expect(getSentinel).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('checkbox', { name: 'chatgpt_web.sentinel.runtime_enabled' })
    ).toBeNull();
  });

  test('renders Sentinel busy as a solver-pool error without a lifecycle failure', async () => {
    vi.spyOn(chatGptWebApi, 'startLoginTaskText').mockResolvedValue({
      ...createLoginTask(),
      state: 'completed_with_errors',
      processed: 1,
      failed: 1,
      results: [
        {
          line: 1,
          email: 'busy@example.com',
          status: 'failed',
          lifecycle_state: 'dead',
          error_category: 'sentinel_sdk_busy',
          error: 'ChatGPT Web Sentinel SDK is temporarily unavailable',
          http_status: 503,
        },
      ],
    });

    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'chatgpt_web.manual_input_label' }), {
      target: { value: 'busy@example.com---password---' },
    });
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web.start_task/ }));

    await waitFor(() =>
      expect(screen.getByText(/chatgpt_web\.errors\.sentinel_sdk_busy/)).not.toBeNull()
    );
    expect(screen.queryByText('dead')).toBeNull();
  });

  test('recognizes the nested 503 Sentinel busy response without exposing its raw message', () => {
    const error = Object.assign(new Error('temporary runtime failure'), {
      status: 503,
      data: {
        error: {
          code: 'sentinel_sdk_busy',
          message: 'ChatGPT Web Sentinel SDK is temporarily unavailable',
        },
      },
    });

    expect(getChatGptWebErrorMessage(error, (key) => key)).toBe(
      'chatgpt_web.errors.sentinel_sdk_busy'
    );
  });

  test('uploads the selected file directly without reading or converting its contents', async () => {
    const postForm = vi.spyOn(apiClient, 'postForm').mockResolvedValue(createLoginTask());
    const file = new File(['account@example.com---secret---totp'], 'accounts.txt', {
      type: 'text/plain',
    });
    const textSpy = vi.spyOn(file, 'text');

    await chatGptWebApi.startLoginTask(file);

    expect(textSpy).not.toHaveBeenCalled();
    expect(postForm).toHaveBeenCalledTimes(1);
    const [path, body] = postForm.mock.calls[0];
    expect(path).toBe('/chatgpt-web/login-tasks');
    expect(body).toBeInstanceOf(FormData);
    const uploadedFile = (body as FormData).get('file');
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile).toMatchObject({
      name: file.name,
      size: file.size,
      type: file.type,
    });
  });

  test('submits pasted account text as an unmodified text/plain body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createLoginTask());
    const accountText =
      'first@example.com---password---JBSWY3DPEHPK3PXP\nsecond@example.com---password---';

    await chatGptWebApi.startLoginTaskText(accountText);

    expect(post).toHaveBeenCalledWith('/chatgpt-web/login-tasks', accountText, {
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });
  });

  test('uploads multiple Web JSON files and uses the dedicated task endpoints', async () => {
    const task = createMutationTask();
    const postForm = vi.spyOn(apiClient, 'postForm').mockResolvedValue(task);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(task);
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue(task);
    const files = [
      new File(['{}'], 'first.json', { type: 'application/json' }),
      new File(['{}'], 'second.json', { type: 'application/json' }),
    ];

    await chatGptWebApi.startImportTask(files);
    await chatGptWebApi.getImportTask('task id');
    await chatGptWebApi.cancelImportTask('task id');

    expect(postForm).toHaveBeenCalledTimes(1);
    const [path, body] = postForm.mock.calls[0];
    expect(path).toBe('/chatgpt-web/import-tasks');
    expect((body as FormData).getAll('files')).toHaveLength(2);
    expect((body as FormData).getAll('files').map((entry) => (entry as File).name)).toEqual([
      'first.json',
      'second.json',
    ]);
    expect(get).toHaveBeenCalledWith('/chatgpt-web/import-tasks/task%20id');
    expect(remove).toHaveBeenCalledWith('/chatgpt-web/import-tasks/task%20id');
  });

  test('starts Codex conversion as a validated copy task', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createMutationTask({ kind: 'conversion' }));

    await chatGptWebApi.startConversionTask(['a.json', 'b.json']);

    expect(post).toHaveBeenCalledWith('/chatgpt-web/conversion-tasks', {
      names: ['a.json', 'b.json'],
      target_provider: 'chatgpt-web',
      mode: 'copy',
      validate: true,
    });
  });

  test('defaults to manual input and retains the existing file upload mode', () => {
    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );

    expect(
      screen
        .getByRole('button', { name: 'chatgpt_web.input_modes.manual' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('textbox', { name: 'chatgpt_web.manual_input_label' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'chatgpt_web.input_modes.file' }));

    expect(screen.queryByRole('textbox', { name: 'chatgpt_web.manual_input_label' })).toBeNull();
    expect(screen.getByText('chatgpt_web.choose_file')).not.toBeNull();
  });

  test('switches to multi-file Web JSON import and clears file references after creation', async () => {
    const startImportTask = vi
      .spyOn(chatGptWebApi, 'startImportTask')
      .mockResolvedValue(createMutationTask());
    const files = [
      new File(['{"access_token":"secret-a"}'], 'first.json', {
        type: 'application/json',
      }),
      new File(['{"cookies":["secret-b"]}'], 'second.json', {
        type: 'application/json',
      }),
    ];
    const view = render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.page_modes\.import\.label/ }));
    const input = view.container.querySelector('input[type="file"][multiple]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files } });
    expect(screen.getByText('first.json')).not.toBeNull();
    expect(screen.getByText('second.json')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.start_import_task/ }));

    await waitFor(() => expect(startImportTask).toHaveBeenCalledWith(files));
    await waitFor(() => expect(screen.queryByText('chatgpt_web.import_files_selected')).toBeNull());
    expect(screen.getByText('chatgpt_web.choose_json_files')).not.toBeNull();
    expect(document.body.textContent).not.toContain('secret-a');
    expect(document.body.textContent).not.toContain('secret-b');
  });

  test('clears pasted credentials after task creation without writing them to browser storage', async () => {
    const accountText = 'private@example.com---private-password---JBSWY3DPEHPK3PXP';
    const startLoginTaskText = vi
      .spyOn(chatGptWebApi, 'startLoginTaskText')
      .mockResolvedValue(createLoginTask());

    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );

    const input = screen.getByRole('textbox', {
      name: 'chatgpt_web.manual_input_label',
    }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: accountText } });

    const storageBeforeSubmit = [localStorage, sessionStorage]
      .flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) =>
          storage.getItem(storage.key(index) ?? '')
        )
      )
      .join('\n');
    expect(storageBeforeSubmit).not.toContain(accountText);

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web.start_task/ }));

    await waitFor(() => expect(startLoginTaskText).toHaveBeenCalledWith(accountText));
    await waitFor(() => expect(input.value).toBe(''));

    const storageAfterSubmit = [localStorage, sessionStorage]
      .flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) =>
          storage.getItem(storage.key(index) ?? '')
        )
      )
      .join('\n');
    expect(storageAfterSubmit).not.toContain(accountText);
  });

  test('uses the task and relogin management paths', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ id: 'task id' });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ id: 'task id' });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'ok' });

    await chatGptWebApi.getLoginTask('task id');
    await chatGptWebApi.cancelLoginTask('task id');
    await chatGptWebApi.relogin('account name.json');

    expect(get).toHaveBeenCalledWith('/chatgpt-web/login-tasks/task%20id');
    expect(remove).toHaveBeenCalledWith('/chatgpt-web/login-tasks/task%20id');
    expect(post).toHaveBeenCalledWith(
      '/chatgpt-web/auth-files/account%20name.json/relogin',
      undefined,
      { timeout: 120_000 }
    );
  });

  test('renders lifecycle separately from cooldown and exposes all Web credential actions', () => {
    const onRelogin = vi.fn();
    const props = createCardProps({
      name: 'chatgpt-web.json',
      type: 'chatgpt-web',
      lifecycle_state: 'interaction_required',
      lifecycle_reason: 'captcha_required',
      lifecycle_updated_at: '2026-07-18T01:00:00Z',
      token_expires_at: '2026-07-18T02:00:00Z',
      token_expired: true,
      token_refreshable: false,
      cooldown_active: true,
      cooldown_scope: 'auth',
      cooldown_until: '2999-01-01T00:00:00Z',
      proxy_url: 'socks5://user:secret@proxy.example:1080',
      proxy_binding: {
        pool: 'primary',
        entry: 'entry-a',
        ip: '203.0.113.1',
        loc: 'US',
        elapsed_ms: 120,
        healthy: true,
      },
    });

    render(
      <MemoryRouter>
        <AuthFileCard {...props} onChatGptWebRelogin={onRelogin} />
      </MemoryRouter>
    );

    expect(screen.getAllByText('interaction_required').length).toBeGreaterThan(0);
    expect(screen.queryByText('auth_files.cooldown_auth_until')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'auth_files.batch_select_all' })).not.toBeNull();
    expect(screen.getByTitle('auth_files.models_button')).not.toBeNull();
    expect(screen.getByTitle('auth_files.download_button')).not.toBeNull();
    expect(screen.getByTitle('auth_files.prefix_proxy_button')).not.toBeNull();
    expect(screen.getByTitle('auth_files.delete_button')).not.toBeNull();
    expect(screen.getByLabelText('auth_files.status_toggle_label')).not.toBeNull();
    expect(screen.queryByText('socks5://user:secret@proxy.example:1080')).toBeNull();

    const reloginButton = screen.getByRole('button', {
      name: 'auth_files.chatgpt_web_relogin',
    });
    expect(reloginButton.textContent).toBe('');

    fireEvent.click(screen.getByRole('checkbox', { name: 'auth_files.batch_select_all' }));
    fireEvent.click(screen.getByTitle('auth_files.models_button'));
    fireEvent.click(screen.getByTitle('auth_files.download_button'));
    fireEvent.click(screen.getByTitle('auth_files.prefix_proxy_button'));
    fireEvent.click(reloginButton);
    fireEvent.click(screen.getByTitle('auth_files.delete_button'));

    expect(props.onToggleSelect).toHaveBeenCalledWith('chatgpt-web.json');
    expect(props.onShowModels).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chatgpt-web.json' })
    );
    expect(props.onDownload).toHaveBeenCalledWith('chatgpt-web.json');
    expect(props.onOpenPrefixProxyEditor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chatgpt-web.json' })
    );
    expect(onRelogin).toHaveBeenCalledWith(expect.objectContaining({ name: 'chatgpt-web.json' }));
    expect(props.onDelete).toHaveBeenCalledWith('chatgpt-web.json');
  });

  test('distinguishes token-only and missing-source Web credentials from cooldown', () => {
    const view = render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'token-only.json',
            type: 'chatgpt-web',
            lifecycle_state: 'active',
            credential_mode: 'token_only',
            refresh_strategy: 'token_only',
            token_only: true,
            cooldown_active: true,
            cooldown_until: '2999-01-01T00:00:00Z',
          })}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('auth_files.chatgpt_web_token_only_state').length).toBeGreaterThan(
      0
    );
    expect(screen.getByText('auth_files.chatgpt_web_token_only_hint')).not.toBeNull();
    expect(screen.queryByText('auth_files.cooldown_models_until')).toBeNull();

    view.rerender(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'missing-source.json',
            type: 'chatgpt-web',
            lifecycle_state: 'active',
            credential_mode: 'linked_codex',
            refresh_strategy: 'codex_source',
            source_auth_id: 'codex-source.json',
            source_missing: true,
          })}
        />
      </MemoryRouter>
    );

    expect(
      screen.getAllByText('auth_files.chatgpt_web_source_missing_state').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('auth_files.chatgpt_web_source_missing_hint')).not.toBeNull();
    expect(screen.getByText('codex-source.json')).not.toBeNull();
  });

  test('keeps critical Web lifecycle states above credential mode hints', () => {
    render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'dead-token-only.json',
            type: 'chatgpt-web',
            lifecycle_state: 'dead',
            credential_mode: 'token_only',
            refresh_strategy: 'token_only',
            token_only: true,
          })}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('dead').length).toBeGreaterThan(0);
    expect(screen.queryByText('auth_files.chatgpt_web_token_only_state')).toBeNull();
    expect(screen.getByText('auth_files.chatgpt_web_token_only_hint')).not.toBeNull();
  });

  test('shows restore instead of the normal enable switch for a retained Codex source', () => {
    const onRestore = vi.fn();
    render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'codex-source.json',
            type: 'codex',
            disabled: true,
            deletion_state: 'retained_for_dependents',
            retained_for_dependents: true,
            dependent_count: 2,
            dependent_names: ['web-a.json', 'web-b.json'],
          })}
          onRestore={onRestore}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('auth_files.retained_codex_notice')).not.toBeNull();
    expect(screen.queryByLabelText('auth_files.status_toggle_label')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /auth_files\.retained_codex_restore/ }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ name: 'codex-source.json' }));
  });

  test('reads and writes chatgpt-web.auto-relogin through the existing YAML pipeline', () => {
    const initialYaml = 'chatgpt-web:\n  auto-relogin: false\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebAutoRelogin).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebAutoRelogin: true }));

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': { 'auto-relogin': true },
    });
  });

  test('reads and writes ChatGPT Web dead credential cleanup priorities', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: false\n  auto-delete-dead-priorities: []\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebAutoDeleteDeadAuths).toBe(false);
    expect(result.current.visualValues.chatgptWebAutoDeleteDeadPriorities).toEqual([]);
    act(() =>
      result.current.setVisualValues({
        chatgptWebAutoDeleteDeadAuths: true,
        chatgptWebAutoDeleteDeadPriorities: ['1', '0', '-1'],
      })
    );

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-auths': true,
        'auto-delete-dead-priorities': [1, 0, -1],
      },
    });
  });

  test('normalizes a scalar dead credential cleanup priority without broadening deletion', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: true\n  auto-delete-dead-priorities: -1\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    expect(result.current.visualValues.chatgptWebAutoDeleteDeadPriorities).toEqual(['-1']);
    expect(
      result.current.visualValidationErrors.chatgptWebAutoDeleteDeadPriorities
    ).toBeUndefined();
    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-priorities': [-1],
      },
    });
  });

  test('does not enable dead credential cleanup for a string false value', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: "false"\n  auto-delete-dead-priorities: []\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    expect(result.current.visualValues.chatgptWebAutoDeleteDeadAuths).toBe(false);
    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-auths': false,
        'auto-delete-dead-priorities': [],
      },
    });
  });

  test('rejects unsafe dead credential cleanup priorities instead of saving all priorities', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: true\n  auto-delete-dead-priorities: [0]\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    act(() =>
      result.current.setVisualValues({
        chatgptWebAutoDeleteDeadAuths: false,
        chatgptWebAutoDeleteDeadPriorities: ['9007199254740993'],
      })
    );

    expect(result.current.visualValidationErrors.chatgptWebAutoDeleteDeadPriorities).toBe(
      'integer_list'
    );
    expect(result.current.visualDirtyFields).toEqual(
      expect.arrayContaining([
        'chatgptWebAutoDeleteDeadAuths',
        'chatgptWebAutoDeleteDeadPriorities',
      ])
    );
    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-auths': true,
        'auto-delete-dead-priorities': [0],
      },
    });
  });

  test('preserves invalid YAML priority items instead of broadening cleanup', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: true\n  auto-delete-dead-priorities: [null]\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    expect(result.current.visualValues.chatgptWebAutoDeleteDeadPriorities).toEqual(['']);
    expect(result.current.visualValidationErrors.chatgptWebAutoDeleteDeadPriorities).toBe(
      'integer_list'
    );
    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-auths': true,
        'auto-delete-dead-priorities': [null],
      },
    });
  });

  test('preserves a null priority value instead of broadening cleanup', () => {
    const initialYaml =
      'chatgpt-web:\n  auto-delete-dead-auths: true\n  auto-delete-dead-priorities: null\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    expect(result.current.visualValues.chatgptWebAutoDeleteDeadPriorities).toEqual(['']);
    expect(result.current.visualValidationErrors.chatgptWebAutoDeleteDeadPriorities).toBe(
      'integer_list'
    );
    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'auto-delete-dead-auths': true,
        'auto-delete-dead-priorities': null,
      },
    });
  });

  test('defines dead credential cleanup labels in every locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const labels = locale.config_management.settings_center.chatgpt_web;
      expect(labels.auto_delete_dead_auths).toBeTruthy();
      expect(labels.auto_delete_dead_auths_description).toBeTruthy();
      expect(labels.auto_delete_dead_priorities).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_description).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_placeholder).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_empty).toBeTruthy();
    }
  });

  test('reads and writes ChatGPT Web image compatibility settings', () => {
    const initialYaml =
      'images:\n  chatgpt-web:\n    upstream-model: gpt-5-5-custom\n    ignore-unsupported-params: false\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebImageUpstreamModel).toBe('gpt-5-5-custom');
    expect(result.current.visualValues.chatgptWebIgnoreUnsupportedImageParams).toBe(false);
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageUpstreamModel: 'gpt-5-5',
        chatgptWebIgnoreUnsupportedImageParams: true,
      })
    );

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      images: {
        'chatgpt-web': {
          'upstream-model': 'gpt-5-5',
          'ignore-unsupported-params': true,
        },
      },
    });
  });

  test('deduplicates the same image model registered by Codex and ChatGPT Web', () => {
    const models = normalizeModelList(
      [
        { id: 'gpt-image-2', owned_by: 'codex' },
        { id: 'GPT-IMAGE-2', owned_by: 'chatgpt-web' },
        { id: 'gpt-5.4', owned_by: 'codex' },
      ],
      { dedupe: true }
    );

    expect(models.map((model) => model.name)).toEqual(['gpt-image-2', 'gpt-5.4']);
  });
});

describe('structured proxy management API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('preserves masked pool values and submits ordered rules unchanged', async () => {
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({
        'proxy-pools': [
          {
            name: 'primary',
            'spread-bindings': true,
            entries: [{ id: 'a', 'url-template': 'socks5://user:********@host:1080' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        'proxy-rules': [
          { name: 'chatgpt', pool: 'primary', providers: ['chatgpt-web'], priorities: [4] },
        ],
      });

    const pools = await proxyPoolsApi.getPools();
    const rules = await proxyPoolsApi.getRules();

    expect(pools[0].entries[0]['url-template']).toContain('********');
    expect(pools[0]['spread-bindings']).toBe(true);
    expect(rules[0]).toMatchObject({ providers: ['chatgpt-web'], priorities: [4] });

    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'ok' });
    await proxyPoolsApi.saveRules(rules);
    expect(put).toHaveBeenCalledWith('/proxy-rules', { value: rules });
  });

  test('submits selected bindings in one rebind request', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      results: [{ auth_id: 'auth-a', updated: true }],
    });

    await expect(proxyPoolsApi.rebind({ auth_ids: ['auth-a', 'auth-b'] })).resolves.toEqual([
      { auth_id: 'auth-a', updated: true },
    ]);
    expect(post).toHaveBeenCalledWith('/proxy-bindings/rebind', {
      auth_ids: ['auth-a', 'auth-b'],
    });
  });

  test('checks all bound nodes with a bounded unbound-node sample', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ results: [] });

    await proxyPoolsApi.checkPool('residential pool', 25);

    expect(post).toHaveBeenCalledWith('/proxy-pools/residential%20pool/check', { sample: 25 });
  });
});
