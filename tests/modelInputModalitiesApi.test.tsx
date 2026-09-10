import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { providersApi } from '@/services/api/providers';
import { normalizeConfigResponse, normalizeModelAliases } from '@/services/api/transformers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import { areModelEntriesEqual } from '@/utils/compare';
import { normalizeModelInputModalities } from '@/utils/modelInputModalities';
import { useVisualConfig } from '@/hooks/useVisualConfig';

describe('OpenAI compatibility model input modalities', () => {
  test('round-trips a model declaration through API, editor, save and reload', async () => {
    const source = { name: 'compat', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture', weight: 3 }], models: [{ name: 'upstream', alias: 'local', 'input-modalities': [' TEXT ', 'image', 'image'], 'force-mapping': true, future: { keep: true } }] };
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ 'openai-compatibility': [source] });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const [provider] = await providersApi.getOpenAIProviders();
    expect(provider.models?.[0].inputModalities).toEqual(['text', 'image']);
    const original = modelsToEntries(provider.models);
    const edited = modelsToEntries(provider.models);
    edited[0].inputModalities = ['text'];
    expect(areModelEntriesEqual(original, edited)).toBe(false);
    expect(provider.models?.[0].inputModalities).toEqual(['text', 'image']);
    await providersApi.saveOpenAIProviders([{ ...provider, models: entriesToModels(edited) }]);
    expect(put.mock.lastCall?.[1]).toMatchObject([{ 'api-key-entries': source['api-key-entries'], models: [{ 'input-modalities': ['text'], 'force-mapping': true, future: { keep: true } }] }]);
    get.mockResolvedValue({ 'openai-compatibility': put.mock.lastCall?.[1] });
    expect((await providersApi.getOpenAIProviders())[0].models?.[0].inputModalities).toEqual(['text']);
    edited[0].inputModalities = undefined;
    await providersApi.updateOpenAIProvider(0, { ...provider, models: entriesToModels(edited) });
    expect(JSON.stringify(patch.mock.lastCall?.[1])).not.toContain('input-modalities');
    expect(JSON.stringify(patch.mock.lastCall?.[1])).not.toContain('inputModalities');
    expect(patch.mock.lastCall?.[1]).toMatchObject({ value: { models: [{ name: 'upstream', alias: 'local', future: { keep: true } }] } });
    expect(areModelEntriesEqual([{ name: 'upstream', alias: '' }], [{ name: 'upstream', alias: '', inputModalities: [] }])).toBe(true);
    const before = put.mock.calls.length;
    expect(() => providersApi.saveOpenAIProviders([{ ...provider, models: [{ name: 'upstream', inputModalities: ['invalid'] as never }] }])).toThrow('input-modalities');
    expect(put).toHaveBeenCalledTimes(before);
  });

  test.each(['text', 1, false, {}, [1], [null], [''], ['text', 'unknown']])('rejects invalid declaration %j', (raw) => {
    expect(() => normalizeModelInputModalities(raw)).toThrow('input-modalities');
  });

  test('normalizes inheritance and preserves unrelated provider extensions', () => {
    for (const raw of [undefined, null, []]) expect(normalizeModelInputModalities(raw)).toBeUndefined();
    expect(normalizeModelInputModalities([' Text ', 'IMAGE', 'image', 'audio', 'video'])).toEqual(['text', 'image', 'audio', 'video']);
    expect(normalizeModelAliases([{ name: 'upstream', 'input-modalities': null, inputModalities: ['text'] }], { supportsInputModalities: true })).toEqual([{ name: 'upstream' }]);
    expect(normalizeModelAliases([{ name: 'upstream', 'input-modalities': { future: true } }])).toEqual([{ name: 'upstream', 'input-modalities': { future: true } }]);
  });

  test('preserves model YAML anchors, unknown fields and keys during unrelated visual saves', () => {
    const yaml = '# fixture comment\nmodel: &model {name: upstream, alias: local, input-modalities: [text], future: keep}\nopenai-compatibility: [{name: compat, base-url: https://example.test, api-key-entries: [{api-key: fixture}], models: [*model]}]\nrequest-retry: 1\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    act(() => result.current.setVisualValues({ requestRetry: '3' }));
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(parse(saved)['openai-compatibility']).toEqual(parse(yaml)['openai-compatibility']);
    expect(saved).toContain('# fixture comment');
    const config = normalizeConfigResponse(parse(saved));
    expect(config.openaiCompatibility?.[0].models?.[0].inputModalities).toEqual(['text']);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
  });
});
