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

describe('Codex orphan delegation configuration', () => {
  test('defaults off and round trips without changing retry budgets or unknown fields', () => {
    const original = 'request-retry: 2\nmax-retry-credentials: 3\ncodex:\n  future-field: retained\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexOrphanDelegationCompatibility).toBe(false);
    act(() => result.current.setVisualValues({ codexOrphanDelegationCompatibility: true }));
    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('codexOrphanDelegationCompatibility');
    const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-codex')!;
    expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved)).toMatchObject({
      'request-retry': 2, 'max-retry-credentials': 3,
      codex: { 'orphan-delegation-compatibility': true, 'future-field': 'retained' },
    });
    expect(result.current.visualDirty).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.codexOrphanDelegationCompatibility).toBe(true);
    act(() => result.current.setVisualValues({ codexOrphanDelegationCompatibility: false }));
    const disabled = result.current.applyVisualChangesToYaml(saved);
    act(() => result.current.loadVisualValuesFromYaml(disabled));
    expect(result.current.visualValues.codexOrphanDelegationCompatibility).toBe(false);
  });

  test('normalizes API aliases and canonicalizes YAML', () => {
    for (const name of ['orphan-delegation-compatibility', 'orphanDelegationCompatibility']) {
      expect(normalizeConfigResponse({ codex: { [name]: true } }).codex?.orphanDelegationCompatibility).toBe(true);
      expect(normalizeConfigResponse({ codex: { [name]: false } }).codex?.orphanDelegationCompatibility).toBe(false);
    }
    const original = 'codex:\n  orphanDelegationCompatibility: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexOrphanDelegationCompatibility).toBe(true);
    act(() => result.current.setVisualValues({ codexOrphanDelegationCompatibility: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex['orphan-delegation-compatibility']).toBe(false);
    expect(saved.codex).not.toHaveProperty('orphanDelegationCompatibility');
  });

  test.each(['1', '[]', '"false"'])('rejects invalid YAML type %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`codex:\n  orphan-delegation-compatibility: ${value}\n`));
    expect(result.current.visualParseError).toContain('orphan-delegation-compatibility');
  });

  test('renders a searchable switch with four translations', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={onChange} renderRequestBodyPanels={() => null} />
      </MemoryRouter>
    );
    const title = 'config_management.visual.sections.network.codex_orphan_delegation_compatibility';
    fireEvent.click(screen.getByRole('checkbox', { name: title }));
    expect(onChange).toHaveBeenCalledWith({ codexOrphanDelegationCompatibility: true });
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-orphan-delegation');
    expect(entry?.yamlKeys).toContain('codex.orphan-delegation-compatibility');
    expect(document.getElementById(entry!.id)).not.toBeNull();
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.config_management.visual.sections.network.codex_orphan_delegation_compatibility).toBeTruthy();
      expect(locale.config_management.visual.sections.network.codex_orphan_delegation_compatibility_desc).toBeTruthy();
    }
  });
});
