import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('image usage profile YAML', () => {
  it('keeps defaults implicit on unrelated saves', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.chatgptWebImageUsageProfile).toBe('by-model');
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(result.current.applyVisualChangesToYaml('port: 8317\n')).not.toContain(
      'estimation-profile'
    );
  });
  it('roundtrips modes and overrides while preserving comments and unknown fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source =
      '# keep\nchatgpt-web:\n  image-usage:\n    future: keep\n    model-profiles: # policy\n      gpt-image-2.5: gpt-image-2 # item\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageUsageProfile: 'gpt-image-2.6',
        chatgptWebImageUsageModelProfiles: {
          'gpt-image-2.5': 'gpt-image-2',
          'gpt-image-2.6': 'gpt-image-2.5',
        },
      })
    );
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(saved).toContain('# item');
    expect(saved).toContain('# policy');
    expect(saved).toContain('future: keep');
    expect(parse(saved)['chatgpt-web']['image-usage']['estimation-profile']).toBe('gpt-image-2.6');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebImageUsageModelProfiles: {} }));
    expect(result.current.applyVisualChangesToYaml(saved)).not.toContain('model-profiles');
  });
  it('saves renamed aliases and their moved policy atomically', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source =
      'images:\n  chatgpt-web:\n    image-models: [old]\nchatgpt-web:\n  image-usage:\n    model-profiles: {old: gpt-image-2.5}\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageModels: ['new'],
        chatgptWebImageUsageModelProfiles: { new: 'gpt-image-2.5' },
      })
    );
    const saved = parse(result.current.applyVisualChangesToYaml(source));
    expect(saved.images['chatgpt-web']['image-models']).toEqual(['new']);
    expect(saved['chatgpt-web']['image-usage']['model-profiles']).toEqual({ new: 'gpt-image-2.5' });
    expect(result.current.visualValidationErrors.chatgptWebImageUsageModelProfiles).toBeUndefined();
  });
  it('rejects orphan overrides and retains concurrent server policies on unrelated saves', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageUsageModelProfiles: { missing: 'gpt-image-2' },
      })
    );
    expect(result.current.visualValidationErrors.chatgptWebImageUsageModelProfiles).toBe(
      'image_usage_profiles'
    );
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ port: '8318' }));
    const saved = parse(
      result.current.applyVisualChangesToYaml(
        'port: 8317\nchatgpt-web:\n  image-usage:\n    estimation-profile: gpt-image-2.5\n'
      )
    );
    expect(saved['chatgpt-web']['image-usage']['estimation-profile']).toBe('gpt-image-2.5');
  });
});
