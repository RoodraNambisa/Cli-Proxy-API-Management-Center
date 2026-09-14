import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import {
  useAuthFilesPrefixProxyEditor,
  buildAuthFileFieldsPatch,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { grokAccountUpstream, normalizeGrokBaseUrl } from '@/utils/grokUpstream';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const file = { name: 'grok-upstream.json', type: 'xai' };
function Harness() {
  const state = useAuthFilesPrefixProxyEditor({
    disableControls: false,
    loadFiles: async () => {},
  });
  return (
    <>
      <button onClick={() => void state.openPrefixProxyEditor(file)}>open</button>
      <AuthFilesPrefixProxyEditorModal
        disableControls={false}
        editor={state.prefixProxyEditor}
        updatedText={state.prefixProxyUpdatedText}
        dirty={state.prefixProxyDirty}
        onClose={state.closePrefixProxyEditor}
        onCopyText={() => {}}
        onSave={() => void state.handlePrefixProxySave()}
        onChange={state.handlePrefixProxyChange}
      />
    </>
  );
}
function selectUpstream(mode: string) {
  fireEvent.click(screen.getByRole('button', { name: 'grok_upstream.account_label' }));
  fireEvent.click(screen.getByRole('option', { name: `grok_upstream.modes.${mode}` }));
}

describe('Grok upstream settings', () => {
  it('saves a region, custom URL and inheritance through the credential modal using only base_url', async () => {
    const stored = {
      type: 'xai',
      base_url: 'https://api.x.ai/v1',
      using_api: false,
      access_token: 'fixture-token',
      extension: 'keep',
    };
    vi.spyOn(authFilesApi, 'downloadText').mockImplementation(async () => JSON.stringify(stored));
    const request = vi.spyOn(apiClient, 'requestRaw').mockImplementation(async (config) => {
      const { fields } = config.data as { fields: { base_url: string } };
      expect(config.url).toBe('/auth-files/fields');
      expect(Object.keys(fields)).toEqual(['base_url']);
      stored.base_url = fields.base_url;
      return {
        data: { status: 'ok', matched: 1, updated: 1, files: [file.name], failed: [] },
      } as never;
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByRole('button', { name: 'grok_upstream.account_label' });
    expect((screen.getByLabelText('grok_upstream.base_url_label') as HTMLInputElement).value).toBe(
      'https://api.x.ai/v1'
    );
    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
    ).toBe(true);
    for (const [mode, url] of [
      ['us-east-1', 'https://us-east-1.api.x.ai/v1'],
      ['custom', 'https://relay.example/grok/v1'],
      ['inherit', ''],
    ]) {
      selectUpstream(mode);
      if (mode === 'custom') {
        const input = screen.getByLabelText('grok_upstream.base_url_label');
        fireEvent.change(input, { target: { value: 'https://user:secret@relay.example/v1' } });
        expect(
          (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
        ).toBe(true);
        fireEvent.change(input, { target: { value: ' https://RELAY.example/grok/v1/ ' } });
      }
      if (mode === 'inherit')
        expect(screen.queryByLabelText('grok_upstream.base_url_label')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await waitFor(() => expect(stored.base_url).toBe(url));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'grok_upstream.account_label' })).toBeNull()
      );
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
      const choice = await screen.findByRole('button', { name: 'grok_upstream.account_label' });
      expect(choice.textContent).toContain(`grok_upstream.modes.${mode}`);
    }
    expect(request).toHaveBeenCalledTimes(3);
    expect(stored).toMatchObject({ access_token: 'fixture-token', extension: 'keep' });
  });

  it('keeps upstream fields out of other providers and unrelated edits', () => {
    expect(buildAuthFileFieldsPatch({}, { base_url: 'https://api.x.ai/v1' }, false, false)).toEqual(
      {}
    );
    expect(
      buildAuthFileFieldsPatch(
        { base_url: 'https://api.x.ai/v1', using_api: false },
        { base_url: 'https://api.x.ai/v1', using_api: false, note: 'note' },
        false,
        false,
        true
      )
    ).toEqual({ note: 'note' });
    expect(
      buildAuthFileFieldsPatch(
        { base_url: '', using_api: true },
        { base_url: '', using_api: false },
        false,
        false,
        true
      )
    ).toEqual({ base_url: '' });
  });

  it('recognizes explicit API pins regardless of legacy flags and validates relay addresses', () => {
    expect(grokAccountUpstream('')).toBe('inherit');
    expect(grokAccountUpstream('HTTPS://API.X.AI:443/v1/')).toBe('api');
    expect(grokAccountUpstream('http://localhost:8080/gateway/v1')).toBe('custom');
    for (const value of [
      'file:///tmp/socket',
      'https://user:secret@api.x.ai/v1',
      'https://api.x.ai/v1?',
      'https://api.x.ai/v1#',
      'https://api.x.ai/v1?token=secret',
      'https://api.x.ai/\\evil',
    ]) {
      expect(normalizeGrokBaseUrl(value), value).toBeNull();
    }
  });
});
