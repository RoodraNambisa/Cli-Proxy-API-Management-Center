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

describe('session affinity subagent configuration data', () => {
  test('explicit canonical null keeps default off instead of a shadowing alias', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-subagents: null\n  sessionAffinitySubagents: true\n'));
    expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(false);
    expect(normalizeConfigResponse({ routing: {
      'session-affinity-subagents': null,
      sessionAffinitySubagents: true,
    } }).routingSessionAffinitySubagents).toBeUndefined();
  });

  test.each(['request-retry: 2\n', 'routing:\n  session-affinity: false\n  future-setting: kept\n'])(
    'keeps default off, saves both values and preserves unrelated YAML',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(false);
      act(() => result.current.setVisualValues({ routingSessionAffinitySubagents: true }));
      expect(result.current.visualDirtyFields).toContain('routingSessionAffinitySubagents');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved).routing['session-affinity-subagents']).toBe(true);
      expect(result.current.visualValues.routingSessionAffinity).toBe(false);
      if (original.includes('future-setting')) {
        expect(parse(saved).routing['future-setting']).toBe('kept');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(true);
      act(() => result.current.setVisualValues({ routingSessionAffinitySubagents: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      expect(parse(disabled).routing['session-affinity-subagents']).toBe(false);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(false);
    }
  );

  test('reads API aliases, updates cache and canonicalizes edited YAML', () => {
    for (const field of ['session-affinity-subagents', 'sessionAffinitySubagents']) {
      for (const value of [true, false]) {
        expect(normalizeConfigResponse({ routing: { [field]: value } }).routingSessionAffinitySubagents).toBe(value);
      }
    }
    const previous = useConfigStore.getState();
    try {
      useConfigStore.getState().updateConfigValue('routing/session-affinity-subagents', true);
      expect(useConfigStore.getState().config?.routingSessionAffinitySubagents).toBe(true);
    } finally {
      useConfigStore.setState(previous, true);
    }
    const original = 'routing:\n  sessionAffinitySubagents: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(true);
    act(() => result.current.setVisualValues({ routingSessionAffinitySubagents: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.routing['session-affinity-subagents']).toBe(false);
    expect(saved.routing).not.toHaveProperty('sessionAffinitySubagents');
    act(() => result.current.setVisualValues({ routingSessionAffinitySubagents: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML value %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-subagents: ' + value + '\n'));
    expect(result.current.visualParseError).toContain('session-affinity-subagents');
  });
});

test('exposes a searchable translated switch and keeps its saved value', () => {
  const original = 'routing:\n  session-affinity: true\n  future-setting: kept\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  render(
    <MemoryRouter initialEntries={['/config?section=config-session-affinity-subagents']}>
      <VisualConfigEditor
        values={result.current.visualValues}
        baselineValues={result.current.baselineValues}
        onChange={result.current.setVisualValues}
        renderRequestBodyPanels={() => null}
      />
    </MemoryRouter>
  );
  const label = 'config_management.visual.sections.network.session_affinity_subagents';
  const toggle = screen.getByRole('checkbox', { name: label });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  fireEvent.click(toggle);
  expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(true);
  const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'global-network')!;
  expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(original);
  expect(parse(saved).routing).toMatchObject({
    'session-affinity': true,
    'session-affinity-subagents': true,
    'future-setting': 'kept',
  });
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(true);
  expect(result.current.visualDirty).toBe(false);
  const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-session-affinity-subagents');
  expect(entry?.yamlKeys).toContain('routing.session-affinity-subagents');
  expect(document.getElementById(entry!.id)).not.toBeNull();
  for (const locale of [en, ru, zhCN, zhTW]) {
    expect(locale.config_management.visual.sections.network.session_affinity_subagents).toBeTruthy();
    expect(locale.config_management.visual.sections.network.session_affinity_subagents_desc).toBeTruthy();
  }
});
