import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { apiClient } from '@/services/api/client';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { proxyPoolsApi } from '@/services/api/proxyPools';
import type { AuthFileItem } from '@/types';
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

describe('ChatGPT Web management compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('uploads the selected file directly without reading or converting its contents', async () => {
    const postForm = vi.spyOn(apiClient, 'postForm').mockResolvedValue({
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
});
