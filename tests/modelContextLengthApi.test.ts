import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeModelAliases } from '@/services/api/transformers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import { MAX_MODEL_CONTEXT_LENGTH, normalizeModelContextLength, serializeModelContextLength } from '@/utils/modelContextLength';

const families = [
  ['gemini-api-key', providersApi.getGeminiKeys, providersApi.saveGeminiKeys, providersApi.updateGeminiKey],
  ['interactions-api-key', providersApi.getInteractionsKeys, providersApi.saveInteractionsKeys, providersApi.updateInteractionsKey],
  ['codex-api-key', providersApi.getCodexConfigs, providersApi.saveCodexConfigs, providersApi.updateCodexConfig],
  ['claude-api-key', providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs, providersApi.updateClaudeConfig],
  ['vertex-api-key', providersApi.getVertexConfigs, providersApi.saveVertexConfigs, providersApi.updateVertexConfig],
] as const;
const base = { name: 'upstream', alias: 'alias', 'display-name': 'Label', 'force-mapping': true, future: { keep: true } };

test.each(families)('%s round-trips model capacity and keeps other model settings', async (path, get, put, patch) => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ [path]: [{ 'api-key': 'fixture', models: [{ ...base, 'max-context-length': 131072 }] }] });
  const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const entries = await get();
  expect(entries[0].models?.[0].maxContextLength).toBe(131072);
  const form = modelsToEntries(entries[0].models);
  form[0].maxContextLength = MAX_MODEL_CONTEXT_LENGTH;
  const edited = { ...entries[0], models: entriesToModels(form) };
  await put([edited]);
  expect(putSpy.mock.lastCall?.[1]).toMatchObject([{ 'api-key': 'fixture', models: [{ ...base, 'max-context-length': MAX_MODEL_CONTEXT_LENGTH }] }]);
  await patch(0, edited);
  expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { models: [{ ...base, 'max-context-length': MAX_MODEL_CONTEXT_LENGTH }] } });
  for (const maxContextLength of [0, undefined]) {
    await patch(0, { ...edited, models: [{ ...edited.models[0], maxContextLength }] });
    const body = JSON.parse(JSON.stringify(patchSpy.mock.lastCall?.[1]));
    expect(body.value.models).toEqual([base]);
  }
  const before = putSpy.mock.calls.length;
  expect(() => put([{ ...edited, models: [{ name: 'upstream', alias: 'alias', maxContextLength: -1 }] }])).toThrow('max-context-length');
  expect(putSpy).toHaveBeenCalledTimes(before);
});

test('OpenAI compatibility capacity edits preserve keys and model fields', async () => {
  const source = { name: 'compat', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture', weight: 3 }], models: [{ ...base, 'max-context-length': 131072 }] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const entries = await providersApi.getOpenAIProviders();
  await providersApi.saveOpenAIProviders(entries);
  expect(put.mock.lastCall?.[1]).toMatchObject([source]);
  await providersApi.updateOpenAIProvider(0, { ...entries[0], models: [{ ...entries[0].models![0], maxContextLength: 0 }] });
  expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { models: [base], 'api-key-entries': source['api-key-entries'] } });
  expect(JSON.stringify(patch.mock.lastCall?.[1])).not.toContain('max-context-length');
});

test('capacity uses strict integer bounds and canonical null inherits', () => {
  for (const value of [false, '', '131072', -1, 1.5, MAX_MODEL_CONTEXT_LENGTH + 1, Infinity, NaN, {}, []]) {
    expect(normalizeModelContextLength(value)).toBeNaN();
    expect(() => serializeModelContextLength(normalizeModelContextLength(value))).toThrow('max-context-length');
  }
  for (const value of [null, undefined]) expect(normalizeModelContextLength(value)).toBeUndefined();
  for (const value of [0, 1, MAX_MODEL_CONTEXT_LENGTH]) expect(normalizeModelContextLength(value)).toBe(value);
  expect(normalizeModelAliases([{ name: 'upstream', 'max-context-length': null, maxContextLength: 131072 }])).toEqual([{ name: 'upstream' }]);
});
