import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('Independent image model lists', () => {
  it('keeps legacy default and missing lists, and defaults Web carrier to auto', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'images:\n  image-model: custom-old\n';
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.images.imageModel).toBe('custom-old');
    expect(result.current.visualValues.images.imageModels).toEqual([]);
    expect(result.current.visualValues.chatgptWebImageModels).toEqual([]);
    expect(result.current.visualValues.chatgptWebImageUpstreamModel).toBe('auto');
    const saved = parseYaml(result.current.applyVisualChangesToYaml(yaml));
    expect(saved.images['image-model']).toBe('custom-old');
    expect(saved.images).not.toHaveProperty('image-models');
    expect(saved.images['chatgpt-web'] ?? {}).not.toHaveProperty('image-models');
  });

  it('saves multiple Codex models and independent Web aliases without changing native mode or explicit carrier', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = `images:
  image-model: gpt-image-2
  chatgpt-web:
    upstream-model: custom-carrier
  native:
    generations:
      enabled: true
      models: [native-only]
`;
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    act(() =>
      result.current.setVisualValues({
        images: {
          ...result.current.visualValues.images,
          imageModels: ['gpt-image-2.5', ' gpt-image-2.5-flare ', 'gpt-image-2.5'],
        },
        chatgptWebImageModels: ['web-only', 'gpt-image-2.5-sunburst'],
      })
    );
    expect(result.current.visualDirtyFields).toContain('images.imageModels');
    expect(result.current.visualDirtyFields).toContain('chatgptWebImageModels');
    const output = result.current.applyVisualChangesToYaml(yaml);
    const saved = parseYaml(output);
    expect(saved.images['image-models']).toEqual(['gpt-image-2.5', 'gpt-image-2.5-flare']);
    expect(saved.images['chatgpt-web']['image-models']).toEqual([
      'web-only',
      'gpt-image-2.5-sunburst',
    ]);
    expect(saved.images['chatgpt-web']['upstream-model']).toBe('custom-carrier');
    expect(saved.images.native.generations.enabled).toBe(true);
    expect(saved.images.native.generations.models).toEqual(['native-only']);
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.images.imageModels).toEqual([
      'gpt-image-2.5',
      'gpt-image-2.5-flare',
    ]);
    expect(result.current.visualValues.chatgptWebImageModels).toEqual([
      'web-only',
      'gpt-image-2.5-sunburst',
    ]);
  });

  it.each(['image-models', 'imageModels'])(
    'clears %s lists without restoring stale values on reload',
    (key) => {
      const { result } = renderHook(() => useVisualConfig());
      const yaml = `images:\n  ${key}: [tool-old]\n  chatgpt-web:\n    ${key}: [web-old]\n`;
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      expect(result.current.visualValues.images.imageModels).toEqual(['tool-old']);
      expect(result.current.visualValues.chatgptWebImageModels).toEqual(['web-old']);
      act(() =>
        result.current.setVisualValues({
          images: { ...result.current.visualValues.images, imageModels: [] },
          chatgptWebImageModels: [],
        })
      );
      expect(result.current.visualDirty).toBe(true);
      const output = result.current.applyVisualChangesToYaml(yaml);
      const saved = parseYaml(output);
      expect(saved.images['image-models']).toEqual([]);
      expect(saved.images['chatgpt-web']['image-models']).toEqual([]);
      expect(saved.images).not.toHaveProperty('imageModels');
      expect(saved.images['chatgpt-web']).not.toHaveProperty('imageModels');
      act(() => result.current.loadVisualValuesFromYaml(output));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.images.imageModels).toEqual([]);
      expect(result.current.visualValues.chatgptWebImageModels).toEqual([]);
    }
  );

  it('clears dirty markers independently when restored', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('images: {}\n'));
    act(() => result.current.setVisualValues({ chatgptWebImageModels: ['new-alias'] }));
    expect(result.current.visualDirtyFields).toContain('chatgptWebImageModels');
    act(() => result.current.setVisualValues({ chatgptWebImageModels: [] }));
    expect(result.current.visualDirty).toBe(false);
    act(() =>
      result.current.setVisualValues({
        images: { ...result.current.visualValues.images, imageModels: ['gpt-image-2.5'] },
      })
    );
    expect(result.current.visualDirtyFields).toContain('images.imageModels');
    act(() =>
      result.current.setVisualValues({
        images: { ...result.current.visualValues.images, imageModels: [] },
      })
    );
    expect(result.current.visualDirty).toBe(false);
  });
});
