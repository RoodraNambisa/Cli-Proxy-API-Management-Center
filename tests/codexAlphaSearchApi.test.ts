import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeCodexKeyConfig, normalizeConfigResponse } from '@/services/api/transformers';
import type { ProviderKeyConfig } from '@/types';

test.each([true, false])('Codex Alpha Search keeps %s through GET, PUT and PATCH', async (enabled) => {
  const source = { 'api-key': 'fixture', 'base-url': 'https://example.invalid/v1', websockets: true, 'alpha-search': enabled, models: [{ name: 'upstream', alias: 'local', 'display-name': 'Label', 'max-context-length': 131072 }] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'codex-api-key': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const configs = await providersApi.getCodexConfigs();
  expect(configs[0].alphaSearch).toBe(enabled);
  expect(normalizeConfigResponse({ 'codex-api-key': [source] }).codexApiKeys?.[0].alphaSearch).toBe(enabled);
  await providersApi.saveCodexConfigs(configs);
  expect(put.mock.lastCall?.[1]).toMatchObject([source]);
  await providersApi.updateCodexConfig(0, configs[0]);
  expect(patch.mock.lastCall?.[1]).toMatchObject({ index: 0, value: source });
  expect(JSON.stringify(put.mock.lastCall?.[1])).not.toContain('alphaSearch');
});

test('old configs stay unset and canonical capability values take precedence', async () => {
  expect(normalizeCodexKeyConfig('fixture')?.alphaSearch).toBeUndefined();
  expect(normalizeCodexKeyConfig({ apiKey: 'fixture', alphaSearch: true })?.alphaSearch).toBe(true);
  expect(normalizeCodexKeyConfig({ apiKey: 'fixture', alphaSearch: true, 'alpha-search': false })?.alphaSearch).toBe(false);
  expect(normalizeCodexKeyConfig({ apiKey: 'fixture', alphaSearch: true, 'alpha-search': null })?.alphaSearch).toBeUndefined();
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  await providersApi.saveCodexConfigs([{ apiKey: 'fixture' }]);
  expect(JSON.stringify(put.mock.lastCall?.[1])).not.toContain('alpha-search');
  await providersApi.saveClaudeConfigs([{ apiKey: 'fixture', alphaSearch: true }]);
  expect(JSON.stringify(put.mock.lastCall?.[1])).not.toContain('alpha-search');
});

test('invalid capability types do not become an opt-in or reach the API', () => {
  const put = vi.spyOn(apiClient, 'put');
  for (const value of ['true', 1, [], {}]) {
    expect(() => normalizeCodexKeyConfig({ apiKey: 'fixture', 'alpha-search': value })).toThrow('alpha-search');
    expect(() => providersApi.saveCodexConfigs([{ apiKey: 'fixture', alphaSearch: value } as unknown as ProviderKeyConfig])).toThrow('alpha-search');
  }
  expect(put).not.toHaveBeenCalled();
});
