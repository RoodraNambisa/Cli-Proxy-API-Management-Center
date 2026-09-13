import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useConfigStore } from '@/stores/useConfigStore';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

test.each(['request-retry: 2\n', 'routing:\n  future-setting: kept\n', 'routing:\n  session-affinity-use-history: null\n  sessionAffinityUseHistory: false\n'])(
  'defaults to enabled and persists an explicit disable without enabling affinity', (original) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingSessionAffinityUseHistory).toBe(true);
    act(() => result.current.setVisualValues({ routingSessionAffinityUseHistory: false }));
    expect(result.current.visualDirtyFields).toContain('routingSessionAffinityUseHistory');
    const page = CONFIG_PAGE_DEFINITIONS.find((item) => item.id === 'global-network')!;
    expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved).routing['session-affinity-use-history']).toBe(false);
    expect(parse(saved).routing).not.toHaveProperty('sessionAffinityUseHistory');
    expect(result.current.visualValues.routingSessionAffinity).toBe(false);
    if (original.includes('future-setting')) expect(parse(saved).routing['future-setting']).toBe('kept');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.routingSessionAffinityUseHistory).toBe(false);
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ routingSessionAffinityUseHistory: true }));
    expect(parse(result.current.applyVisualChangesToYaml(saved)).routing['session-affinity-use-history']).toBe(true);
  }
);

test('unchanged default does not add a routing history field', () => {
  const { result } = renderHook(() => useVisualConfig());
  const original = 'debug: false\n';
  act(() => result.current.loadVisualValuesFromYaml(original));
  act(() => result.current.setVisualValues({ debug: true }));
  expect(result.current.applyVisualChangesToYaml(original)).not.toContain('session-affinity-use-history');
});

test.each(['1', '[]', '{}', '"false"', 'yes'])('rejects invalid history policy %s', (value) => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-use-history: ' + value + '\n'));
  expect(result.current.visualParseError).toContain('session-affinity-use-history');
});

test('normalizes canonical and alias values and updates the configuration cache', () => {
  for (const key of ['session-affinity-use-history', 'sessionAffinityUseHistory']) {
    for (const value of [true, false]) {
      expect(normalizeConfigResponse({ routing: { [key]: value } }).routingSessionAffinityUseHistory).toBe(value);
    }
  }
  expect(normalizeConfigResponse({ routing: { 'session-affinity-use-history': null, sessionAffinityUseHistory: false } }).routingSessionAffinityUseHistory).toBe(true);
  const previous = useConfigStore.getState();
  try {
    useConfigStore.getState().updateConfigValue('routing/session-affinity-use-history', false);
    expect(useConfigStore.getState().config?.routingSessionAffinityUseHistory).toBe(false);
  } finally {
    useConfigStore.setState(previous, true);
  }
});

function HistorySwitchFixture() {
  const { visualValues, baselineValues, setVisualValues } = useVisualConfig();
  return <VisualConfigEditor values={visualValues} baselineValues={baselineValues} onChange={setVisualValues} renderRequestBodyPanels={() => null} />;
}

test('disables prefix affinity controls without losing their saved preference', () => {
  render(<MemoryRouter initialEntries={['/config?section=config-session-affinity-use-history']}><HistorySwitchFixture /></MemoryRouter>);
  const history = screen.getByRole('checkbox', { name: 'config_management.visual.sections.network.session_affinity_use_history' }) as HTMLInputElement;
  const prefix = screen.getByRole('checkbox', { name: 'config_management.visual.sections.network.session_affinity_lcp' }) as HTMLInputElement;
  expect(history.checked).toBe(true);
  expect(prefix.disabled).toBe(false);
  fireEvent.click(prefix);
  expect(prefix.checked).toBe(true);
  fireEvent.click(history);
  expect(prefix.disabled).toBe(true);
  expect(prefix.checked).toBe(true);
  expect(document.getElementById('config-session-affinity-lcp')?.textContent).toContain('session_affinity_lcp_paused');
  fireEvent.click(history);
  expect(prefix.disabled).toBe(false);
  expect(prefix.checked).toBe(true);
  const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-session-affinity-use-history');
  expect(entry?.yamlKeys).toContain('routing.session-affinity-use-history');
  expect(document.getElementById(entry!.id)).not.toBeNull();
  for (const locale of [en, zhCN, zhTW, ru]) {
    expect(locale.config_management.visual.sections.network.session_affinity_use_history).toBeTruthy();
    expect(locale.config_management.visual.sections.network.session_affinity_use_history_desc).toBeTruthy();
  }
});
