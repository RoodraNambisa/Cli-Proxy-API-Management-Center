import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parse } from 'yaml';
import { expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));

test.each([true, false, undefined])('unrelated visual saves preserve capability %s and YAML structure', (enabled) => {
  const field = enabled === undefined ? '' : `, alpha-search: ${enabled}`;
  const yaml = `# retain\nkey: &key {api-key: fixture, base-url: "https://example.invalid", future: keep${field}}\ncodex-api-key: [*key]\nrequest-retry: 1\n`;
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  act(() => result.current.setVisualValues({ requestRetry: '2' }));
  const saved = result.current.applyVisualChangesToYaml(yaml);
  expect(saved).toContain('# retain');
  expect(parse(saved)['codex-api-key']).toEqual(parse(yaml)['codex-api-key']);
  expect(normalizeConfigResponse(parse(saved)).codexApiKeys?.[0].alphaSearch).toBe(enabled);
  if (enabled === undefined) expect(saved).not.toContain('alpha-search');
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
});

test.each(['alpha-search', 'codex-api-key[0].alpha-search'])('search %s reaches the existing credential editor without a global switch', (query) => {
  const onChange = vi.fn();
  render(<MemoryRouter initialEntries={['/config?section=global-basics']}><Routes>
    <Route path="/config" element={<VisualConfigEditor values={DEFAULT_VISUAL_VALUES} baselineValues={DEFAULT_VISUAL_VALUES} onChange={onChange} renderRequestBodyPanels={() => null} />} />
    <Route path="/ai-providers" element={<div>provider editor</div>} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: /ai_providers.codex_alpha_search_label/ }));
  expect(document.getElementById('config-codex-alpha-search')?.closest('[hidden]')).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'ai_providers.codex_alpha_search_label' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'ai_providers.codex_alpha_search_manage' }));
  expect(screen.getByText('provider editor')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});

test.each([en, ru, zhCN, zhTW])('search capability controls and navigation have translated explanations', (locale) => {
  expect(locale.ai_providers.codex_alpha_search_label).toBeTruthy();
  expect(locale.ai_providers.codex_alpha_search_hint).toContain('/alpha/search');
  expect(locale.ai_providers.codex_alpha_search_manage).toBeTruthy();
  expect(CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-codex-alpha-search')?.yamlKeys).toContain('codex-api-key[].alpha-search');
});
