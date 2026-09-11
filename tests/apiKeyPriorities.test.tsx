import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { ApiKeyPriorityFields } from '@/components/config/ApiKeyPriorityFields';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { apiClient } from '@/services/api/client';
import { apiKeysApi } from '@/services/api/apiKeys';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => vi.restoreAllMocks());

test.each(['constructor', 'toString', '__proto__'])('handles a valid key matching an object prototype name: %s', async (key) => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: [key], groups: [], lastUsed: {}, availablePriorities: [0, 1] });
  const update = vi.spyOn(apiKeysApi, 'updatePriorities').mockResolvedValue({ status: 'ok' });
  const view = render(<ApiKeysCardEditor value={key} active onChange={vi.fn()} />);
  const checkbox = await screen.findByRole('checkbox', { name: 'config_management.visual.api_keys.priority_allowed: 1' });
  expect(view.container.querySelector('time')).toBeNull();
  expect(screen.getByText('config_management.visual.api_keys.last_used_never', { exact: false })).toBeTruthy();
  fireEvent.click(checkbox);
  await waitFor(() => expect(update).toHaveBeenCalledWith(key, 'allowedPriorities', [1]));
  await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(true));
});

test('canonical null priority fields override compatibility aliases', () => {
  const config = normalizeConfigResponse({ 'api-key-groups': [{
    'api-key': 'fixture', providers: [],
    'allowed-priorities': null, allowedPriorities: [1],
    'excluded-priorities': null, excludedPriorities: [2],
  }] });
  expect(config.apiKeyGroups?.[0].allowedPriorities).toEqual([]);
  expect(config.apiKeyGroups?.[0].excludedPriorities).toEqual([]);
});

test('normalizes priority restrictions and writes only the changed field', async () => {
  const group = { 'api-key': 'fixture', providers: ['Codex'], 'allowed-priorities': [2, -1, 2], 'excluded-priorities': [2] };
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
  vi.spyOn(apiClient, 'get').mockImplementation(async (url) => url === '/api-keys'
    ? { 'api-keys': ['fixture'] } as never
    : { 'api-key-groups': [group], 'available-priorities': [0, 2, -1] } as never);
  const snapshot = await apiKeysApi.getAccessSnapshot();
  expect(snapshot.availablePriorities).toEqual([-1, 0, 2]);
  expect(snapshot.groups[0]).toMatchObject({ allowedPriorities: [-1, 2], excludedPriorities: [2] });
  expect(normalizeConfigResponse({ 'api-key-groups': [group] }).apiKeyGroups).toEqual(snapshot.groups);
  await apiKeysApi.updatePriorities('fixture', 'allowedPriorities', [1, 1]);
  expect(patch).toHaveBeenLastCalledWith('/api-key-groups', { 'api-key': 'fixture', 'allowed-priorities': [1] });
  await apiKeysApi.updatePriorities('fixture', 'excludedPriorities', []);
  expect(patch).toHaveBeenLastCalledWith('/api-key-groups', { 'api-key': 'fixture', 'excluded-priorities': [] });
  expect(() => apiKeysApi.updatePriorities('fixture', 'allowedPriorities', [1.5])).toThrow('priorities');
  expect(() => normalizeConfigResponse({ 'api-key-groups': [{ ...group, 'allowed-priorities': [null] }] })).toThrow('priorities');
});

test('saves and reloads a multi-selection without changing key contents', async () => {
  const onChange = vi.fn();
  const update = vi.spyOn(apiKeysApi, 'updatePriorities').mockResolvedValue({ status: 'ok' });
  vi.spyOn(apiKeysApi, 'getAccessSnapshot')
    .mockResolvedValueOnce({ keys: ['fixture'], groups: [{ apiKey: 'fixture', providers: ['codex'], excludedPriorities: [2] }], availablePriorities: [0, 1, 2] })
    .mockResolvedValueOnce({ keys: ['fixture'], groups: [{ apiKey: 'fixture', providers: ['codex'], allowedPriorities: [1], excludedPriorities: [2] }], availablePriorities: [0, 1, 2] });
  render(<ApiKeysCardEditor value="fixture" active onChange={onChange} />);
  const allowed = await screen.findByRole('checkbox', { name: 'config_management.visual.api_keys.priority_allowed: 1' });
  fireEvent.click(allowed);
  await waitFor(() => expect(update).toHaveBeenCalledWith('fixture', 'allowedPriorities', [1]));
  await waitFor(() => expect((allowed as HTMLInputElement).checked).toBe(true));
  const excluded = screen.getByRole('checkbox', { name: 'config_management.visual.api_keys.priority_excluded: 2' });
  expect((excluded as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByTitle('config_management.visual.api_keys.provider_refresh'));
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'config_management.visual.api_keys.priority_allowed: 1' }) as HTMLInputElement).checked).toBe(true));
  expect(onChange).not.toHaveBeenCalled();
});

test('does not show a saved selection after backend rejection', async () => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: ['fixture'], groups: [], availablePriorities: [0, 1] });
  vi.spyOn(apiKeysApi, 'updatePriorities').mockRejectedValue(new Error('rejected'));
  render(<ApiKeysCardEditor value="fixture" active onChange={vi.fn()} />);
  const checkbox = await screen.findByRole('checkbox', { name: 'config_management.visual.api_keys.priority_allowed: 1' });
  fireEvent.click(checkbox);
  await waitFor(() => expect(checkbox.hasAttribute('disabled')).toBe(false));
  expect((checkbox as HTMLInputElement).checked).toBe(false);
});

test('validates custom integers and retains the draft when saving fails', async () => {
  const onChange = vi.fn().mockResolvedValue(false);
  render(<ApiKeyPriorityFields options={[0]} onChange={onChange} />);
  const group = screen.getByRole('group', { name: 'config_management.visual.api_keys.priority_allowed' });
  const input = within(group).getByRole('spinbutton');
  fireEvent.change(input, { target: { value: '1.5' } });
  fireEvent.click(within(group).getByRole('button'));
  await within(group).findByRole('alert');
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '-3' } });
  fireEvent.click(within(group).getByRole('button'));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('allowedPriorities', [-3]));
  expect((input as HTMLInputElement).value).toBe('-3');
});

test('retains priority restrictions and unknown YAML fields during key rename', () => {
  const original = 'api-keys: [fixture]\napi-key-groups:\n  - api-key: fixture\n    providers: [codex]\n    allowed-priorities: [1, 2]\n    excluded-priorities: [2]\n    future-field: preserved\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  act(() => result.current.setVisualValues({ apiKeysText: 'renamed' }));
  const saved = result.current.applyVisualChangesToYaml(original);
  expect(parse(saved)['api-key-groups'][0]).toEqual({ 'api-key': 'renamed', providers: ['codex'], 'allowed-priorities': [1, 2], 'excluded-priorities': [2], 'future-field': 'preserved' });
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
  act(() => result.current.loadVisualValuesFromYaml(original.replace('[1, 2]', '[1.5]')));
  expect(result.current.visualParseError).toContain('priorities');
});

test('offers config-field search and translated priority descriptions', () => {
  const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-api-keys');
  expect(entry?.yamlKeys).toContain('api-key-groups[].allowed-priorities');
  expect(entry?.yamlKeys).toContain('api-key-groups[].excluded-priorities');
  for (const locale of [en, ru, zhCN, zhTW]) {
    expect(locale.config_management.visual.api_keys.priority_hint).toBeTruthy();
    expect(locale.config_management.visual.api_keys.priority_allowed).toBeTruthy();
    expect(locale.config_management.visual.api_keys.priority_excluded).toBeTruthy();
  }
});
