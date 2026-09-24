import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('Web image reasoning mode', () => {
  it('defaults to following the existing carrier and does not rewrite a custom carrier', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'images:\n  chatgpt-web:\n    upstream-model: custom\n';
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebImageReasoningMode).toBe('auto');
    expect(result.current.visualValues.chatgptWebImageUpstreamModel).toBe('custom');
    act(() => result.current.setVisualValues({ chatgptWebImageReasoningMode: 'instant' }));
    expect(result.current.visualValidationErrors.chatgptWebImageReasoningMode).toBe(
      'image_instant_requires_auto'
    );
    expect(result.current.visualValues.chatgptWebImageUpstreamModel).toBe('custom');
    act(() => result.current.setVisualValues({ chatgptWebImageUpstreamModel: 'auto' }));
    expect(result.current.visualValidationErrors.chatgptWebImageReasoningMode).toBeUndefined();
  });

  it.each(['reasoning-mode', 'reasoningMode'])('loads %s and saves/reloads both modes', (key) => {
    const { result } = renderHook(() => useVisualConfig());
    let yaml = `images:\n  chatgpt-web:\n    ${key}: instant\n    request-timeout-seconds: 120\n    future-option: keep\n`;
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebImageReasoningMode).toBe('instant');
    for (const mode of ['auto', 'instant', 'low', 'medium', 'high', 'xhigh']) {
      act(() => result.current.setVisualValues({ chatgptWebImageReasoningMode: mode }));
      expect(result.current.visualDirtyFields).toContain('chatgptWebImageReasoningMode');
      yaml = result.current.applyVisualChangesToYaml(yaml);
      const saved = parse(yaml).images['chatgpt-web'];
      expect(saved['reasoning-mode']).toBe(mode);
      expect(saved).not.toHaveProperty('reasoningMode');
      expect(saved['request-timeout-seconds']).toBe(120);
      expect(saved['future-option']).toBe('keep');
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.chatgptWebImageReasoningMode).toBe(mode);
    }
  });

  it('saves a newly configured mode when no image config exists and clears dirty on undo', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ chatgptWebImageReasoningMode: 'instant' }));
    const saved = parse(result.current.applyVisualChangesToYaml('port: 8317\n'));
    expect(saved.images['chatgpt-web']['reasoning-mode']).toBe('instant');
    act(() => result.current.setVisualValues({ chatgptWebImageReasoningMode: 'auto' }));
    expect(result.current.visualDirty).toBe(false);
  });

  it('rejects unsupported values instead of silently changing to auto', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('images:\n  chatgpt-web:\n    reasoning-mode: turbo\n'));
    expect(result.current.visualValues.chatgptWebImageReasoningMode).toBe('turbo');
    expect(result.current.visualValidationErrors.chatgptWebImageReasoningMode).toBe('image_reasoning_mode');
  });
  it.each(['false', '0', 'null'])('rejects non-string YAML %s', (value) => {
    const {result} = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`images:\n  chatgpt-web:\n    reasoning-mode: ${value}\n`));
    expect(result.current.visualParseError).toContain('reasoning-mode must be a string');
  });
});
