import { useEffect } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { apiKeysApi } from '@/services/api/apiKeys';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { normalizeApiKeyName } from '@/utils/apiKeyGroups';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => vi.restoreAllMocks());
const label = 'config_management.visual.api_keys.';

test('normalizes optional names without changing restrictions', () => {
  const config = normalizeConfigResponse({ 'api-key-groups': [{ 'api-key': 'fixture', name: ' 工作 🔑 ', providers: ['codex'], 'allowed-priorities': [1] }] });
  expect(config.apiKeyGroups?.[0]).toMatchObject({ name: '工作 🔑', providers: ['codex'], allowedPriorities: [1] });
  expect(normalizeApiKeyName('🔑'.repeat(100))).toHaveLength(200);
  expect(normalizeApiKeyName('\u0085 Work \u0085')).toBe('Work');
  for (const invalid of ['a\nb', 'x'.repeat(101), 12, '\ud800']) expect(() => normalizeApiKeyName(invalid)).toThrow('name');
  expect(normalizeApiKeyName(null)).toBe('');
});

test('saves edited names into current YAML and preserves fresh restrictions and untouched names', () => {
  const initial = 'api-keys: [fixture, other]\napi-key-groups:\n  - api-key: fixture\n    name: Old\n    providers: [codex]\n  - api-key: other\n    name: Other\n';
  const latest = initial.replace('providers: [codex]', 'providers: [codex, xai]\n    allowed-priorities: [1]\n    future-field: preserved').replace('name: Other', 'name: External');
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(initial));
  act(() => result.current.setVisualValues({ apiKeyNames: { fixture: 'Work', other: 'Other' } }));
  expect(result.current.visualDirty).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(latest);
  expect(parse(saved)['api-key-groups']).toEqual([
    { 'api-key': 'fixture', name: 'Work', providers: ['codex', 'xai'], 'allowed-priorities': [1], 'future-field': 'preserved' },
    { 'api-key': 'other', name: 'External' },
  ]);
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
  expect(result.current.visualValues.apiKeyNames).toEqual({ fixture: 'Work', other: 'External' });
});

test('clears an inherited name and can clear while replacing the key', () => {
  const original = 'api-keys: [fixture]\ndefaults: &defaults\n  name: Old\n  future-field: preserved\napi-key-groups:\n  - <<: *defaults\n    api-key: fixture\n    providers: [codex]\n';
  for (const replacement of ['fixture', 'renamed']) {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.apiKeyNames).toEqual({ fixture: 'Old' });
    act(() => result.current.setVisualValues({ apiKeysText: replacement, apiKeyNames: {} }));
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved, { merge: true })['api-key-groups'][0]).toEqual({ 'api-key': replacement, providers: ['codex'], 'future-field': 'preserved' });
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.apiKeyNames).toEqual({});
  }
});

test.each(['constructor', '__proto__'])('adds, edits, clears and reloads a name for %s', async (key) => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: [], groups: [], namesSupported: true });
  let yaml = 'api-keys: []\n';
  function Harness() {
    const config = useVisualConfig();
    const { loadVisualValuesFromYaml } = config;
    useEffect(() => { loadVisualValuesFromYaml(yaml); }, [loadVisualValuesFromYaml]);
    return <>
      <ApiKeysCardEditor value={config.visualValues.apiKeysText} names={config.visualValues.apiKeyNames} onChange={(apiKeysText, apiKeyNames) => config.setVisualValues({ apiKeysText, apiKeyNames })} />
      <button disabled={!config.visualDirty} onClick={() => { yaml = config.applyVisualChangesToYaml(yaml); config.loadVisualValuesFromYaml(yaml); }}>Persist fixture</button>
    </>;
  }
  render(<Harness />);
  await waitFor(() => expect(apiKeysApi.getAccessSnapshot).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: label + 'add' }));
  const input = screen.getByLabelText(label + 'name_label');
  await waitFor(() => expect(input.hasAttribute('disabled')).toBe(false));
  fireEvent.change(screen.getByLabelText(label + 'input_label'), { target: { value: key } });
  fireEvent.change(input, { target: { value: 'Work 🔑' } });
  fireEvent.click(screen.getByRole('button', { name: 'config_management.visual.common.add' }));
  fireEvent.click(screen.getByRole('button', { name: 'Persist fixture' }));
  expect(parse(yaml)['api-key-groups'][0]).toMatchObject({ 'api-key': key, name: 'Work 🔑' });
  expect(screen.getByText('Work 🔑')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'config_management.visual.common.edit' }));
  fireEvent.change(screen.getByLabelText(label + 'name_label'), { target: { value: 'x'.repeat(101) } });
  fireEvent.click(screen.getByRole('button', { name: 'config_management.visual.common.update' }));
  expect(screen.getByRole('alert').textContent).toContain('name_error');
  fireEvent.change(screen.getByLabelText(label + 'name_label'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'config_management.visual.common.update' }));
  expect(screen.getByRole('button', { name: 'Persist fixture' }).hasAttribute('disabled')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Persist fixture' }));
  expect(parse(yaml)['api-key-groups'][0].name).toBeUndefined();
  expect(screen.queryByText('Work 🔑')).toBeNull();
});

test('does not offer an editable name when the backend lacks support', async () => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: ['fixture'], groups: [] });
  render(<ApiKeysCardEditor value="fixture" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'config_management.visual.common.edit' }));
  expect(screen.getByLabelText(label + 'name_label').hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(label + 'name_unsupported')).toBeTruthy();
});

test('includes field-name search and all four name translations', () => {
  expect(CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-api-keys')?.yamlKeys).toContain('api-key-groups[].name');
  for (const locale of [en, ru, zhCN, zhTW]) for (const key of ['name_label', 'name_hint', 'name_error', 'name_unsupported'] as const) expect(locale.config_management.visual.api_keys[key]).toBeTruthy();
});
