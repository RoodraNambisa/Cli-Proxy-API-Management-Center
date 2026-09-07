import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AuthFilesBatchSettingsModal } from '@/features/authFiles/components/AuthFilesBatchSettingsModal';
import { useAuthFilesBatchSettings } from '@/features/authFiles/hooks/useAuthFilesBatchSettings';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, load: vi.fn(async () => undefined), replace: vi.fn(), deselect: vi.fn() }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: mocks.t }),
}));
beforeEach(() => { vi.restoreAllMocks(); mocks.load.mockClear(); mocks.replace.mockClear(); mocks.deselect.mockClear(); });
const files = [{ name: 'first.json', type: 'codex' }, { name: 'second.json', type: 'claude' }];
const options = { files, disableControls: false, loadFiles: mocks.load, replaceSelection: mocks.replace, deselectAll: mocks.deselect };
function Harness() {
  const editor = useAuthFilesBatchSettings(options);
  return <>
    <button onClick={() => editor.openBatchSettings(files.map((file) => file.name))}>open</button>
    <AuthFilesBatchSettingsModal disableControls={false} state={editor.batchSettings}
      dirty={editor.batchSettingsDirty} conversionTask={editor.conversionTask}
      conversionRefreshing={editor.conversionRefreshing} conversionCanceling={editor.conversionCanceling}
      onClose={editor.closeBatchSettings} onSave={editor.saveBatchSettings}
      onChange={editor.handleBatchSettingsChange} onRefreshConversionTask={editor.refreshConversionTask}
      onCancelConversionTask={editor.cancelConversionTask} />
  </>;
}
function selectMode(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'ai_providers.weight_label' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

test('batch modal requires an explicit operation and retries only failed credentials', async () => {
  const saved: Record<string, { weight?: number }> = { 'first.json': { weight: 5 }, 'second.json': { weight: 7 } };
  const request = vi.spyOn(apiClient, 'requestRaw').mockImplementation(async (config) => {
    const { names, fields } = config.data as { names: string[]; fields: { weight: number | null } };
    expect(Object.keys(fields)).toEqual(['weight']);
    const failures = request.mock.calls.length === 1 ? [{ name: 'second.json', error: 'rejected second' }] : [];
    const updated = names.filter((name) => !failures.some((failure) => failure.name === name));
    for (const name of updated) {
      if (fields.weight === null) delete saved[name].weight;
      else saved[name].weight = fields.weight;
    }
    return { data: { status: failures.length ? 'partial' : 'ok', matched: names.length, updated: updated.length, files: updated, failed: failures } } as never;
  });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  expect(screen.queryByRole('spinbutton', { name: 'ai_providers.weight_label' })).toBeNull();
  expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
  selectMode('ai_providers.weight_set');
  const weight = screen.getByRole('spinbutton', { name: 'ai_providers.weight_label' });
  expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(weight, { target: { value: '1.5' } });
  expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(weight, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(['second.json']));
  expect(saved['first.json'].weight).toBe(0);
  expect(saved['second.json'].weight).toBe(7);
  await waitFor(() => expect((screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(saved['second.json'].weight).toBe(0));
  expect(request.mock.lastCall?.[0].data).toEqual({ names: ['second.json'], fields: { weight: 0 } });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  selectMode('ai_providers.weight_inherit');
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(saved['first.json']).not.toHaveProperty('weight'));
  expect(saved['second.json']).not.toHaveProperty('weight');
  expect(request.mock.lastCall?.[0].data).toEqual({ names: ['first.json', 'second.json'], fields: { weight: null } });
});

test('default batch operation leaves weights alone and rejects invalid set values', async () => {
  const patch = vi.spyOn(authFilesApi, 'patchFieldsBatch').mockResolvedValue({ status: 'ok', matched: 2, updated: 2, files: files.map((file) => file.name), failed: [] });
  const { result } = renderHook(() => useAuthFilesBatchSettings(options));
  act(() => result.current.openBatchSettings(files.map((file) => file.name)));
  act(() => result.current.handleBatchSettingsChange('weight', '0'));
  act(() => result.current.handleBatchSettingsChange('weightMode', 'unknown'));
  expect(result.current.batchSettingsDirty).toBe(false);
  act(() => result.current.handleBatchSettingsChange('note', 'updated note'));
  await act(async () => result.current.saveBatchSettings());
  expect(patch).toHaveBeenCalledWith(['first.json', 'second.json'], { note: 'updated note' });
  act(() => result.current.openBatchSettings(files.map((file) => file.name)));
  act(() => result.current.handleBatchSettingsChange('weightMode', 'set'));
  for (const value of ['', '1.5', '-1', '1000001', 'NaN']) {
    act(() => result.current.handleBatchSettingsChange('weight', value));
    await act(async () => result.current.saveBatchSettings());
    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.batchSettingsDirty).toBe(true);
  }
  act(() => result.current.handleBatchSettingsChange('weight', '1000000'));
  await act(async () => result.current.saveBatchSettings());
  expect(patch).toHaveBeenLastCalledWith(['first.json', 'second.json'], { weight: 1_000_000 });
});
