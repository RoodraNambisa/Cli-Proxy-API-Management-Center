import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeModelAliases } from '@/services/api/transformers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';

const extras = { 'force-mapping': true, thinking: { levels: [], future: true }, 'future-model-field': { nested: ['keep'] } };
const source = { name: 'upstream', alias: 'alias', 'display-name': 'Before', ...extras };
const saveKeys = [providersApi.saveGeminiKeys, providersApi.saveInteractionsKeys, providersApi.saveClaudeConfigs, providersApi.saveCodexConfigs, providersApi.saveVertexConfigs];

test('editing a label preserves local model settings through all six API families', async () => {
  const original = JSON.stringify(source);
  const form = modelsToEntries(normalizeModelAliases([source]));
  form[0].displayName = 'After';
  const models = entriesToModels(form);
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  for (const save of saveKeys) {
    await save([{ apiKey: 'fixture', models }]);
    expect(put.mock.lastCall?.[1]).toMatchObject([{ models: [{ ...source, 'display-name': 'After' }] }]);
  }
  await providersApi.saveOpenAIProviders([{ name: 'compat', baseUrl: 'https://example.test', apiKeyEntries: [], models }]);
  expect(put.mock.lastCall?.[1]).toMatchObject([{ models: [{ ...source, 'display-name': 'After' }] }]);
  expect(JSON.stringify(source)).toBe(original);
});

test('clearing labels and redundant aliases retains only their own defaults', () => {
  const form = modelsToEntries(normalizeModelAliases([source]));
  form[0].displayName = '  ';
  form[0].alias = 'upstream';
  expect(entriesToModels(form)).toEqual([{ name: 'upstream', ...extras }]);
  expect(modelsToEntries()).toEqual([{ name: '', alias: '' }]);
  expect(entriesToModels([{ name: '', alias: '', displayName: 'unused' }])).toEqual([]);
});
