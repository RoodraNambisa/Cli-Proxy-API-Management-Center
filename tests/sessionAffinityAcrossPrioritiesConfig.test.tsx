import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useConfigStore } from '@/stores/useConfigStore';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('session affinity across priorities configuration data', () => {
  test('explicit canonical null keeps default off instead of a shadowing alias', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-across-priorities: null\n  sessionAffinityAcrossPriorities: true\n'));
    expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
    expect(normalizeConfigResponse({ routing: {
      'session-affinity-across-priorities': null,
      sessionAffinityAcrossPriorities: true,
    } }).routingSessionAffinityAcrossPriorities).toBeUndefined();
  });

  test.each(['request-retry: 2\n', 'routing:\n  session-affinity: false\n  future-setting: kept\n'])(
    'keeps default off, saves both values and preserves unrelated YAML',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
      act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: true }));
      expect(result.current.visualDirtyFields).toContain('routingSessionAffinityAcrossPriorities');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved).routing['session-affinity-across-priorities']).toBe(true);
      expect(result.current.visualValues.routingSessionAffinity).toBe(false);
      if (original.includes('future-setting')) {
        expect(parse(saved).routing['future-setting']).toBe('kept');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
      act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      expect(parse(disabled).routing['session-affinity-across-priorities']).toBe(false);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
    }
  );

  test('reads API aliases, updates cache and canonicalizes edited YAML', () => {
    for (const field of ['session-affinity-across-priorities', 'sessionAffinityAcrossPriorities']) {
      for (const value of [true, false]) {
        expect(normalizeConfigResponse({ routing: { [field]: value } }).routingSessionAffinityAcrossPriorities).toBe(value);
      }
    }
    const previous = useConfigStore.getState();
    try {
      useConfigStore.getState().updateConfigValue('routing/session-affinity-across-priorities', true);
      expect(useConfigStore.getState().config?.routingSessionAffinityAcrossPriorities).toBe(true);
    } finally {
      useConfigStore.setState(previous, true);
    }
    const original = 'routing:\n  sessionAffinityAcrossPriorities: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
    act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.routing['session-affinity-across-priorities']).toBe(false);
    expect(saved.routing).not.toHaveProperty('sessionAffinityAcrossPriorities');
    act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML value %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-across-priorities: ' + value + '\n'));
    expect(result.current.visualParseError).toContain('session-affinity-across-priorities');
  });
});

test('exposes a searchable translated switch and keeps its saved value', () => {
  const original = 'routing:\n  session-affinity: true\n  future-setting: kept\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  render(
    <MemoryRouter initialEntries={['/config?section=config-session-affinity-across-priorities']}>
      <VisualConfigEditor
        values={result.current.visualValues}
        baselineValues={result.current.baselineValues}
        onChange={result.current.setVisualValues}
        renderRequestBodyPanels={() => null}
      />
    </MemoryRouter>
  );
  const label = 'config_management.visual.sections.network.session_affinity_across_priorities';
  const toggle = screen.getByRole('checkbox', { name: label });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  fireEvent.click(toggle);
  expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
  const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'global-network')!;
  expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(original);
  expect(parse(saved).routing).toMatchObject({
    'session-affinity': true,
    'session-affinity-across-priorities': true,
    'future-setting': 'kept',
  });
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
  expect(result.current.visualDirty).toBe(false);
  const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-session-affinity-across-priorities');
  expect(entry?.yamlKeys).toContain('routing.session-affinity-across-priorities');
  expect(document.getElementById(entry!.id)).not.toBeNull();
  for (const locale of [en, ru, zhCN, zhTW]) {
    expect(locale.config_management.visual.sections.network.session_affinity_across_priorities).toBeTruthy();
    expect(locale.config_management.visual.sections.network.session_affinity_across_priorities_desc).toBeTruthy();
  }
});
