import { expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeModelAliases } from '@/services/api/transformers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import { MAX_MODEL_THINKING_BUDGET, isValidModelThinking, normalizeModelThinking, serializeModelThinking } from '@/utils/modelThinking';

const families = [
  ['gemini-api-key', providersApi.getGeminiKeys, providersApi.saveGeminiKeys, providersApi.updateGeminiKey],
  ['interactions-api-key', providersApi.getInteractionsKeys, providersApi.saveInteractionsKeys, providersApi.updateInteractionsKey],
  ['codex-api-key', providersApi.getCodexConfigs, providersApi.saveCodexConfigs, providersApi.updateCodexConfig],
  ['claude-api-key', providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs, providersApi.updateClaudeConfig],
  ['vertex-api-key', providersApi.getVertexConfigs, providersApi.saveVertexConfigs, providersApi.updateVertexConfig],
] as const;
const base = { name: 'upstream', alias: 'alias', 'display-name': 'Label', 'max-context-length': 131072, 'force-mapping': true, future: { keep: true } };
const thinking = { levels: [' HIGH ', 'none'], zero_allowed: true, dynamic_allowed: false, future: { keep: true } };

test.each(families)('%s round-trips thinking without changing model metadata', async (path, get, put, patch) => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({ [path]: [{ 'api-key': 'fixture', models: [{ ...base, thinking }] }] });
  const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const configs = await get();
  const form = modelsToEntries(configs[0].models);
  form[0].thinking!.levels![0] = 'xhigh';
  expect(configs[0].models![0].thinking?.levels![0]).toBe(' HIGH ');
  const edited = { ...configs[0], models: entriesToModels(form) };
  await put([edited]);
  expect(putSpy.mock.lastCall?.[1]).toMatchObject([{ models: [{ ...base, thinking: { ...thinking, levels: ['xhigh', 'none'] } }] }]);
  await patch(0, edited);
  expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { models: [{ ...base, thinking: { ...thinking, levels: ['xhigh', 'none'] } }] } });
  await patch(0, { ...edited, models: [{ ...edited.models[0], thinking: undefined }] });
  expect(JSON.parse(JSON.stringify(patchSpy.mock.lastCall?.[1])).value.models).toEqual([base]);
  const attempts = putSpy.mock.calls.length;
  expect(() => put([{ ...edited, models: [{ ...edited.models[0], thinking: { min: -1 } }] }])).toThrow('thinking');
  expect(putSpy).toHaveBeenCalledTimes(attempts);
});

test('OpenAI compatibility thinking preserves its keys and custom model fields', async () => {
  const source = { name: 'compat', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture', weight: 3 }], models: [{ ...base, thinking }] };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const configs = await providersApi.getOpenAIProviders();
  await providersApi.saveOpenAIProviders(configs);
  expect(put.mock.lastCall?.[1]).toMatchObject([source]);
  await providersApi.updateOpenAIProvider(0, { ...configs[0], models: [{ ...configs[0].models![0], thinking: { levels: [] } }] });
  expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'api-key-entries': source['api-key-entries'], models: [{ ...base, thinking: { levels: [] } }] } });
});

test('thinking validates types, bounds and aliases while preserving inheritance and spelling', () => {
  for (const value of [false, [], 'high', { min: -1 }, { max: MAX_MODEL_THINKING_BUDGET + 1 }, { max: 1.5 }, { max: '1' }, { min: 2, max: 1 }, { levels: 'high' }, { levels: [1] }, { levels: ['unknown'] }, { levels: [''] }, { zero_allowed: 'true' }, { dynamicAllowed: 1 }]) {
    expect(isValidModelThinking(value)).toBe(false);
    expect(() => serializeModelThinking(value)).toThrow('thinking');
  }
  for (const value of [undefined, null]) expect(normalizeModelThinking(value)).toBeUndefined();
  for (const value of [{}, { levels: [] }, { min: 0, max: MAX_MODEL_THINKING_BUDGET }]) expect(normalizeModelThinking(value)).toEqual(value);
  const yaml = parse('levels: [none, " XHIGH "]\nzero-allowed: true\ndynamic-allowed: false\nfuture: keep');
  expect(serializeModelThinking(yaml)).toEqual({ levels: ['none', ' XHIGH '], zero_allowed: true, dynamic_allowed: false, future: 'keep' });
  expect(normalizeModelThinking({ zero_allowed: null, zeroAllowed: true })).toEqual({});
  expect(normalizeModelAliases([{ name: 'upstream', thinking: null }])).toEqual([{ name: 'upstream' }]);
  expect(thinking.levels[0]).toBe(' HIGH ');
});
