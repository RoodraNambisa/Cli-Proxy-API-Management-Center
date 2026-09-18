import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { parseProxyBindingText } from '@/utils/proxyBinding';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const binding = { version: 1, node_id: 'a'.repeat(64), port: 1080, placeholders: ['session-old'] };
const nextBinding = { ...binding, node_id: 'b'.repeat(64), port: 2080 };
const original = {
  type: 'codex',
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  openai_device_id: 'fixture-device',
  priority: 2,
  proxy_binding: binding,
  custom: { preserve: true },
};
const file = { name: 'editor.json', type: 'codex' };
const loaded = vi.fn(async () => {});
function Harness() {
  const editor = useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: loaded });
  return (
    <>
      <button onClick={() => void editor.openPrefixProxyEditor(file)}>open</button>
      <AuthFilesPrefixProxyEditorModal
        disableControls={false}
        editor={editor.prefixProxyEditor}
        updatedText={editor.prefixProxyUpdatedText}
        dirty={editor.prefixProxyDirty}
        onClose={editor.closePrefixProxyEditor}
        onCopyText={vi.fn()}
        onSave={() => void editor.handlePrefixProxySave()}
        onChange={editor.handlePrefixProxyChange}
      />
    </>
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  loaded.mockClear();
  vi.spyOn(authFilesApi, 'downloadText').mockResolvedValue(JSON.stringify(original));
});

describe('credential JSON editor', () => {
  it('syncs JSON and form edits and saves the complete object with its original snapshot', async () => {
    const save = vi.spyOn(authFilesApi, 'replaceContent').mockResolvedValue({ status: 'ok' });
    const patch = vi.spyOn(authFilesApi, 'patchFieldsBatch');
    render(<Harness />);
    fireEvent.click(screen.getByText('open'));
    const json = (await screen.findByRole('textbox', {
      name: 'auth_files.prefix_proxy_source_label',
    })) as HTMLTextAreaElement;
    expect(json.readOnly).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
    ).toBe(true);
    const draft = {
      ...original,
      priority: 5,
      proxy_binding: nextBinding,
      added: ['kept', { nested: true }],
    };
    const raw = JSON.stringify(draft, null, 4) + '\n';
    fireEvent.change(json, { target: { value: raw } });
    expect(json.value).toBe(raw);
    expect((screen.getByLabelText('auth_files.priority_label') as HTMLInputElement).value).toBe(
      '5'
    );
    expect(
      JSON.parse(
        (screen.getByLabelText('auth_files.proxy_binding_label') as HTMLTextAreaElement).value
      )
    ).toEqual(nextBinding);
    fireEvent.change(screen.getByLabelText('auth_files.proxy_url_label'), {
      target: { value: 'http://proxy.example:8080' },
    });
    expect(JSON.parse(json.value)).toEqual({ ...draft, proxy_url: 'http://proxy.example:8080' });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        file.name,
        original,
        { ...draft, proxy_url: 'http://proxy.example:8080' },
        expect.any(Object)
      )
    );
    expect(patch).not.toHaveBeenCalled();
  });

  it('patches only proxy_binding, including clearing it, without uploading tokens', async () => {
    const patch = vi
      .spyOn(authFilesApi, 'patchFieldsBatch')
      .mockResolvedValue({ status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] });
    const save = vi.spyOn(authFilesApi, 'replaceContent');
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: loaded })
    );
    await act(async () => result.current.openPrefixProxyEditor(file));
    act(() =>
      result.current.handlePrefixProxyChange('proxyBindingText', JSON.stringify(nextBinding))
    );
    expect(JSON.parse(result.current.prefixProxyUpdatedText).proxy_binding).toEqual(nextBinding);
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenLastCalledWith([file.name], { proxy_binding: nextBinding });
    await act(async () => result.current.openPrefixProxyEditor(file));
    act(() => result.current.handlePrefixProxyChange('proxyBindingText', ''));
    await act(async () => result.current.handlePrefixProxySave());
    expect(patch).toHaveBeenLastCalledWith([file.name], { proxy_binding: null });
    expect(save).not.toHaveBeenCalled();
  });

  it('retains incomplete JSON and invalid binding drafts without sending a request', async () => {
    const save = vi.spyOn(authFilesApi, 'replaceContent');
    render(<Harness />);
    fireEvent.click(screen.getByText('open'));
    const json = (await screen.findByRole('textbox', {
      name: 'auth_files.prefix_proxy_source_label',
    })) as HTMLTextAreaElement;
    fireEvent.change(json, { target: { value: '{"type":' } });
    expect(json.value).toBe('{"type":');
    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('auth_files.prefix_proxy_invalid_json');
    fireEvent.change(json, {
      target: {
        value: JSON.stringify({ ...original, proxy_binding: { version: 1, node_id: 'bad' } }),
      },
    });
    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('auth_files.proxy_binding_invalid');
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves the draft when a refreshed credential causes a conflict', async () => {
    const save = vi
      .spyOn(authFilesApi, 'replaceContent')
      .mockRejectedValue(Object.assign(new Error('changed'), { status: 409 }));
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: loaded })
    );
    await act(async () => result.current.openPrefixProxyEditor(file));
    const draft = { ...original, new_field: 'keep this draft' };
    act(() => result.current.handlePrefixProxyChange('rawText', JSON.stringify(draft)));
    await act(async () => result.current.handlePrefixProxySave());
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.prefixProxyEditor?.saving).toBe(false);
    expect(result.current.prefixProxyEditor?.error).toBe('auth_files.json_conflict');
    expect(JSON.parse(result.current.prefixProxyUpdatedText)).toEqual(draft);
    expect(loaded).not.toHaveBeenCalled();
  });

  it('preserves raw JSON removals and does not add unrelated defaults', async () => {
    const save = vi.spyOn(authFilesApi, 'replaceContent').mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: loaded })
    );
    await act(async () => result.current.openPrefixProxyEditor(file));
    const draft = { type: 'codex', access_token: 'changed-by-user' };
    act(() => result.current.handlePrefixProxyChange('rawText', JSON.stringify(draft)));
    expect(result.current.prefixProxyEditor?.proxyBindingText).toBe('');
    await act(async () => result.current.handlePrefixProxySave());
    expect(save).toHaveBeenCalledWith(file.name, original, draft, expect.any(Object));
  });

  it('does not save an old draft to a different server', async () => {
    const save = vi.spyOn(authFilesApi, 'replaceContent');
    const initial = apiClient.captureConnection();
    const connection = vi.spyOn(apiClient, 'captureConnection').mockReturnValue(initial);
    const { result } = renderHook(() =>
      useAuthFilesPrefixProxyEditor({ disableControls: false, loadFiles: loaded })
    );
    await act(async () => result.current.openPrefixProxyEditor(file));
    act(() =>
      result.current.handlePrefixProxyChange(
        'rawText',
        JSON.stringify({ ...original, note: 'draft' })
      )
    );
    connection.mockReturnValue({ ...initial, apiBase: 'https://different.example' });
    await act(async () => result.current.handlePrefixProxySave());
    expect(save).not.toHaveBeenCalled();
  });
});

describe('proxy_binding validation', () => {
  it('accepts node references, direct references and clearing', () => {
    for (const value of [binding, { version: 1, direct: true }, null]) {
      expect(parseProxyBindingText(JSON.stringify(value))).toEqual({ value, invalid: false });
    }
    expect(parseProxyBindingText('')).toEqual({ value: null, invalid: false });
  });
  it('rejects malformed references without changing the input', () => {
    for (const value of [
      [],
      'text',
      {},
      { ...binding, port: 0 },
      { ...binding, port: 65536 },
      { ...binding, port: 1.5 },
      { ...binding, node_id: 'x'.repeat(64) },
      { ...binding, password: 'no' },
      { version: 1, direct: true, placeholders: {} },
      { version: 1, direct: true, node_id: 0 },
    ]) {
      expect(parseProxyBindingText(JSON.stringify(value)).invalid).toBe(true);
    }
  });
});
