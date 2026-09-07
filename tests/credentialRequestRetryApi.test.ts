import { describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeConfigResponse } from '@/services/api/transformers';
import {
  isValidCredentialRequestRetry,
  normalizeCredentialRequestRetry,
  serializeCredentialRequestRetry,
  MAX_CREDENTIAL_REQUEST_RETRY,
} from '@/utils/credentialRequestRetry';

describe('credential request retry API', () => {
  test('normalizes defaults and legacy negative values without accepting malformed inputs', () => {
    for (const [value, expected] of [
      [undefined, undefined],
      [null, undefined],
      ['', undefined],
      ['  ', undefined],
      [0, 0],
      [MAX_CREDENTIAL_REQUEST_RETRY, MAX_CREDENTIAL_REQUEST_RETRY],
      ['+3', 3],
      [-2, 0],
      ['-9223372036854775808', 0],
    ] as const) {
      expect(normalizeCredentialRequestRetry(value)).toBe(expected);
    }
    for (const value of [
      true,
      [],
      {},
      '1.0',
      '1e2',
      '0x10',
      '-9223372036854775809',
      -1e30,
      1.5,
      MAX_CREDENTIAL_REQUEST_RETRY + 1,
      NaN,
      Infinity,
    ]) {
      expect(isValidCredentialRequestRetry(normalizeCredentialRequestRetry(value))).toBe(false);
    }
    for (const value of [-1, 1.5, MAX_CREDENTIAL_REQUEST_RETRY + 1, NaN, Infinity])
      expect(() => serializeCredentialRequestRetry(value)).toThrow();
  });

  test('PUT preserves zero and inherited values across all provider families', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const entries = [
      { apiKey: 'test-zero', baseUrl: 'https://example.test', requestRetry: 0 },
      {
        apiKey: 'test-max',
        baseUrl: 'https://example.test',
        requestRetry: MAX_CREDENTIAL_REQUEST_RETRY,
      },
      { apiKey: 'test-inherit', baseUrl: 'https://example.test' },
    ];
    for (const save of [
      providersApi.saveCodexConfigs,
      providersApi.saveClaudeConfigs,
      providersApi.saveGeminiKeys,
      providersApi.saveInteractionsKeys,
      providersApi.saveVertexConfigs,
    ]) {
      await save(entries);
      const payload = JSON.parse(JSON.stringify(put.mock.lastCall?.[1]));
      expect(payload.map((entry: Record<string, unknown>) => entry['request-retry'])).toEqual([
        0,
        MAX_CREDENTIAL_REQUEST_RETRY,
        undefined,
      ]);
      expect(payload.map((entry: Record<string, unknown>) => entry['api-key'])).toEqual([
        'test-zero',
        'test-max',
        'test-inherit',
      ]);
    }
    await providersApi.saveOpenAIProviders([
      {
        name: 'compat',
        baseUrl: 'https://example.test',
        requestRetry: 0,
        apiKeyEntries: [{ apiKey: 'test-key', weight: 3 }],
      },
    ]);
    expect(put.mock.lastCall?.[1]).toMatchObject([
      { 'request-retry': 0, 'api-key-entries': [{ 'api-key': 'test-key', weight: 3 }] },
    ]);
  });

  test('PATCH distinguishes omitted overrides from explicit inheritance and rejects before sending', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    for (const update of [
      providersApi.updateCodexConfig,
      providersApi.updateClaudeConfig,
      providersApi.updateGeminiKey,
      providersApi.updateInteractionsKey,
      providersApi.updateVertexConfig,
    ]) {
      await update(0, { apiKey: 'test-key' });
      expect(JSON.parse(JSON.stringify(patch.mock.lastCall?.[1])).value).not.toHaveProperty(
        'request-retry'
      );
      await update(0, { apiKey: 'test-key', requestRetry: undefined });
      expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'request-retry': null } });
      await update(0, { apiKey: 'test-key', requestRetry: 0 });
      expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'request-retry': 0 } });
    }
    const provider = { name: 'compat', baseUrl: 'https://example.test', apiKeyEntries: [] };
    await providersApi.updateOpenAIProvider(0, provider);
    expect(JSON.parse(JSON.stringify(patch.mock.lastCall?.[1])).value).not.toHaveProperty(
      'request-retry'
    );
    await providersApi.updateOpenAIProvider(0, { ...provider, requestRetry: undefined });
    expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { 'request-retry': null } });
    const before = patch.mock.calls.length;
    expect(() =>
      providersApi.updateCodexConfig(0, { apiKey: 'test-key', requestRetry: 1.5 })
    ).toThrow();
    expect(() =>
      providersApi.updateOpenAIProvider(0, { ...provider, requestRetry: NaN })
    ).toThrow();
    expect(patch).toHaveBeenCalledTimes(before);
  });

  test('transformers keep canonical null precedence and preserve credential strings', () => {
    const config = normalizeConfigResponse({
      'codex-api-key': [{ 'api-key': 'test-key', 'request-retry': null, requestRetry: 2 }],
      'claude-api-key': [{ 'api-key': 'test-key', 'request-retry': 0 }],
      'gemini-api-key': [{ 'api-key': 'test-key', requestRetry: 3 }],
      'interactions-api-key': [{ 'api-key': 'test-key', 'request-retry': -2 }],
      'vertex-api-key': [{ 'api-key': 'test-key', 'request-retry': MAX_CREDENTIAL_REQUEST_RETRY }],
      'openai-compatibility': [
        {
          name: 'compat',
          'base-url': 'https://example.test',
          'request-retry': 1,
          'api-key-entries': [{ 'api-key': 'test-key', weight: 4 }],
        },
      ],
    });
    expect(config.codexApiKeys?.[0]).toMatchObject({ apiKey: 'test-key' });
    expect(config.codexApiKeys?.[0]?.requestRetry).toBeUndefined();
    expect(config.claudeApiKeys?.[0]?.requestRetry).toBe(0);
    expect(config.geminiApiKeys?.[0]?.requestRetry).toBe(3);
    expect(config.interactionsApiKeys?.[0]?.requestRetry).toBe(0);
    expect(config.vertexApiKeys?.[0]?.requestRetry).toBe(MAX_CREDENTIAL_REQUEST_RETRY);
    expect(config.openaiCompatibility?.[0]).toMatchObject({
      requestRetry: 1,
      apiKeyEntries: [{ apiKey: 'test-key', weight: 4 }],
    });
  });
});
