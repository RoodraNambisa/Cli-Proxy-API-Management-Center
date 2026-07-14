import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';

describe('Google Interactions API key management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('reads the wrapped key list and normalizes Gemini-compatible fields', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      'interactions-api-key': [
        {
          'api-key': 'interactions-key',
          'base-url': 'https://example.test',
          priority: 2,
          models: [{ name: 'gemini-2.5-pro', alias: 'pro' }],
        },
      ],
    });

    await expect(providersApi.getInteractionsKeys()).resolves.toEqual([
      expect.objectContaining({
        apiKey: 'interactions-key',
        baseUrl: 'https://example.test',
        priority: 2,
        models: [{ name: 'gemini-2.5-pro', alias: 'pro' }],
      }),
    ]);
    expect(get).toHaveBeenCalledWith('/interactions-api-key');
  });

  test('writes and deletes keys through the dedicated management endpoint', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ status: 'ok' });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ status: 'ok' });

    await providersApi.saveInteractionsKeys([
      {
        apiKey: 'shared key',
        baseUrl: 'https://example.test/v1',
        proxyUrl: 'socks5://127.0.0.1:1080',
        excludedModels: ['legacy-*'],
      },
    ]);
    expect(put).toHaveBeenCalledWith('/interactions-api-key', [
      {
        'api-key': 'shared key',
        'base-url': 'https://example.test/v1',
        'proxy-url': 'socks5://127.0.0.1:1080',
        'excluded-models': ['legacy-*'],
      },
    ]);

    await providersApi.updateInteractionsKey(0, {
      apiKey: 'shared key',
      priority: 3,
    });
    expect(patch).toHaveBeenCalledWith('/interactions-api-key', {
      index: 0,
      value: {
        'api-key': 'shared key',
        priority: 3,
      },
    });

    await providersApi.deleteInteractionsKey('shared key', 'https://example.test/v1');
    expect(remove).toHaveBeenCalledWith(
      '/interactions-api-key?api-key=shared+key&base-url=https%3A%2F%2Fexample.test%2Fv1'
    );
  });

  test('resolves Interactions usage sources by auth index', () => {
    const sourceMap = buildSourceInfoMap({
      interactionsApiKeys: [
        {
          apiKey: 'interactions-key',
          authIndex: 'interactions-auth',
        },
      ],
    });

    expect(resolveSourceDisplay('', 'interactions-auth', sourceMap, new Map())).toEqual({
      displayName: 'Interactions #1',
      type: 'interactions',
      identityKey: 'interactions:0',
    });
  });
});
