import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useAuthFilesPrefixProxyEditor, buildAuthFileFieldsPatch } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));
const file = { name: 'test-rules.json', type: 'codex' };
const rule = { status: 500, match: [' exact '], action: 'stop', future: 'keep' };

describe('auth file error rule fields', () => {
  test.each(['request_scoped_errors', 'request-scoped-errors'])('edits %s using only a field patch and preserves a rejected draft', async (key) => {
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(JSON.stringify({ type: 'codex', access_token: 'test-private', extension: 'keep', [key]: [rule] }));
    const patch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({ status: 'partial', matched: 1, updated: 0, files: [], failed: [{ name: file.name, error: 'rejected' }] });
    const { result } = renderHook(() => useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: async () => {} }));
    await act(async () => result.current.openPrefixProxyEditor(file));
    expect(result.current.prefixProxyDirty).toBe(false);
    act(() => result.current.handlePrefixProxyChange('note', 'note only'));
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenLastCalledWith([file.name], { note: 'note only' });
    act(() => result.current.handlePrefixProxyChange('note', ''));
    act(() => result.current.handlePrefixProxyChange('requestScopedErrors', [{ ...rule, match: [' changed '] }]));
    expect(result.current.prefixProxyDirty).toBe(true);
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenLastCalledWith([file.name], { request_scoped_errors: [{ ...rule, match: [' changed '] }] });
    expect(result.current.prefixProxyDirty).toBe(true);
    expect(result.current.prefixProxyEditor?.saving).toBe(false);
    const calls = patch.mock.calls.length;
    act(() => result.current.handlePrefixProxyChange('requestScopedErrors', [{ ...rule, status: 600 }]));
    expect(result.current.prefixProxyUpdatedText).toBe('');
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenCalledTimes(calls);
    act(() => result.current.handlePrefixProxyChange('requestScopedErrors', []));
    patch.mockResolvedValue({ status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] });
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenLastCalledWith([file.name], { request_scoped_errors: [] });
    expect(result.current.prefixProxyEditor).toBeNull();
  });

  test('canonical null wins and clearing never sends private credential fields', () => {
    const previous = { request_scoped_errors: [rule], 'request-scoped-errors': [rule], access_token: 'test-private' };
    expect(buildAuthFileFieldsPatch(previous, { ...previous, request_scoped_errors: null }, false, false)).toEqual({ request_scoped_errors: null });
  });

  test('both API entry points reject invalid rules before the network and serialize regex aliases', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const raw = vi.spyOn(apiClient, 'requestRaw').mockResolvedValue({ data: { status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] } } as never);
    const invalid = { request_scoped_errors: [{ ...rule, status: 600 }] };
    expect(() => authFilesApi.patchFields(file.name, invalid)).toThrow();
    await expect(authFilesApi.patchFieldsBatch([file.name], invalid)).rejects.toThrow();
    expect(patch).not.toHaveBeenCalled(); expect(raw).not.toHaveBeenCalled();
    await authFilesApi.patchFieldsBatch([file.name], { request_scoped_errors: [{ ...rule, matchRegexr: ['(?i)busy'] }] });
    expect(raw.mock.lastCall?.[0].data).toEqual({ names: [file.name], fields: { request_scoped_errors: [{ ...rule, 'match-regexr': ['(?i)busy'] }] } });
    await authFilesApi.patchFields(file.name, { request_scoped_errors: null });
    expect(patch.mock.lastCall?.[1]).toEqual({ name: file.name, request_scoped_errors: null });
  });
});
