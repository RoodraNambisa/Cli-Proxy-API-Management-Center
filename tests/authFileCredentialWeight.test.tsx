import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, load: vi.fn(async () => undefined) }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: mocks.t }),
}));
beforeEach(() => { vi.restoreAllMocks(); mocks.load.mockClear(); });
const file = { name: 'weight-test.json', type: 'codex' };
function Harness() {
  const state = useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: mocks.load });
  return <>
    <button onClick={() => void state.openPrefixProxyEditor(file)}>open</button>
    <AuthFilesPrefixProxyEditorModal disableControls={false} editor={state.prefixProxyEditor}
      updatedText={state.prefixProxyUpdatedText} dirty={state.prefixProxyDirty}
      onClose={state.closePrefixProxyEditor} onCopyText={vi.fn()}
      onSave={() => void state.handlePrefixProxySave()} onChange={state.handlePrefixProxyChange} />
  </>;
}

describe('individual auth file credential weight', () => {
  test('the modal saves only weight, retains a rejected draft, and reloads zero and inheritance', async () => {
    const stored: Record<string, unknown> = { type: 'codex', weight: 5, access_token: 'test-secret-kept', extension: 'keep' };
    vi.spyOn(authFilesApi, 'downloadText').mockImplementation(async () => JSON.stringify(stored));
    const request = vi.spyOn(apiClient, 'requestRaw').mockImplementation(async (config) => {
      const { fields } = config.data as { fields: Record<string, unknown> };
      expect(config.url).toBe('/auth-files/fields');
      expect(fields).toEqual({ weight: fields.weight });
      if (fields.weight === null) delete stored.weight;
      else stored.weight = fields.weight;
      return { data: { status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] } } as never;
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '1.5' } });
    expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0' } });
    request.mockRejectedValueOnce(new Error('save rejected'));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(false));
    expect(stored.weight).toBe(5);
    expect((input as HTMLInputElement).value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(stored.weight).toBe(0));
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'ai_providers.weight_label' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const zero = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
    await waitFor(() => expect((zero as HTMLInputElement).value).toBe('0'));
    fireEvent.change(zero, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(stored).not.toHaveProperty('weight'));
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: 'ai_providers.weight_label' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const inherited = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
    await waitFor(() => expect((inherited as HTMLInputElement).value).toBe(''));
    expect(stored).toMatchObject({ access_token: 'test-secret-kept', extension: 'keep' });
  });

  test('untouched legacy weight stays out of unrelated patches and partial failures stay dirty', async () => {
    vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(JSON.stringify({ type: 'codex', weight: -3, access_token: 'test-secret-kept' }));
    const patch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({ status: 'partial', matched: 1, updated: 0, files: [], failed: [{ name: file.name, error: 'rejected' }] } as never);
    const { result } = renderHook(() => useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: mocks.load }));
    await act(async () => result.current.openPrefixProxyEditor(file));
    expect(result.current.prefixProxyEditor?.weight).toBe('0');
    expect(result.current.prefixProxyDirty).toBe(false);
    act(() => result.current.handlePrefixProxyChange('note', 'updated note'));
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenCalledWith([file.name], { note: 'updated note' });
    expect(result.current.prefixProxyDirty).toBe(true);
    expect(result.current.prefixProxyEditor?.saving).toBe(false);
    act(() => result.current.handlePrefixProxyChange('weight', '1000001'));
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
