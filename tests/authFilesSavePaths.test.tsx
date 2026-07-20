import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { useAuthFilesBatchSettings } from '@/features/authFiles/hooks/useAuthFilesBatchSettings';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

describe('auth file save paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useNotificationStore.getState().clearAll();
  });

  test('patches all selected auth files in one request and preserves priority zero', async () => {
    const files: AuthFileItem[] = Array.from({ length: 8 }, (_, index) => ({
      name: `auth-${index}.json`,
      type: 'codex',
    }));
    const patchFieldsBatch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({
      status: 'ok',
      matched: files.length,
      updated: files.length,
      files: files.map((file) => file.name),
      failed: [],
    });
    const downloadJsonObject = vi.spyOn(authFilesApi, 'downloadJsonObject');
    const saveText = vi.spyOn(authFilesApi, 'saveText');
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const deselectAll = vi.fn();
    const replaceSelection = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles,
        deselectAll,
        replaceSelection,
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    act(() => result.current.handleBatchSettingsChange('priority', '0'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFieldsBatch).toHaveBeenCalledTimes(1);
    expect(patchFieldsBatch).toHaveBeenCalledWith(
      files.map((file) => file.name),
      { priority: 0 }
    );
    expect(downloadJsonObject).not.toHaveBeenCalled();
    expect(saveText).not.toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(deselectAll).toHaveBeenCalledTimes(1);
    expect(replaceSelection).not.toHaveBeenCalled();
    expect(result.current.batchSettings.open).toBe(false);
  });

  test('keeps failed auth files selected when the batch endpoint returns 207', async () => {
    const files: AuthFileItem[] = [
      { name: 'first.json', type: 'codex' },
      { name: 'second.json', type: 'codex' },
    ];
    const patchFieldsBatch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({
      status: 'partial',
      matched: 2,
      updated: 1,
      files: ['first.json'],
      failed: [{ name: 'second.json', status: 400, error: 'using_api requires xai' }],
    });
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const deselectAll = vi.fn();
    const replaceSelection = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles,
        deselectAll,
        replaceSelection,
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    act(() => result.current.handleBatchSettingsChange('usingApi', 'true'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFieldsBatch).toHaveBeenCalledWith(['first.json', 'second.json'], {
      using_api: true,
    });
    expect(replaceSelection).toHaveBeenCalledWith(['second.json']);
    expect(deselectAll).not.toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(result.current.batchSettings.open).toBe(true);
    expect(result.current.batchSettings.names).toEqual(['second.json']);
    expect(result.current.batchSettings.failures).toEqual([
      { name: 'second.json', status: 400, error: 'using_api requires xai' },
    ]);
  });

  test('sends explicit null to clear a batch priority', async () => {
    const files: AuthFileItem[] = [{ name: 'zero.json', type: 'codex' }];
    const patchFieldsBatch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({
      status: 'ok',
      matched: 1,
      updated: 1,
      files: ['zero.json'],
      failed: [],
    });
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
        replaceSelection: vi.fn(),
      })
    );

    act(() => result.current.openBatchSettings(['zero.json']));
    act(() => result.current.handleBatchSettingsChange('priority', 'null'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFieldsBatch).toHaveBeenCalledWith(['zero.json'], { priority: null });
  });

  test('creates Web copies only from eligible selected Codex credentials', async () => {
    const files: AuthFileItem[] = [
      { name: 'codex.json', type: 'codex' },
      {
        name: 'retained.json',
        type: 'codex',
        retained_for_dependents: true,
        deletion_state: 'retained_for_dependents',
      },
      { name: 'xai.json', type: 'xai' },
    ];
    const startConversionTask = vi.spyOn(chatGptWebApi, 'startConversionTask').mockResolvedValue({
      id: 'conversion-1',
      kind: 'conversion',
      state: 'completed',
      created_at: '2026-07-18T00:00:00Z',
      total: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      canceled: 0,
      results: [
        {
          source_name: 'codex.json',
          target_name: 'chatgpt-web.json',
          credential_mode: 'linked_codex',
          status: 'created',
        },
      ],
    });
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
        replaceSelection: vi.fn(),
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    expect(result.current.batchSettings.codexNames).toEqual(['codex.json']);
    act(() => result.current.handleBatchSettingsChange('createChatGptWebCopy', 'true'));
    await act(async () => result.current.saveBatchSettings());

    expect(startConversionTask).toHaveBeenCalledWith(['codex.json']);
    expect(result.current.conversionTask?.kind).toBe('conversion');
  });

  test('preserves field and conversion failures while converting every eligible Codex source', async () => {
    const files: AuthFileItem[] = [
      { name: 'codex.json', type: 'codex' },
      { name: 'xai.json', type: 'xai' },
    ];
    vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({
      status: 'partial',
      matched: 2,
      updated: 1,
      files: ['xai.json'],
      failed: [{ name: 'codex.json', status: 400, error: 'field update failed' }],
    });
    const startConversionTask = vi.spyOn(chatGptWebApi, 'startConversionTask').mockResolvedValue({
      id: 'conversion-partial',
      kind: 'conversion',
      state: 'completed_with_errors',
      created_at: '2026-07-18T00:00:00Z',
      total: 1,
      processed: 1,
      succeeded: 0,
      failed: 1,
      canceled: 0,
      results: [
        {
          source_name: 'codex.json',
          status: 'failed',
          error_category: 'temporary_failure',
          error: 'conversion failed',
        },
      ],
    });
    const replaceSelection = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
        replaceSelection,
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    act(() => result.current.handleBatchSettingsChange('note', 'batch note'));
    act(() => result.current.handleBatchSettingsChange('createChatGptWebCopy', 'true'));
    await act(async () => result.current.saveBatchSettings());

    expect(startConversionTask).toHaveBeenCalledWith(['codex.json']);
    expect(replaceSelection).toHaveBeenLastCalledWith(['codex.json']);
    expect(result.current.conversionTask?.state).toBe('completed_with_errors');
    expect(result.current.batchSettings.failures).toEqual([
      { name: 'codex.json', status: 400, error: 'field update failed' },
    ]);
  });

  test('keeps patched data and selects Codex sources when conversion task creation fails', async () => {
    const files: AuthFileItem[] = [{ name: 'codex.json', type: 'codex' }];
    vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({
      status: 'ok',
      matched: 1,
      updated: 1,
      files: ['codex.json'],
      failed: [],
    });
    vi.spyOn(chatGptWebApi, 'startConversionTask').mockRejectedValue(
      new Error('conversion unavailable')
    );
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const replaceSelection = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles,
        deselectAll: vi.fn(),
        replaceSelection,
      })
    );

    act(() => result.current.openBatchSettings(['codex.json']));
    act(() => result.current.handleBatchSettingsChange('note', 'saved note'));
    act(() => result.current.handleBatchSettingsChange('createChatGptWebCopy', 'true'));
    await act(async () => result.current.saveBatchSettings());

    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(replaceSelection).toHaveBeenCalledWith(['codex.json']);
    expect(result.current.batchSettings.open).toBe(true);
    expect(result.current.batchSettings.saving).toBe(false);
    expect(result.current.conversionTask).toBeNull();
  });

  test('accepts and normalizes a 207 batch fields response', async () => {
    const requestRaw = vi.spyOn(apiClient, 'requestRaw').mockResolvedValue({
      status: 207,
      data: {
        status: 'partial',
        matched: 2,
        updated: 1,
        files: ['first.json'],
        failed: [{ name: 'second.json', status: 404, error: 'not found' }],
      },
    } as never);

    const result = await authFilesApi.patchFieldsBatch(['first.json', 'second.json'], {
      priority: 0,
      disable_cooling: false,
    });

    expect(requestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/auth-files/fields',
        method: 'PATCH',
        data: {
          names: ['first.json', 'second.json'],
          fields: { priority: 0, disable_cooling: false },
        },
      })
    );
    const validateStatus = requestRaw.mock.calls[0][0].validateStatus;
    expect(validateStatus?.(200)).toBe(true);
    expect(validateStatus?.(207)).toBe(true);
    expect(validateStatus?.(400)).toBe(false);
    expect(result).toEqual({
      status: 'partial',
      matched: 2,
      updated: 1,
      files: ['first.json'],
      failed: [{ name: 'second.json', status: 404, error: 'not found' }],
    });
  });

  test('keeps a 202 retained Codex source out of the deleted file list', async () => {
    const requestRaw = vi.spyOn(apiClient, 'requestRaw').mockResolvedValue({
      status: 202,
      data: {
        status: 'retained',
        deleted: false,
        retained: true,
        name: 'codex-source.json',
        dependent_count: 2,
        dependent_names: ['web-a.json', 'web-b.json'],
      },
    } as never);

    const result = await authFilesApi.deleteFile('codex-source.json', 'retain');

    expect(requestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/auth-files',
        method: 'DELETE',
        params: { dependency_action: 'retain' },
        data: { names: ['codex-source.json'] },
      })
    );
    expect(result).toEqual({
      status: 'retained',
      deleted: 0,
      files: [],
      retained: 1,
      retainedFiles: [
        {
          name: 'codex-source.json',
          dependentCount: 2,
          dependentNames: ['web-a.json', 'web-b.json'],
        },
      ],
      failed: [],
    });
  });

  test('supports cascade deletion and restoring a retained Codex source', async () => {
    const requestRaw = vi.spyOn(apiClient, 'requestRaw').mockResolvedValue({
      status: 200,
      data: { status: 'ok', deleted: 1, files: ['codex-source.json'], retained: 0 },
    } as never);
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ status: 'ok', name: 'codex-source.json', disabled: false });

    await authFilesApi.deleteFile('codex-source.json', 'cascade');
    await authFilesApi.restoreFile('codex-source.json');

    expect(requestRaw).toHaveBeenCalledWith(
      expect.objectContaining({ params: { dependency_action: 'cascade' } })
    );
    expect(post).toHaveBeenCalledWith('/auth-files/restore', { name: 'codex-source.json' });
  });

  test('patches a lightweight single-file edit without uploading the full credential', async () => {
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(
      JSON.stringify({ type: 'codex', priority: 1, websockets: false })
    );
    const patchFields = vi.spyOn(authFilesApi, 'patchFields').mockResolvedValue({ status: 'ok' });
    const saveText = vi.spyOn(authFilesApi, 'saveText');
    let resolveLoadFiles: (() => void) | undefined;
    const loadFiles = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoadFiles = resolve;
        })
    );
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles })
    );

    await act(async () =>
      result.current.openPrefixProxyEditor({ name: 'codex.json', type: 'codex' })
    );
    act(() => result.current.handlePrefixProxyChange('priority', '-1'));
    await act(async () => result.current.handlePrefixProxySave());

    expect(patchFields).toHaveBeenCalledWith('codex.json', { priority: -1 });
    expect(saveText).not.toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(result.current.prefixProxyEditor).toBeNull();
    resolveLoadFiles?.();
  });

  test('preserves header replacement semantics on the single-file PATCH path', async () => {
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(
      JSON.stringify({
        type: 'claude',
        headers: { 'X-Keep': 'old', 'X-Remove': 'gone' },
      })
    );
    const patchFields = vi.spyOn(authFilesApi, 'patchFields').mockResolvedValue({ status: 'ok' });
    const saveText = vi.spyOn(authFilesApi, 'saveText');
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
      })
    );

    await act(async () =>
      result.current.openPrefixProxyEditor({ name: 'claude.json', type: 'claude' })
    );
    act(() =>
      result.current.handlePrefixProxyChange(
        'headersText',
        JSON.stringify({ 'X-Keep': 'new', 'X-New': 'value' })
      )
    );
    await act(async () => result.current.handlePrefixProxySave());

    expect(patchFields).toHaveBeenCalledWith('claude.json', {
      headers: { 'X-Keep': 'new', 'X-Remove': '', 'X-New': 'value' },
    });
    expect(saveText).not.toHaveBeenCalled();
  });

  test('uploads distinct files concurrently and combines their results', async () => {
    let active = 0;
    let maxActive = 0;
    const postForm = vi.spyOn(apiClient, 'postForm').mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 'ok' } as never;
    });
    const files = Array.from(
      { length: 6 },
      (_, index) => new File(['{}'], `upload-${index}.json`, { type: 'application/json' })
    );

    const result = await authFilesApi.uploadFiles(files);

    expect(postForm).toHaveBeenCalledTimes(files.length);
    expect(maxActive).toBe(4);
    expect(result.uploaded).toBe(files.length);
    expect(result.files).toEqual(files.map((file) => file.name));
    expect(result.failed).toEqual([]);
  });
});
