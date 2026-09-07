import { describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeConfigResponse } from '@/services/api/transformers';
import {
  isValidCredentialWeight,
  normalizeCredentialWeight,
  serializeCredentialWeight,
} from '@/utils/credentialWeight';

describe('credential weight API', () => {
  test('normalizes only valid backend scalar forms and preserves invalid values for validation', () => {
    for (const [value, expected] of [
      [undefined, undefined], [null, undefined], ['', undefined], ['   ', undefined],
      [0, 0], [1_000_000, 1_000_000], ['+3', 3], ['  -4 ', 0],
      ['-9223372036854775808', 0], [-9223372036854775808, 0],
    ] as const) {
      expect(normalizeCredentialWeight(value)).toBe(expected);
    }
    for (const value of [[], {}, true, '0x10', '1e3', '1.0', '-9223372036854775809', -1e30, 1.5, 1_000_001, Infinity, NaN]) {
      expect(isValidCredentialWeight(normalizeCredentialWeight(value))).toBe(false);
    }
    expect(serializeCredentialWeight(undefined)).toBeUndefined();
    for (const value of [-1, 1.5, 1_000_001, NaN, Infinity]) {
      expect(() => serializeCredentialWeight(value)).toThrow();
    }
  });

  test('PUT preserves explicit zero, maximum and inherited weights for every provider', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const entries = [
      { apiKey: 'test-zero', baseUrl: 'https://example.invalid', weight: 0 },
      { apiKey: 'test-max', baseUrl: 'https://example.invalid', weight: 1_000_000 },
      { apiKey: 'test-inherit', baseUrl: 'https://example.invalid' },
    ];
    for (const save of [providersApi.saveCodexConfigs, providersApi.saveClaudeConfigs, providersApi.saveGeminiKeys, providersApi.saveInteractionsKeys, providersApi.saveVertexConfigs]) {
      await save(entries);
      expect(JSON.parse(JSON.stringify(put.mock.lastCall?.[1]))).toEqual([
        expect.objectContaining({ weight: 0 }),
        expect.objectContaining({ weight: 1_000_000 }),
        expect.not.objectContaining({ weight: expect.anything() }),
      ]);
    }
    await providersApi.saveOpenAIProviders([{ name: 'test', baseUrl: 'https://example.invalid', apiKeyEntries: entries }]);
    const result = JSON.parse(JSON.stringify(put.mock.lastCall?.[1]));
    expect(result[0]['api-key-entries'].map((entry: { weight?: number }) => entry.weight)).toEqual([0, 1_000_000, undefined]);
  });

  test('PATCH keeps an omitted field and clears only an explicitly inherited field', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    for (const update of [providersApi.updateCodexConfig, providersApi.updateClaudeConfig, providersApi.updateGeminiKey, providersApi.updateInteractionsKey, providersApi.updateVertexConfig]) {
      await update(0, { apiKey: 'test-key' });
      expect(JSON.parse(JSON.stringify(patch.mock.lastCall?.[1])).value).not.toHaveProperty('weight');
      await update(0, { apiKey: 'test-key', weight: undefined });
      expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { weight: null } });
      await update(0, { apiKey: 'test-key', weight: 0 });
      expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { weight: 0 } });
    }
    const before = patch.mock.calls.length;
    expect(() => providersApi.updateCodexConfig(0, { apiKey: 'test-key', weight: 1.5 })).toThrow();
    expect(patch).toHaveBeenCalledTimes(before);
  });

  test('transformers preserve each provider weight without changing secret values', () => {
    const raw = {
      'codex-api-key': [{ 'api-key': 'test-key', weight: -3 }],
      'gemini-api-key': [{ 'api-key': 'test-key', weight: 0 }],
      'claude-api-key': [{ 'api-key': 'test-key', weight: 1_000_000 }],
      'vertex-api-key': [{ 'api-key': 'test-key', weight: 8 }],
      'openai-compatibility': [{ name: 'compat', 'base-url': 'https://example.invalid', 'api-key-entries': [{ 'api-key': 'test-key', weight: 0 }] }],
    };
    const config = normalizeConfigResponse(raw);
    expect(config.codexApiKeys?.[0]).toMatchObject({ apiKey: 'test-key', weight: 0 });
    expect(config.geminiApiKeys?.[0]).toMatchObject({ apiKey: 'test-key', weight: 0 });
    expect(config.claudeApiKeys?.[0]?.weight).toBe(1_000_000);
    expect(config.vertexApiKeys?.[0]?.weight).toBe(8);
    expect(config.openaiCompatibility?.[0]?.apiKeyEntries?.[0]?.weight).toBe(0);
  });
});
