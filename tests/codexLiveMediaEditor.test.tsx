import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { CodexLiveMediaEditor } from '@/components/config/CodexLiveMediaEditor';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { DEFAULT_CODEX_LIVE_MEDIA } from '@/types/codexLiveMedia';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }),
}));
const key = (field: string) => `config_management.visual.sections.codex_media.${field}`;

describe('Codex Live media editor', () => {
  test('uses bounded inputs, switches and a password field with editable ICE rows', () => {
    function Editor() {
      const [value, setValue] = useState(DEFAULT_CODEX_LIVE_MEDIA);
      return <CodexLiveMediaEditor value={value} onChange={setValue} />;
    }
    render(<Editor />);
    expect((screen.getByRole('checkbox', { name: key('enabled') }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('spinbutton', { name: key('max_sessions') }) as HTMLInputElement).max).toBe('2147483647');
    expect((screen.getByRole('spinbutton', { name: key('udp_max') }) as HTMLInputElement).max).toBe('65535');
    fireEvent.click(screen.getByRole('checkbox', { name: key('enabled') }));
    fireEvent.click(screen.getByRole('checkbox', { name: key('disable_private') }));
    fireEvent.click(screen.getByRole('button', { name: key('add_ice') }));
    fireEvent.change(screen.getByLabelText(key('ice_urls')), { target: { value: 'turn:fixture.invalid' } });
    expect(screen.getByText('config_management.visual.validation.codex_media_ice_credentials')).not.toBeNull();
    fireEvent.change(screen.getByLabelText(key('ice_username')), { target: { value: 'fixture-user' } });
    const password = screen.getByLabelText(key('ice_credential')) as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('off');
    fireEvent.change(password, { target: { value: 'fixture-secret' } });
    expect(screen.queryByText('config_management.visual.validation.codex_media_ice_credentials')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `${key('remove_ice')} 1` }));
    expect(screen.queryByLabelText(key('ice_urls'))).toBeNull();
  });

  test('is searchable within the existing Live section and has complete four-language text', () => {
    render(<MemoryRouter initialEntries={['/config?section=config-codex-live-media']}><VisualConfigEditor
      values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={vi.fn()} renderRequestBodyPanels={() => null}
    /></MemoryRouter>);
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-live-media')!;
    expect(entry.yamlKeys).toHaveLength(7);
    expect(document.getElementById(entry.id)?.closest('#codex-live')?.id).toBe('codex-live');
    expect(new Set(CONFIG_SEARCH_DEFINITIONS.map((item) => item.id)).size).toBe(CONFIG_SEARCH_DEFINITIONS.length);
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(Object.keys(locale.config_management.visual.sections.codex_media)).toEqual(Object.keys(en.config_management.visual.sections.codex_media));
      for (const text of Object.values(locale.config_management.visual.sections.codex_media)) expect(text.length).toBeGreaterThan(0);
      for (const code of ['codex_media_capacity', 'codex_media_ports', 'codex_media_ip', 'codex_media_ice_url', 'codex_media_ice_credentials'] as const)
        expect(locale.config_management.visual.validation[code].length).toBeGreaterThan(0);
    }
  });

  test('retains rejected edits and the original ICE secret until save and reload succeed', async () => {
    const original = 'codex: {live-media-relay: {enabled: false, ice-servers: [{urls: ["turn:fixture.invalid"], username: fixture-user, credential: fixture-secret}]}}\n';
    const save = vi.fn().mockRejectedValueOnce(new Error('rejected')).mockResolvedValue(undefined);
    function SaveFixture() {
      const config = useVisualConfig();
      const [yaml, setYaml] = useState(original);
      const [error, setError] = useState('');
      return <>
        <button onClick={() => config.loadVisualValuesFromYaml(yaml)}>Load fixture</button>
        <CodexLiveMediaEditor value={config.visualValues.codexLiveMediaRelay} onChange={(codexLiveMediaRelay) => config.setVisualValues({ codexLiveMediaRelay })} />
        <button disabled={!config.visualDirty} onClick={async () => {
          const next = config.applyVisualChangesToYaml(yaml);
          try { await save(next); setYaml(next); config.loadVisualValuesFromYaml(next); setError(''); } catch { setError('rejected'); }
        }}>Save fixture</button>
        <output>{error}</output>
      </>;
    }
    render(<SaveFixture />);
    fireEvent.click(screen.getByRole('button', { name: 'Load fixture' }));
    fireEvent.click(screen.getByRole('checkbox', { name: key('enabled') }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save fixture' })));
    expect(screen.getByText('rejected')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Save fixture' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText(key('ice_credential')) as HTMLInputElement).value).toBe('fixture-secret');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save fixture' })));
    expect((screen.getByRole('button', { name: 'Save fixture' }) as HTMLButtonElement).disabled).toBe(true);
    expect(parse(save.mock.calls[1][0]).codex['live-media-relay']).toMatchObject({ enabled: true, 'ice-servers': [{ credential: 'fixture-secret' }] });
    expect((screen.getByRole('checkbox', { name: key('enabled') }) as HTMLInputElement).checked).toBe(true);
  });
});
