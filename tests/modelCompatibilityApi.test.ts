import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeModelAliases } from '@/services/api/transformers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';

const families = [
  ['gemini-api-key', providersApi.getGeminiKeys, providersApi.saveGeminiKeys, providersApi.updateGeminiKey],
  ['interactions-api-key', providersApi.getInteractionsKeys, providersApi.saveInteractionsKeys, providersApi.updateInteractionsKey],
  ['codex-api-key', providersApi.getCodexConfigs, providersApi.saveCodexConfigs, providersApi.updateCodexConfig],
  ['claude-api-key', providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs, providersApi.updateClaudeConfig],
  ['vertex-api-key', providersApi.getVertexConfigs, providersApi.saveVertexConfigs, providersApi.updateVertexConfig],
] as const;
const base = { name: 'upstream', alias: 'alias', 'display-name': 'Label', 'max-context-length': 131072, 'force-mapping': true, thinking: { levels: [], future: true }, future: { keep: true } };

test.each(families)('%s saves and reloads compatibility independently of other model capabilities', async (family, get, put, patch) => {
  const source = { 'api-key': 'fixture', models: [{ ...base, 'is-compat': true }] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ [family]: [source] });
  const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const configs = await get();
  expect(configs[0].models?.[0].isCompat).toBe(true);
  expect(configs[0].models?.[0]).not.toHaveProperty('is-compat');
  const form = modelsToEntries(configs[0].models);
  form[0].isCompat = false;
  expect(configs[0].models?.[0].isCompat).toBe(true);
  const edited = { ...configs[0], models: entriesToModels(form) };
  await put([edited]);
  expect(putSpy.mock.lastCall?.[1]).toMatchObject([{ models: [{ ...base, 'is-compat': false }] }]);
  await patch(0, edited);
  const value = (patchSpy.mock.lastCall?.[1] as { value: unknown }).value;
  expect(value).toMatchObject({ models: [{ ...base, 'is-compat': false }] });
  expect(JSON.stringify(value)).not.toContain('isCompat');
  vi.mocked(apiClient.get).mockResolvedValue({ [family]: [value] });
  expect((await get())[0].models?.[0].isCompat).toBe(false);
  await patch(0, { ...edited, models: [{ ...edited.models[0], isCompat: undefined }] });
  expect(JSON.parse(JSON.stringify(patchSpy.mock.lastCall?.[1])).value.models).toEqual([base]);
  expect(source.models[0]['is-compat']).toBe(true);
});

test('compatibility validates booleans and preserves missing, null and explicit precedence', () => {
  for (const value of ['true', 1, 0, [], {}]) {
    expect(() => normalizeModelAliases([{ name: 'upstream', 'is-compat': value }])).toThrow('is-compat');
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    expect(() => providersApi.saveCodexConfigs([{ apiKey: 'fixture', models: [{ name: 'upstream', isCompat: value as boolean }] }])).toThrow('is-compat');
    expect(put).not.toHaveBeenCalled();
  }
  for (const value of [undefined, null]) {
    expect(normalizeModelAliases([{ name: 'upstream', 'is-compat': value, isCompat: true }])).toEqual([{ name: 'upstream' }]);
  }
  expect(normalizeModelAliases([{ name: 'upstream' }])).toEqual([{ name: 'upstream' }]);
  expect(normalizeModelAliases([{ name: 'upstream', 'is-compat': false, isCompat: true }])).toEqual([{ name: 'upstream', isCompat: false }]);
});

test('OpenAI compatibility leaves same-named unknown extensions uninterpreted', async () => {
  const source = { name: 'compat', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture' }], models: [{ ...base, 'is-compat': 'future-extension', isCompat: { future: true } }] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const configs = await providersApi.getOpenAIProviders();
  await providersApi.saveOpenAIProviders(configs);
  expect(put.mock.lastCall?.[1]).toMatchObject([source]);
});
