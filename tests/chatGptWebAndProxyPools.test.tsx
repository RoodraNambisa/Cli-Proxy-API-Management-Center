import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { ChatGptWebPage } from '@/pages/ChatGptWebPage';
import { apiClient } from '@/services/api/client';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { proxyPoolsApi } from '@/services/api/proxyPools';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileItem, ChatGptWebLoginTask, ChatGptWebMutationTask } from '@/types';
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

describe('ChatGPT Web management compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({ connectionStatus: 'connected' });
    useNotificationStore.setState({ showNotification: vi.fn() });
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

  test('renders terminal lifecycle separately from cooldown and hides raw credential actions', () => {
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
    expect(screen.queryByTitle('auth_files.download_button')).toBeNull();
    expect(screen.queryByTitle('auth_files.prefix_proxy_button')).toBeNull();
    expect(screen.queryByText('socks5://user:secret@proxy.example:1080')).toBeNull();
    fireEvent.click(screen.getByTitle('auth_files.chatgpt_web_relogin'));
    expect(onRelogin).toHaveBeenCalledWith(expect.objectContaining({ name: 'chatgpt-web.json' }));
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
