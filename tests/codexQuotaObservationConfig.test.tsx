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

describe('Optional Codex passive quota observations', () => {
  test('defaults off and saves both directions without losing unknown or sensitive values', () => {
    const original = 'codex:\n  future-field: retained\n  passthrough-prompt-cache-key: true\ncodex-api-key:\n  - api-key: fixture-secret\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexObserveQuota).toBe(false);
    act(() => result.current.setVisualValues({ codexObserveQuota: true }));
    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('codexObserveQuota');
    const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-codex')!;
    expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved)).toMatchObject({ codex: { 'observe-quota': true, 'future-field': 'retained', 'passthrough-prompt-cache-key': true }, 'codex-api-key': [{ 'api-key': 'fixture-secret' }] });
    expect(result.current.visualDirty).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.codexObserveQuota).toBe(true);
    act(() => result.current.setVisualValues({ codexObserveQuota: false }));
    const disabled = result.current.applyVisualChangesToYaml(saved);
    act(() => result.current.loadVisualValuesFromYaml(disabled));
    expect(result.current.visualValues.codexObserveQuota).toBe(false);
  });

  test('creates a missing Codex section and clears dirty state when reverted', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ codexObserveQuota: true }));
    expect(parse(result.current.applyVisualChangesToYaml('port: 8317\n')).codex['observe-quota']).toBe(true);
    act(() => result.current.setVisualValues({ codexObserveQuota: false }));
    expect(result.current.visualDirty).toBe(false);
  });

  test('normalizes API aliases and writes only the canonical YAML key', () => {
    expect(normalizeConfigResponse({ codex: {} }).codex?.observeQuota).toBe(false);
    for (const name of ['observe-quota', 'observeQuota']) {
      for (const value of [false, true]) {
        expect(normalizeConfigResponse({ codex: { [name]: value } }).codex?.observeQuota).toBe(value);
      }
    }
    const original = 'codex:\n  observeQuota: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexObserveQuota).toBe(true);
    act(() => result.current.setVisualValues({ codexObserveQuota: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex['observe-quota']).toBe(false);
    expect(saved.codex).not.toHaveProperty('observeQuota');
  });

  test.each(['1', '[]', '"false"'])('rejects invalid YAML type %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`codex:\n  observe-quota: ${value}\n`));
    expect(result.current.visualParseError).toContain('observe-quota');
  });

  test('renders a searchable switch with four translations', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=config-codex-quota-observation']}>
        <VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={onChange} renderRequestBodyPanels={() => null} />
      </MemoryRouter>
    );
    const title = 'config_management.visual.sections.network.codex_observe_quota';
    fireEvent.click(screen.getByRole('checkbox', { name: title }));
    expect(onChange).toHaveBeenCalledWith({ codexObserveQuota: true });
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-quota-observation');
    expect(entry?.yamlKeys).toContain('codex.observe-quota');
    expect(document.getElementById(entry!.id)).not.toBeNull();
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.config_management.visual.sections.network.codex_observe_quota).toBeTruthy();
      expect(locale.config_management.visual.sections.network.codex_observe_quota_desc).toBeTruthy();
    }
  });
});
