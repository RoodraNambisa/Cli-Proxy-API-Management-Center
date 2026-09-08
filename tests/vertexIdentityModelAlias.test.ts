import { expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeConfigResponse, normalizeModelAliases } from '@/services/api/transformers';

test('Vertex identity aliases survive dedicated and full-config reads, PUT and PATCH', async () => {
  const models = [{ name: 'upstream', alias: 'upstream', thinking: { levels: ['high'] }, future: true }];
  const source = { 'api-key': 'fixture', models };
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'vertex-api-key': [source] });
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const fromAPI = await providersApi.getVertexConfigs();
  const fromConfig = normalizeConfigResponse({ 'vertex-api-key': [source] }).vertexApiKeys!;
  for (const values of [fromAPI, fromConfig]) {
    expect(values[0].models).toEqual(models);
    await providersApi.saveVertexConfigs(values);
    expect(put.mock.lastCall?.[1]).toMatchObject([source]);
    await providersApi.updateVertexConfig(0, values[0]);
    expect(patch.mock.lastCall?.[1]).toMatchObject({ value: source });
  }
  expect(normalizeModelAliases([{ name: 'upstream', alias: 'upstream' }])).toEqual([{ name: 'upstream' }]);
});
