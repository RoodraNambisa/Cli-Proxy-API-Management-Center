import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeModelAliases } from '@/services/api/transformers';
import type { ModelAlias } from '@/types';

const families = [
  ['gemini-api-key', providersApi.getGeminiKeys, providersApi.saveGeminiKeys, providersApi.updateGeminiKey],
  ['interactions-api-key', providersApi.getInteractionsKeys, providersApi.saveInteractionsKeys, providersApi.updateInteractionsKey],
  ['codex-api-key', providersApi.getCodexConfigs, providersApi.saveCodexConfigs, providersApi.updateCodexConfig],
  ['claude-api-key', providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs, providersApi.updateClaudeConfig],
  ['vertex-api-key', providersApi.getVertexConfigs, providersApi.saveVertexConfigs, providersApi.updateVertexConfig],
] as const;

test.each(families)('%s retains display labels in GET, PUT and PATCH', async (path, get, put, patch) => {
  const model = { name: 'upstream', alias: 'alias', 'display-name': 'Friendly label' };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ [path]: [{ 'api-key': 'fixture', models: [model] }] });
  const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const entries = await get();
  expect(entries[0].models).toEqual([{ name: 'upstream', alias: 'alias', displayName: 'Friendly label' }]);
  await put(entries);
  expect(putSpy.mock.lastCall?.[1]).toMatchObject([{ models: [model] }]);
  await patch(0, entries[0]);
  expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { models: [model] } });
  await patch(0, { ...entries[0], models: [{ ...entries[0].models![0], displayName: '' }] });
  expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { models: [{ name: 'upstream', alias: 'alias' }] } });
  expect(JSON.stringify(patchSpy.mock.lastCall?.[1])).not.toContain('display-name');
  const before = putSpy.mock.calls.length;
  expect(() => put([{ apiKey: 'fixture', models: [{ name: 'upstream', alias: 'alias', displayName: 123 } as unknown as ModelAlias] }])).toThrow();
  expect(putSpy).toHaveBeenCalledTimes(before);
});

test('OpenAI compatibility retains label and routing IDs without changing key entries', async () => {
  const model = { name: 'upstream', alias: 'alias', 'display-name': 'Friendly label' };
  const source = { name: 'compat', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture' }], models: [model] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const entries = await providersApi.getOpenAIProviders();
  await providersApi.saveOpenAIProviders(entries);
  expect(put.mock.lastCall?.[1]).toMatchObject([source]);
  await providersApi.updateOpenAIProvider(0, entries[0]);
  expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { models: [model] } });
});

test('canonical labels are independent of aliases, with strict types and legacy defaults', () => {
  expect(normalizeModelAliases(['legacy', { name: 'upstream', displayName: ' Label ' }])).toEqual([{ name: 'legacy' }, { name: 'upstream', displayName: 'Label' }]);
  for (const value of [undefined, null, '', '  ']) {
    expect(normalizeModelAliases([{ name: 'upstream', 'display-name': value, displayName: 'ignored' }])).toEqual([{ name: 'upstream' }]);
  }
  for (const value of [3, false, {}, []]) {
    expect(() => normalizeModelAliases([{ name: 'upstream', 'display-name': value }])).toThrow('display-name');
  }
});
