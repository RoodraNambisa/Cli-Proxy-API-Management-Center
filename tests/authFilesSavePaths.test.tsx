import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
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

  test('patches lightweight batch fields with bounded concurrency', async () => {
    const files: AuthFileItem[] = Array.from({ length: 8 }, (_, index) => ({
      name: `auth-${index}.json`,
      type: 'codex',
    }));
    let active = 0;
    let maxActive = 0;
    const patchFields = vi.spyOn(authFilesApi, 'patchFields').mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 'ok' };
    });
    const downloadJsonObject = vi.spyOn(authFilesApi, 'downloadJsonObject');
    const saveText = vi.spyOn(authFilesApi, 'saveText');
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const deselectAll = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles,
        deselectAll,
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    act(() => result.current.handleBatchSettingsChange('priority', '-1'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFields).toHaveBeenCalledTimes(files.length);
    expect(patchFields).toHaveBeenCalledWith('auth-0.json', { priority: -1 });
    expect(maxActive).toBe(6);
    expect(downloadJsonObject).not.toHaveBeenCalled();
    expect(saveText).not.toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(deselectAll).toHaveBeenCalledTimes(1);
  });

  test('uses bounded full-file updates for fields missing from the PATCH API', async () => {
    const files: AuthFileItem[] = [
      { name: 'first.json', type: 'codex' },
      { name: 'second.json', type: 'codex' },
    ];
    const patchFields = vi.spyOn(authFilesApi, 'patchFields');
    const downloadJsonObject = vi
      .spyOn(authFilesApi, 'downloadJsonObject')
      .mockResolvedValue({ type: 'codex' });
    const saveText = vi.spyOn(authFilesApi, 'saveText').mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
      })
    );

    act(() => result.current.openBatchSettings(files.map((file) => file.name)));
    act(() => result.current.handleBatchSettingsChange('disableCooling', 'true'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFields).not.toHaveBeenCalled();
    expect(downloadJsonObject).toHaveBeenCalledTimes(2);
    expect(saveText).toHaveBeenCalledTimes(2);
    saveText.mock.calls.forEach(([, payload]) => {
      expect(JSON.parse(payload)).toMatchObject({ disable_cooling: true });
    });
  });

  test('keeps explicit priority zero on the full-file path', async () => {
    const files: AuthFileItem[] = [{ name: 'zero.json', type: 'codex' }];
    const patchFields = vi.spyOn(authFilesApi, 'patchFields');
    vi.spyOn(authFilesApi, 'downloadJsonObject').mockResolvedValue({ type: 'codex' });
    const saveText = vi.spyOn(authFilesApi, 'saveText').mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthFilesBatchSettings({
        files,
        disableControls: false,
        loadFiles: vi.fn().mockResolvedValue(undefined),
        deselectAll: vi.fn(),
      })
    );

    act(() => result.current.openBatchSettings(['zero.json']));
    act(() => result.current.handleBatchSettingsChange('priority', '0'));
    await act(async () => result.current.saveBatchSettings());

    expect(patchFields).not.toHaveBeenCalled();
    expect(JSON.parse(saveText.mock.calls[0][1])).toMatchObject({ priority: 0 });
  });

  test('patches a lightweight single-file edit without uploading the full credential', async () => {
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(
      JSON.stringify({ type: 'codex', priority: 1, websockets: false })
    );
    const patchFields = vi.spyOn(authFilesApi, 'patchFields').mockResolvedValue({ status: 'ok' });
    const saveText = vi.spyOn(authFilesApi, 'saveText');
    const loadFiles = vi.fn().mockResolvedValue(undefined);
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
