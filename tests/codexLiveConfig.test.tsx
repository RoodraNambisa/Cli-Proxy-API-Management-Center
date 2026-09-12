import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Codex Live admission configuration', () => {
  test.each(['{}\n', 'codex: {live-enabled: null, future: retained}\n'])(
    'defaults off, becomes dirty, and retains both saved values: %s', (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexLiveEnabled).toBe(false);
      act(() => result.current.setVisualValues({ codexLiveEnabled: true }));
      expect(result.current.visualDirtyFields).toContain('codexLiveEnabled');
      const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-codex')!;
      expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved).codex['live-enabled']).toBe(true);
      if (original.includes('future')) expect(parse(saved).codex.future).toBe('retained');
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.codexLiveEnabled).toBe(true);
      act(() => result.current.setVisualValues({ codexLiveEnabled: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.codexLiveEnabled).toBe(false);
    }
  );

  test('accepts aliases with explicit canonical false/null taking precedence', () => {
    for (const name of ['live-enabled', 'liveEnabled']) {
      for (const value of [true, false]) {
        expect(normalizeConfigResponse({ codex: { [name]: value } }).codex?.liveEnabled).toBe(value);
      }
    }
    for (const value of [false, null]) {
      expect(normalizeConfigResponse({ codex: { 'live-enabled': value, liveEnabled: true } }).codex?.liveEnabled).toBe(false);
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(`codex: {live-enabled: ${value}, liveEnabled: true}\n`));
      expect(result.current.visualValues.codexLiveEnabled).toBe(false);
    }
    const original = 'defaults: &defaults {liveEnabled: true, future: retained}\ncodex: *defaults\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexLiveEnabled).toBe(true);
    act(() => result.current.setVisualValues({ codexLiveEnabled: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex).toMatchObject({ 'live-enabled': false, future: 'retained' });
    expect(saved.codex).not.toHaveProperty('liveEnabled');
    expect(saved.defaults.liveEnabled).toBe(true);
  });

  test.each([1, 'false', [], {}])('rejects invalid API and YAML types: %j', (value) => {
    expect(() => normalizeConfigResponse({ codex: { 'live-enabled': value } })).toThrow('live-enabled');
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`codex: {live-enabled: ${JSON.stringify(value)}}\n`));
    expect(result.current.visualParseError).toContain('live-enabled');
  });

  test('renders a separate searchable realtime switch and explains established sessions in four languages', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=config-codex-live']}>
        <VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={onChange} renderRequestBodyPanels={() => null} />
      </MemoryRouter>
    );
    const toggle = screen.getByRole('checkbox', { name: 'config_management.visual.sections.codex_live.enabled' });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(toggle.closest('#codex-live')?.id).toBe('codex-live');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ codexLiveEnabled: true });
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-live')!;
    expect(entry.yamlKeys).toContain('codex.live-enabled');
    expect(document.getElementById(entry.id)).not.toBeNull();
    for (const locale of [en, ru, zhCN, zhTW]) {
      for (const text of Object.values(locale.config_management.visual.sections.codex_live)) {
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });
});
