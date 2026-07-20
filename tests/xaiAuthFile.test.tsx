import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { authFilesApi, normalizeAuthFileEntry } from '@/services/api/authFiles';
import { AuthFileCard, type AuthFileCardProps } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import type { PrefixProxyEditorState } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import {
  getAuthFileModelCapability,
  isXaiProvider,
  readXaiAuthFileUsingApi,
  readXaiAuthFileWebsockets,
} from '@/features/authFiles/constants';
import type { AuthFileItem } from '@/types';
import { buildXaiBillingSummary, mergeXaiBillingSummaries } from '@/utils/quota';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const createCardProps = (file: AuthFileItem, onToggleXaiField = vi.fn()): AuthFileCardProps => ({
  file,
  cooldownAsOfMs: Date.parse('2026-07-15T00:00:00Z'),
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
  onToggleXaiField,
  onToggleSelect: vi.fn(),
});

describe('xAI auth file compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes OAuth and API-key defaults without exposing fields on other providers', () => {
    const oauth = normalizeAuthFileEntry({ name: 'oauth.json', type: 'xai', auth_kind: 'oauth' });
    const apiKey = normalizeAuthFileEntry({ name: 'api.json', provider: 'grok' });
    const codex = normalizeAuthFileEntry({ name: 'codex.json', type: 'codex' });

    expect(readXaiAuthFileUsingApi(oauth)).toBe(false);
    expect(readXaiAuthFileWebsockets(oauth)).toBe(false);
    expect(readXaiAuthFileUsingApi(apiKey)).toBe(true);
    expect(apiKey.type).toBe('xai');
    expect(codex.using_api).toBeUndefined();
    expect(codex.websockets).toBeUndefined();
  });

  test('preserves explicit xAI booleans and sends the requested PATCH fields', async () => {
    const entry = normalizeAuthFileEntry({
      name: 'xai.json',
      type: 'xai',
      using_api: false,
      websockets: true,
    });
    expect(readXaiAuthFileUsingApi(entry)).toBe(false);
    expect(readXaiAuthFileWebsockets(entry)).toBe(true);

    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
    await authFilesApi.patchFields('xai.json', { using_api: true, websockets: false });
    expect(patch).toHaveBeenCalledWith('/auth-files/fields', {
      name: 'xai.json',
      using_api: true,
      websockets: false,
    });
  });

  test('normalizes auth cooldown fields from the list response', () => {
    const entry = normalizeAuthFileEntry({
      name: 'cooling.json',
      type: 'codex',
      cooldown_active: true,
      cooldown_scope: 'model',
      cooldown_until: '2999-01-01T00:00:00Z',
      cooldown_model_count: 3,
    });

    expect(entry).toMatchObject({
      cooldownActive: true,
      cooldownScope: 'model',
      cooldownUntil: '2999-01-01T00:00:00Z',
      cooldownModelCount: 3,
    });
  });

  test('keeps disabled as the primary card state while showing active cooldown details', () => {
    render(
      <AuthFileCard
        {...createCardProps({
          name: 'disabled.json',
          type: 'codex',
          disabled: true,
          cooldown_active: true,
          cooldown_scope: 'auth',
          cooldown_until: '2999-01-01T00:00:00Z',
        })}
      />
    );

    expect(screen.getByText('auth_files.health_status_disabled')).not.toBeNull();
    expect(screen.getByText('auth_files.cooldown_auth_until')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'auth_files.cooldown_auth_until' })).toBeNull();
  });

  test('opens model details from the model cooldown summary', () => {
    const props = createCardProps({
      name: 'model-cooling.json',
      type: 'codex',
      cooldown_active: true,
      cooldown_scope: 'model',
      cooldown_until: '2999-01-01T00:00:00Z',
      cooldown_model_count: 3,
    });

    render(<AuthFileCard {...props} />);

    const cooldownButton = screen.getByRole('button', {
      name: 'auth_files.cooldown_models_until',
    });
    expect(cooldownButton.getAttribute('title')).toBe('auth_files.cooldown_models_view_details');
    fireEvent.click(cooldownButton);
    expect(props.onShowModels).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'model-cooling.json' })
    );
  });

  test('shows only unexpired model cooldown badges', () => {
    render(
      <AuthFileModelsModal
        open
        fileName="codex.json"
        fileType="codex"
        loading={false}
        error={null}
        models={[
          {
            id: 'active-model',
            cooldown_active: true,
            scope: 'auth',
            until: '2999-01-01T00:00:00Z',
          },
          {
            id: 'expired-model',
            cooldown_active: true,
            scope: 'model',
            until: '2000-01-01T00:00:00Z',
          },
        ]}
        loadedAtMs={Date.parse('2026-07-15T00:00:00Z')}
        excluded={{}}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
      />
    );

    expect(screen.getByText('auth_files.models_cooldown_auth_badge')).not.toBeNull();
    expect(screen.queryByText('auth_files.models_cooldown_model_badge')).toBeNull();
    expect(screen.getByText('auth_files.models_cooldown_until')).not.toBeNull();
  });

  test('ignores a stale model response after another credential is opened', async () => {
    let resolveFirst: ((models: { id: string }[]) => void) | undefined;
    const firstRequest = new Promise<{ id: string }[]>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(authFilesApi, 'getModelsForAuthFile')
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce([{ id: 'second-model' }]);
    const { result } = renderHook(() => useAuthFilesModels());

    let firstOpen: Promise<void> | undefined;
    act(() => {
      firstOpen = result.current.showModels({ name: 'first.json', type: 'codex' });
    });
    await act(async () => {
      await result.current.showModels({ name: 'second.json', type: 'codex' });
    });
    expect(result.current.modelsFileName).toBe('second.json');
    expect(result.current.modelsList).toEqual([{ id: 'second-model' }]);

    await act(async () => {
      resolveFirst?.([{ id: 'first-model' }]);
      await firstOpen;
    });
    expect(result.current.modelsFileName).toBe('second.json');
    expect(result.current.modelsList).toEqual([{ id: 'second-model' }]);
  });

  test('shows xAI-only switches and never exposes them on other provider cards', () => {
    const onToggleXaiField = vi.fn();
    const view = render(
      <AuthFileCard
        {...createCardProps(
          { name: 'xai.json', type: 'xai', auth_kind: 'oauth' },
          onToggleXaiField
        )}
      />
    );

    const usingApiSwitch = screen.getByRole('checkbox', {
      name: 'auth_files.using_api_label',
    });
    expect(screen.getByRole('checkbox', { name: 'auth_files.websockets_label' })).not.toBeNull();
    fireEvent.click(usingApiSwitch);
    expect(onToggleXaiField).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'xai.json' }),
      'using_api',
      true
    );

    view.rerender(<AuthFileCard {...createCardProps({ name: 'codex.json', type: 'codex' })} />);
    expect(screen.queryByRole('checkbox', { name: 'auth_files.using_api_label' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'auth_files.websockets_label' })).toBeNull();
  });

  test('recognizes xAI aliases and derives media capability without a model allowlist', () => {
    expect(isXaiProvider('x-ai')).toBe(true);
    expect(isXaiProvider('grok')).toBe(true);
    expect(isXaiProvider('codex')).toBe(false);
    expect(getAuthFileModelCapability({ id: 'future-grok-image-model' }, 'xai')).toBe('image');
    expect(getAuthFileModelCapability({ id: 'future-grok-video-model' }, 'xai')).toBe('video');
    expect(getAuthFileModelCapability({ id: 'future-grok-text-model' }, 'xai')).toBe('text');
    expect(getAuthFileModelCapability({ id: 'future-grok-image-model' }, 'codex')).toBeNull();
  });

  test('keeps retired Gemini CLI credentials viewable but not editable', () => {
    const onOpen = vi.fn();
    const card = render(
      <AuthFileCard
        {...createCardProps({ name: 'legacy.json', type: 'gemini-cli', runtime_only: true })}
        onOpenPrefixProxyEditor={onOpen}
      />
    );

    expect(screen.getByText('auth_files.gemini_cli_unsupported')).not.toBeNull();
    fireEvent.click(screen.getByTitle('auth_files.view_button'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'legacy.json' }));
    expect(screen.getByTitle('auth_files.download_button')).not.toBeNull();
    expect(screen.getByTitle('auth_files.delete_button')).not.toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();

    card.unmount();
    const editor: PrefixProxyEditorState = {
      fileName: 'legacy.json',
      fileInfoText: '{"name":"legacy.json"}',
      isCodexFile: false,
      readOnly: true,
      loading: false,
      saving: false,
      error: null,
      originalText: '{"type":"gemini-cli"}',
      rawText: '{"type":"gemini-cli"}',
      json: { type: 'gemini-cli' },
      prefix: '',
      proxyUrl: '',
      priority: '',
      excludedModelsText: '',
      disableCooling: '',
      websockets: false,
      note: '',
      noteTouched: false,
      headersText: '',
      headersTouched: false,
      headersError: null,
    };
    render(
      <AuthFilesPrefixProxyEditorModal
        disableControls={false}
        editor={editor}
        updatedText={editor.rawText}
        dirty={false}
        onClose={vi.fn()}
        onCopyText={vi.fn()}
        onSave={vi.fn()}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue(/gemini-cli/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull();
    expect(screen.queryByText('auth_files.prefix_label')).toBeNull();
  });

  test('merges weekly usage and monthly credits for Grok quota display', () => {
    const weekly = buildXaiBillingSummary({
      currentPeriod: { type: 'weekly', end: '2026-07-18T00:00:00Z' },
      creditUsagePercent: 25,
      productUsage: [{ product: 'grok-4.5', usagePercent: 10 }],
    });
    const monthly = buildXaiBillingSummary({
      monthlyLimit: { val: 15000 },
      used: { val: 3000 },
      onDemandCap: { val: 5000 },
      billingPeriodEnd: '2026-08-01T00:00:00Z',
    });
    const merged = mergeXaiBillingSummaries(weekly, monthly);

    expect(merged?.periodType).toBe('weekly');
    expect(merged?.usagePercent).toBe(25);
    expect(merged?.monthlyLimitCents).toBe(15000);
    expect(merged?.usedPercent).toBe(20);
    expect(merged?.productUsage).toEqual([{ product: 'grok-4.5', usagePercent: 10 }]);
  });
});
