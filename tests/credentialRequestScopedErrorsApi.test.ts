import { describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeConfigResponse } from '@/services/api/transformers';

const rules = [{ status: 500, match: [' exact '], matchRegexr: ['(?i)busy'], action: 'stop' }];
const wireRules = [{ status: 500, match: [' exact '], 'match-regexr': ['(?i)busy'], action: 'stop' }];
const families = [
  ['gemini-api-key', 'geminiApiKeys', providersApi.getGeminiKeys, providersApi.saveGeminiKeys, providersApi.updateGeminiKey],
  ['interactions-api-key', 'interactionsApiKeys', providersApi.getInteractionsKeys, providersApi.saveInteractionsKeys, providersApi.updateInteractionsKey],
  ['codex-api-key', 'codexApiKeys', providersApi.getCodexConfigs, providersApi.saveCodexConfigs, providersApi.updateCodexConfig],
  ['claude-api-key', 'claudeApiKeys', providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs, providersApi.updateClaudeConfig],
  ['vertex-api-key', 'vertexApiKeys', providersApi.getVertexConfigs, providersApi.saveVertexConfigs, providersApi.updateVertexConfig],
] as const;

describe('credential error rules API', () => {
  test.each(families)('%s round-trips through GET, PUT and PATCH', async (path, section, get, put, patch) => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ [path]: [{ 'api-key': 'test-key', 'request-scoped-errors': wireRules }] });
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const entries = await get();
    expect(entries[0].requestScopedErrors).toEqual(rules);
    await put(entries);
    expect(putSpy.mock.lastCall?.[1]).toMatchObject([{ 'api-key': 'test-key', 'request-scoped-errors': wireRules }]);
    await patch(0, entries[0]);
    expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { 'request-scoped-errors': wireRules } });
    for (const requestScopedErrors of [[], undefined]) {
      await patch(0, { apiKey: 'test-key', requestScopedErrors });
      expect(patchSpy.mock.lastCall?.[1]).toMatchObject({ value: { 'request-scoped-errors': requestScopedErrors ?? null } });
    }
    await patch(0, { apiKey: 'test-key' });
    expect(JSON.parse(JSON.stringify(patchSpy.mock.lastCall?.[1])).value).not.toHaveProperty('request-scoped-errors');
    const normalized = normalizeConfigResponse({ [path]: [{ 'api-key': 'test-key', 'request-scoped-errors': null, requestScopedErrors: rules }] });
    expect(normalized[section]?.[0].requestScopedErrors).toBeUndefined();
    const before = patchSpy.mock.calls.length;
    expect(() => patch(0, { apiKey: 'test-key', requestScopedErrors: [{ ...rules[0], status: 600 }] })).toThrow();
    expect(patchSpy).toHaveBeenCalledTimes(before);
  });

  test('OpenAI compatibility attaches rules to the provider, preserving its key entries', async () => {
    const source = { name: 'compat', 'base-url': 'https://example.test', 'request-scoped-errors': wireRules, 'api-key-entries': [{ 'api-key': 'test-key', weight: 3 }] };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const entries = await providersApi.getOpenAIProviders();
    expect(entries[0].requestScopedErrors).toEqual(rules);
    await providersApi.saveOpenAIProviders(entries);
    expect(put.mock.lastCall?.[1]).toMatchObject([source]);
    await providersApi.updateOpenAIProvider(0, { ...entries[0], requestScopedErrors: [] });
    expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'request-scoped-errors': [], 'api-key-entries': source['api-key-entries'] } });
    await providersApi.updateOpenAIProvider(0, { ...entries[0], requestScopedErrors: undefined });
    expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'request-scoped-errors': null } });
    expect(normalizeConfigResponse({ 'openai-compatibility': [{ ...source, 'request-scoped-errors': null, requestScopedErrors: rules }] }).openaiCompatibility?.[0].requestScopedErrors).toBeUndefined();
  });

  test('invalid rules abort a whole PUT before any network request', () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    for (const [, , , save] of families) {
      expect(() => save([{ apiKey: 'test-a', requestScopedErrors: rules }, { apiKey: 'test-b', requestScopedErrors: [{ status: 500, action: 'stop' }] }])).toThrow();
    }
    expect(() => providersApi.saveOpenAIProviders([{ name: 'compat', baseUrl: 'https://example.test', apiKeyEntries: [], requestScopedErrors: [{ status: 500, match: ['x'], action: 'invalid' }] }])).toThrow();
    expect(put).not.toHaveBeenCalled();
  });
});
