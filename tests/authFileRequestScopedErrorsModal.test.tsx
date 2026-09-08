import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, load: vi.fn(async () => {}) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
beforeEach(() => { vi.restoreAllMocks(); mocks.load.mockClear(); });
const file = { name: 'rules-test.json', type: 'codex' };
function Harness() {
  const state = useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: mocks.load });
  return <><button onClick={() => void state.openPrefixProxyEditor(file)}>open</button>
    <AuthFilesPrefixProxyEditorModal disableControls={false} editor={state.prefixProxyEditor}
      updatedText={state.prefixProxyUpdatedText} dirty={state.prefixProxyDirty}
      onClose={state.closePrefixProxyEditor} onCopyText={vi.fn()}
      onSave={() => void state.handlePrefixProxySave()} onChange={state.handlePrefixProxyChange} />
  </>;
}

test('auth modal saves rule-only changes, keeps rejected drafts and reloads clearing', async () => {
  const rule = { status: 500, action: 'stop', match: [' original '], future: 'keep' };
  const stored: Record<string, unknown> = { type: 'codex', 'request-scoped-errors': [rule], access_token: 'test-secret-kept', extension: 'keep' };
  vi.spyOn(authFilesApi, 'downloadText').mockImplementation(async () => JSON.stringify(stored));
  const request = vi.spyOn(apiClient, 'requestRaw').mockImplementation(async (config) => {
    const { fields } = config.data as { fields: Record<string, unknown> };
    expect(config.url).toBe('/auth-files/fields');
    expect(Object.keys(fields)).toEqual(['request_scoped_errors']);
    stored.request_scoped_errors = fields.request_scoped_errors;
    delete stored['request-scoped-errors'];
    return { data: { status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] } } as never;
  });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  const input = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  expect((input as HTMLTextAreaElement).value).toBe(' original ');
  const save = () => screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
  expect(save().disabled).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' }), { target: { value: '600' } });
  expect(save().disabled).toBe(true);
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' }), { target: { value: '503' } });
  fireEvent.change(input, { target: { value: ' changed\ntext ' } });
  request.mockRejectedValueOnce(new Error('server rule rejection'));
  fireEvent.click(save());
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(save().disabled).toBe(false));
  expect(stored['request-scoped-errors']).toEqual([rule]);
  expect((input as HTMLTextAreaElement).value).toBe(' changed\ntext ');
  fireEvent.click(save());
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'request_scoped_errors.match 1' })).toBeNull());
  expect(stored.request_scoped_errors).toEqual([{ ...rule, status: 503, match: [' changed\ntext '] }]);
  expect(stored.access_token).toBe('test-secret-kept');
  expect(stored.extension).toBe('keep');
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  const reloaded = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  expect((reloaded as HTMLTextAreaElement).value).toBe(' changed\ntext ');
  expect(save().disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
  fireEvent.click(save());
  await waitFor(() => expect(stored.request_scoped_errors).toEqual([]));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'request_scoped_errors.add_rule' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  await screen.findByRole('button', { name: 'request_scoped_errors.add_rule' });
  expect(screen.queryByRole('textbox', { name: 'request_scoped_errors.match 1' })).toBeNull();
  expect(save().disabled).toBe(true);
});
