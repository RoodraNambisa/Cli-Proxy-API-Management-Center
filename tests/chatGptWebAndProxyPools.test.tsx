import { createRef } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import {
  ChatGptWebLoginProxyPanel,
  type ChatGptWebLoginProxyPanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebLoginProxyPanel';
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
  ChatGptWebLoginProxyConfig,
  ChatGptWebLoginTask,
  ChatGptWebMutationTask,
  ChatGptWebSentinelSnapshot,
} from '@/types';
import {
  getChatGptWebErrorDiagnosticMessages,
  getChatGptWebErrorMessage,
} from '@/utils/chatgptWeb';
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

const createLoginProxyConfig = (
  overrides: Partial<ChatGptWebLoginProxyConfig> = {}
): ChatGptWebLoginProxyConfig => ({
  enabled: false,
  'url-template': '',
  'placeholder-charset': '',
  'rotate-on-retry': true,
  'request-attempts': 3,
  'flow-attempts': 2,
  'retry-delay-milliseconds': 800,
  'acquisition-timeout-seconds': 90,
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

  test('uses the dedicated login proxy GET, PUT, and PATCH endpoints without masking values', async () => {
    const template = 'http://user-session-{12}:secret@proxy.example:59999';
    const snapshot = createLoginProxyConfig({
      enabled: true,
      'url-template': template,
    });
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(snapshot);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'ok' });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });

    await expect(chatGptWebApi.getLoginProxy()).resolves.toEqual(snapshot);
    await chatGptWebApi.putLoginProxy(snapshot);
    await chatGptWebApi.patchLoginProxy({ 'url-template': template });

    expect(get).toHaveBeenCalledWith('/chatgpt-web/login-proxy');
    expect(put).toHaveBeenCalledWith('/chatgpt-web/login-proxy', snapshot);
    expect(patch).toHaveBeenCalledWith('/chatgpt-web/login-proxy', {
      'url-template': template,
    });
  });

  test('shows, copies, and saves the complete login proxy template without browser persistence', async () => {
    const template = 'http://user-session-{12}:secret@proxy.example:59999';
    const initial = createLoginProxyConfig();
    const updated = createLoginProxyConfig({
      enabled: true,
      'url-template': template,
    });
    const getLoginProxy = vi
      .spyOn(chatGptWebApi, 'getLoginProxy')
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);
    const patchLoginProxy = vi
      .spyOn(chatGptWebApi, 'patchLoginProxy')
      .mockResolvedValue({ status: 'ok' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    localStorage.setItem('config-management:chatgpt-web-login-proxy-expanded', 'true');
    const panelRef = createRef<ChatGptWebLoginProxyPanelHandle>();

    render(<ChatGptWebLoginProxyPanel ref={panelRef} />);

    const templateInput = (await waitFor(() => {
      const input = document.getElementById('chatgpt-web-login-proxy-template');
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).disabled).toBe(false);
      return input;
    })) as HTMLInputElement;
    fireEvent.click(screen.getByRole('checkbox', { name: 'chatgpt_web.login_proxy.enabled' }));
    fireEvent.change(templateInput, { target: { value: template } });
    fireEvent.click(screen.getByRole('button', { name: 'chatgpt_web.login_proxy.copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(template));
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index) ?? '')
      ).join('\n')
    ).not.toContain(template);

    let saved = false;
    await act(async () => {
      saved = (await panelRef.current?.save()) ?? false;
    });

    expect(saved).toBe(true);
    expect(patchLoginProxy).toHaveBeenCalledWith(updated);
    expect(getLoginProxy).toHaveBeenCalledTimes(2);
  });

  test('blocks invalid login proxy templates before sending a management update', async () => {
    vi.spyOn(chatGptWebApi, 'getLoginProxy').mockResolvedValue(
      createLoginProxyConfig({
        enabled: true,
        'url-template': 'http://user-{3}:secret@proxy.example:80',
      })
    );
    const patchLoginProxy = vi
      .spyOn(chatGptWebApi, 'patchLoginProxy')
      .mockResolvedValue({ status: 'ok' });
    localStorage.setItem('config-management:chatgpt-web-login-proxy-expanded', 'true');
    const panelRef = createRef<ChatGptWebLoginProxyPanelHandle>();

    render(<ChatGptWebLoginProxyPanel ref={panelRef} />);

    await waitFor(() =>
      expect(
        (document.getElementById('chatgpt-web-login-proxy-template') as HTMLInputElement | null)
          ?.disabled
      ).toBe(false)
    );
    expect(panelRef.current?.validate()).toBe(true);
    fireEvent.change(document.getElementById('chatgpt-web-login-proxy-template')!, {
      target: { value: 'http://proxy-{3}.example:59999' },
    });

    expect(screen.getByText('chatgpt_web.login_proxy.validation_template_url')).not.toBeNull();
    expect(panelRef.current?.validate()).toBe(false);
    await expect(panelRef.current?.save()).resolves.toBe(false);
    expect(patchLoginProxy).not.toHaveBeenCalled();
  });

  test('shows an upgrade hint when the connected backend lacks login proxy management', async () => {
    vi.spyOn(chatGptWebApi, 'getLoginProxy').mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );

    render(<ChatGptWebLoginProxyPanel />);

    expect(await screen.findByText('chatgpt_web.login_proxy.unsupported')).not.toBeNull();
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
        compatibility_fallback_count: 4,
        sdk_preferred_hit_count: 5,
        session_observer_count: 6,
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

    await waitFor(() => expect(runtimeSwitch.checked).toBe(false));
    expect(workers.disabled).toBe(true);
    expect(queueSize.disabled).toBe(true);
    expect(cacheVersions.disabled).toBe(true);
    expect(screen.getByText('chatgpt_web.sentinel.automatic')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.sentinel.initialized_lazy')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.errors.sentinel_sdk_busy')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.sentinel.status.fallback_count')).not.toBeNull();
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
    expect(
      screen.getByText('chatgpt_web.sentinel.status.compatibility_fallback_count')
    ).not.toBeNull();
    expect(screen.getByText('chatgpt_web.sentinel.status.sdk_preferred_hit_count')).not.toBeNull();
    expect(screen.getByText('chatgpt_web.sentinel.status.session_observer_count')).not.toBeNull();
    expect(screen.queryByText('chatgpt_web.sentinel.status.fallback_count')).toBeNull();
    expect(
      document.querySelector('[data-field="compatibility_fallback_count"] dd')?.textContent
    ).toBe('4');
    expect(document.querySelector('[data-field="sdk_preferred_hit_count"] dd')?.textContent).toBe(
      '5'
    );
    expect(document.querySelector('[data-field="session_observer_count"] dd')?.textContent).toBe(
      '6'
    );
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

  test('renders Cloudflare login diagnostics without exposing the backend error text', async () => {
    vi.spyOn(chatGptWebApi, 'startLoginTaskText').mockResolvedValue({
      ...createLoginTask(),
      state: 'completed_with_errors',
      processed: 1,
      failed: 1,
      results: [
        {
          line: 1,
          email: 'blocked@example.com',
          status: 'failed',
          error_category: 'cloudflare_challenge',
          error: 'RAW_CHALLENGE_RESPONSE_MUST_NOT_RENDER',
          http_status: 403,
          failure_stage: 'authorize',
          attempts: 2,
        },
      ],
    });

    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'chatgpt_web.manual_input_label' }), {
      target: { value: 'blocked@example.com---password---' },
    });
    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web.start_task/ }));

    await waitFor(() =>
      expect(screen.getByText(/chatgpt_web\.errors\.cloudflare_challenge/)).not.toBeNull()
    );
    expect(document.body.textContent).toContain('chatgpt_web.diagnostics_stage');
    expect(document.body.textContent).toContain('chatgpt_web.diagnostics_attempts');
    expect(document.body.textContent).not.toContain('RAW_CHALLENGE_RESPONSE_MUST_NOT_RENDER');
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

  test('renders a specific message when OAuth authorization has no continuation', () => {
    const error = Object.assign(new Error('chatgpt web authentication failed'), {
      data: {
        error_category: 'authorization_completion_required',
        failure_stage: 'password_verify',
        attempts: 1,
      },
    });

    expect(getChatGptWebErrorMessage(error, (key) => key)).toBe(
      'chatgpt_web.errors.authorization_completion_required'
    );
  });

  test('extracts safe stage and attempt diagnostics from nested management errors', () => {
    const messages = getChatGptWebErrorDiagnosticMessages(
      {
        status: 403,
        data: {
          error_category: 'cloudflare_challenge',
          failure_stage: 'authorize',
          attempts: 2,
        },
      },
      (key, options) => {
        if (key === 'chatgpt_web.failure_stages.authorize') return 'OAuth authorize';
        if (key === 'chatgpt_web.diagnostics_stage') return `Stage: ${options?.stage}`;
        if (key === 'chatgpt_web.diagnostics_attempts') {
          return `Attempts: ${options?.count}`;
        }
        return key;
      }
    );

    expect(messages).toEqual(['Stage: OAuth authorize', 'Attempts: 2']);
  });

  test('uploads the selected file directly without reading or converting its contents', async () => {
    const postForm = vi.spyOn(apiClient, 'postForm').mockResolvedValue(createLoginTask());
    const file = new File(['account@example.com---secret---totp'], 'accounts.txt', {
      type: 'text/plain',
    });
    const textSpy = vi.spyOn(file, 'text');

    await chatGptWebApi.startLoginTask(file, 'workspace-login');

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
    expect((body as FormData).get('name')).toBe('workspace-login');
  });

  test('submits pasted account text as an unmodified text/plain body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createLoginTask());
    const accountText =
      'first@example.com---password---JBSWY3DPEHPK3PXP\nsecond@example.com---password---';

    await chatGptWebApi.startLoginTaskText(accountText, 'workspace-login.json');

    expect(post).toHaveBeenCalledWith('/chatgpt-web/login-tasks', accountText, {
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      params: { name: 'workspace-login.json' },
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

    await chatGptWebApi.startImportTask(files, ['workspace-a', 'workspace-b.json']);
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
    expect((body as FormData).getAll('names')).toEqual(['workspace-a', 'workspace-b.json']);
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

  test('validates custom credential names by UTF-8 byte length', () => {
    render(
      <MemoryRouter>
        <ChatGptWebPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'chatgpt_web.manual_input_label' }), {
      target: { value: 'person@example.com---password---' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'chatgpt_web.custom_name_label' }), {
      target: { value: '名'.repeat(84) },
    });

    expect(screen.getByText('chatgpt_web.custom_name_invalid')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: /chatgpt_web\.start_task/ }).hasAttribute('disabled')
    ).toBe(true);
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
    const targetNameInputs = screen.getAllByRole('textbox', {
      name: 'chatgpt_web.custom_name_label',
    });
    fireEvent.change(targetNameInputs[0], { target: { value: 'workspace-a' } });
    fireEvent.change(targetNameInputs[1], { target: { value: 'workspace-b.json' } });

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web\.start_import_task/ }));

    await waitFor(() =>
      expect(startImportTask).toHaveBeenCalledWith(files, ['workspace-a', 'workspace-b.json'])
    );
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
    const targetNameInput = screen.getByRole('textbox', {
      name: 'chatgpt_web.custom_name_label',
    }) as HTMLInputElement;
    fireEvent.change(targetNameInput, { target: { value: 'workspace-login' } });

    const storageBeforeSubmit = [localStorage, sessionStorage]
      .flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) =>
          storage.getItem(storage.key(index) ?? '')
        )
      )
      .join('\n');
    expect(storageBeforeSubmit).not.toContain(accountText);

    fireEvent.click(screen.getByRole('button', { name: /chatgpt_web.start_task/ }));

    await waitFor(() =>
      expect(startLoginTaskText).toHaveBeenCalledWith(accountText, 'workspace-login')
    );
    await waitFor(() => expect(input.value).toBe(''));
    expect(targetNameInput.value).toBe('');

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
    const onAccountInfoRefresh = vi.fn();
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
        <AuthFileCard
          {...props}
          onChatGptWebRelogin={onRelogin}
          onChatGptWebAccountInfoRefresh={onAccountInfoRefresh}
        />
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
    const accountInfoRefreshButton = screen.getByRole('button', {
      name: 'auth_files.chatgpt_web_account_refresh_one',
    });
    expect(reloginButton.textContent).toBe('');

    fireEvent.click(screen.getByRole('checkbox', { name: 'auth_files.batch_select_all' }));
    fireEvent.click(screen.getByTitle('auth_files.models_button'));
    fireEvent.click(screen.getByTitle('auth_files.download_button'));
    fireEvent.click(screen.getByTitle('auth_files.prefix_proxy_button'));
    fireEvent.click(accountInfoRefreshButton);
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
    expect(onAccountInfoRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chatgpt-web.json' })
    );
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

  test('shows bounded recovery exhaustion and starts a manual recheck without marking success', () => {
    const onAccountInfoRefresh = vi.fn();
    render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'manual-recovery.json',
            type: 'chatgpt-web',
            lifecycle_state: 'active',
            account_info_recovery_state: 'manual_recovery_required',
            account_info_recovery_attempts: 4,
            account_info_recovery_max_attempts: 4,
            account_info_consecutive_failures: 4,
            account_info_recovery_stop_reason: 'recovery_exhausted',
            account_info_last_failure: 'temporary_failure',
            account_info_last_failure_at: '2026-08-16T00:00:00Z',
            account_info_manual_recheckable: true,
          })}
          onChatGptWebAccountInfoRefresh={onAccountInfoRefresh}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('manual_recovery_required').length).toBeGreaterThan(0);
    expect(screen.getByText('recovery_exhausted')).not.toBeNull();
    expect(screen.getByText('temporary_failure')).not.toBeNull();
    const button = screen.getByRole('button', { name: /auth_files.chatgpt_web_manual_recheck/ });
    fireEvent.click(button);
    expect(onAccountInfoRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'manual-recovery.json' })
    );
  });

  test('treats an empty recovery state as idle', () => {
    render(
      <MemoryRouter>
        <AuthFileCard
          {...createCardProps({
            name: 'idle-recovery.json',
            type: 'chatgpt-web',
            lifecycle_state: 'active',
            account_info_recovery_state: '',
            account_info_recovery_attempts: 0,
            account_info_recovery_max_attempts: 4,
            account_info_consecutive_failures: 0,
            account_info_manual_recheckable: true,
          })}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('auth_files.chatgpt_web_recovery_label')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /auth_files.chatgpt_web_manual_recheck/ })
    ).toBeNull();
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

  test('reads and writes Session Cookie fallback for failed Access Tokens', () => {
    const initialYaml = 'chatgpt-web:\n  session-cookie-refresh-on-token-failure: false\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebSessionCookieRefreshOnTokenFailure).toBe(false);
    act(() =>
      result.current.setVisualValues({
        chatgptWebSessionCookieRefreshOnTokenFailure: true,
      })
    );

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': { 'session-cookie-refresh-on-token-failure': true },
    });
  });

  test('defaults Session refresh on import to enabled and preserves an explicit disable', () => {
    const initialYaml = 'chatgpt-web:\n  auto-relogin: false\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebForceSessionRefreshOnImport).toBe(true);
    act(() =>
      result.current.setVisualValues({
        chatgptWebForceSessionRefreshOnImport: false,
      })
    );

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      'chatgpt-web': {
        'force-session-refresh-on-import': false,
      },
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
      expect(labels.auto_delete_dead_runtime_count).toBeTruthy();
      expect(labels.auto_delete_dead_runtime_count_hint).toBeTruthy();
      expect(labels.auto_delete_dead_priorities).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_description).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_placeholder).toBeTruthy();
      expect(labels.auto_delete_dead_priorities_empty).toBeTruthy();
    }
  });

  test('reads and writes ChatGPT Web image compatibility settings', () => {
    const initialYaml =
      'images:\n  chatgpt-web:\n    upstream-model: gpt-5-5-custom\n    ignore-unsupported-params: false\n    adapt-size-to-aspect-ratio: true\n    strict-size: true\n    aspect-ratio-max-error-percent: 0.5\n    resize-to-requested-size: true\n    resize-filter: approx-bilinear\n    max-resize-edge-pixels: 2048\n    max-image-response-megabytes: 96\n    max-n: 3\n';
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.chatgptWebImageUpstreamModel).toBe('gpt-5-5-custom');
    expect(result.current.visualValues.chatgptWebIgnoreUnsupportedImageParams).toBe(false);
    expect(result.current.visualValues.chatgptWebAdaptSizeToAspectRatio).toBe(true);
    expect(result.current.visualValues.chatgptWebStrictSize).toBe(true);
    expect(result.current.visualValues.chatgptWebAspectRatioMaxErrorPercent).toBe('0.5');
    expect(result.current.visualValues.chatgptWebResizeToRequestedSize).toBe(true);
    expect(result.current.visualValues.chatgptWebResizeFilter).toBe('approx-bilinear');
    expect(result.current.visualValues.chatgptWebMaxResizeEdgePixels).toBe('2048');
    expect(result.current.visualValues.chatgptWebMaxImageResponseMegabytes).toBe('96');
    expect(result.current.visualValues.chatgptWebMaxN).toBe('3');
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageUpstreamModel: 'gpt-5-5',
        chatgptWebIgnoreUnsupportedImageParams: true,
        chatgptWebAdaptSizeToAspectRatio: true,
        chatgptWebStrictSize: true,
        chatgptWebAspectRatioMaxErrorPercent: '1.25',
        chatgptWebResizeToRequestedSize: true,
        chatgptWebResizeFilter: 'catmull-rom',
        chatgptWebMaxResizeEdgePixels: '3840',
        chatgptWebMaxImageResponseMegabytes: '128',
        chatgptWebMaxN: '4',
      })
    );

    expect(parse(result.current.applyVisualChangesToYaml(initialYaml))).toMatchObject({
      images: {
        'chatgpt-web': {
          'upstream-model': 'gpt-5-5',
          'ignore-unsupported-params': true,
          'adapt-size-to-aspect-ratio': true,
          'strict-size': true,
          'aspect-ratio-max-error-percent': 1.25,
          'resize-to-requested-size': true,
          'resize-filter': 'catmull-rom',
          'max-resize-edge-pixels': 3840,
          'max-image-response-megabytes': 128,
          'max-n': 4,
        },
      },
    });
  });

  test('defaults the ChatGPT Web image count limit to one when omitted', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml('images:\n  chatgpt-web: {}\n'));

    expect(result.current.visualValues.chatgptWebMaxN).toBe('1');
  });

  test('validates ChatGPT Web image ratio and resize settings', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() =>
      result.current.setVisualValues({
        chatgptWebAdaptSizeToAspectRatio: false,
        chatgptWebStrictSize: true,
        chatgptWebAspectRatioMaxErrorPercent: '10.1',
        chatgptWebResizeToRequestedSize: true,
        chatgptWebResizeFilter: 'nearest-neighbor',
        chatgptWebMaxResizeEdgePixels: '3841',
        chatgptWebMaxImageResponseMegabytes: '0',
        chatgptWebMaxN: '11',
      })
    );

    expect(result.current.visualValidationErrors).toMatchObject({
      chatgptWebAspectRatioMaxErrorPercent: 'number_range_0_10',
      chatgptWebStrictSize: 'strict_size_requires_aspect_adaptation',
      chatgptWebResizeToRequestedSize: 'resize_requires_aspect_adaptation',
      chatgptWebResizeFilter: 'resize_filter',
      chatgptWebMaxResizeEdgePixels: 'integer_range_1_3840',
      chatgptWebMaxImageResponseMegabytes: 'integer_range_1_256',
      chatgptWebMaxN: 'integer_range_1_10',
    });
  });

  test('defines ChatGPT Web image resize labels in every locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const labels = locale.config_management.settings_center.chatgpt_web;
      expect(labels.image_size_title).toBeTruthy();
      expect(labels.adapt_size_to_aspect_ratio).toBeTruthy();
      expect(labels.strict_size).toBeTruthy();
      expect(labels.strict_size_description).toBeTruthy();
      expect(labels.image_size_status_adapted).toBeTruthy();
      expect(labels.image_size_status_strict).toBeTruthy();
      expect(labels.image_size_status_max_n).toBeTruthy();
      expect(labels.aspect_ratio_max_error_percent).toBeTruthy();
      expect(labels.resize_to_requested_size).toBeTruthy();
      expect(labels.resize_filter).toBeTruthy();
      expect(labels.max_resize_edge_pixels).toBeTruthy();
      expect(labels.max_image_response_megabytes).toBeTruthy();
      expect(labels.max_n).toBeTruthy();
      expect(labels.max_n_description).toBeTruthy();
    }
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

  test('negotiates proxy rule schema v2 and preserves multi-target save payloads', async () => {
    const rules = [
      {
        name: 'codex-route',
        targets: [{ pool: 'primary', priority: 10 }, { direct: true, priority: 0 }],
        providers: ['codex'],
        priorities: [4],
      },
    ];
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      schema_version: 2,
      'proxy-rules': rules,
    });
    await expect(proxyPoolsApi.getRulesConfig()).resolves.toEqual({
      rules,
      schemaVersion: 2,
      legacyTargetsUnsupported: false,
    });

    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      schema_version: 2,
      'proxy-rules': rules,
    });
    await expect(proxyPoolsApi.saveRules(rules, 2)).resolves.toEqual(rules);
    expect(put).toHaveBeenCalledWith('/proxy-rules', { schema_version: 2, value: rules });
  });

  test('flags unversioned target payloads instead of silently flattening them', async () => {
    const rules = [{ name: 'route', targets: [{ pool: 'primary' }, { direct: true }] }];
    vi.spyOn(apiClient, 'get').mockResolvedValue({ 'proxy-rules': rules });

    await expect(proxyPoolsApi.getRulesConfig()).resolves.toEqual({
      rules,
      schemaVersion: 1,
      legacyTargetsUnsupported: true,
    });
  });

  test('checks all bound nodes with a bounded unbound-node sample', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ results: [] });

    await proxyPoolsApi.checkPool('residential pool', 25);

    expect(post).toHaveBeenCalledWith('/proxy-pools/residential%20pool/check', { sample: 25 });
  });

  test('reads and updates global proxy health settings without changing endpoint order', async () => {
    const config = {
      concurrency: 12,
      'endpoint-timeout-seconds': 9,
      'failure-threshold': 2,
      endpoints: [
        { name: 'primary', url: 'https://primary.example/check', mode: 'http-status' as const },
        {
          name: 'backup',
          url: 'https://backup.example/cdn-cgi/trace',
          mode: 'cloudflare-trace' as const,
        },
      ],
    };
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      'proxy-health-check': config,
      runtime: { limit: 12, active: 2, queued: 1, peak_active: 8 },
    });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });

    await expect(proxyPoolsApi.getHealthCheck()).resolves.toMatchObject({ config });
    await proxyPoolsApi.updateHealthCheck(config);

    expect(get).toHaveBeenCalledWith('/proxy-health-check');
    expect(patch).toHaveBeenCalledWith('/proxy-health-check', config);
  });

  test('creates and resumes asynchronous proxy check tasks through encoded paths', async () => {
    const task = {
      task_id: 'task/1',
      pool: 'residential pool',
      status: 'running' as const,
      total: 25,
      completed: 10,
      running: 8,
      succeeded: 9,
      failed: 1,
      bound: 15,
      sampled: 10,
      created_at: '2026-08-20T00:00:00Z',
    };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ task });
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ tasks: [task] })
      .mockResolvedValueOnce({ task });

    await expect(proxyPoolsApi.createCheckTask('residential pool', 10)).resolves.toEqual(task);
    await expect(proxyPoolsApi.getCheckTasks('residential pool')).resolves.toEqual([task]);
    await expect(proxyPoolsApi.getCheckTask('residential pool', 'task/1')).resolves.toEqual(task);

    expect(post).toHaveBeenCalledWith('/proxy-pools/residential%20pool/check-tasks', {
      sample: 10,
    });
    expect(get).toHaveBeenNthCalledWith(1, '/proxy-pools/residential%20pool/check-tasks');
    expect(get).toHaveBeenNthCalledWith(2, '/proxy-pools/residential%20pool/check-tasks/task%2F1');
  });
});
