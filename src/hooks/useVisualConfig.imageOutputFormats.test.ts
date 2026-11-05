import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';
describe('Web output format YAML', () => {
  it('does not materialize default aliases or format policies on unrelated edits', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source = 'port: 8317\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ port: '8318' }));
    const yaml = result.current.applyVisualChangesToYaml(source);
    expect(yaml).not.toContain('model-output-formats');
    expect(result.current.visualValues.chatgptWebImageModels).toEqual([]);
  });
  it('saves only overrides, preserves comments/unknown fields, resets, and restores source', () => {
    const { result } = renderHook(() => useVisualConfig());
    let source =
      '# keep\nimages:\n  chatgpt-web:\n    future: keep\n    model-output-formats: # format policy\n      gpt-image-2.5: [png] # alias policy\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() =>
      result.current.setVisualValues({
        chatgptWebModelOutputFormats: { 'gpt-image-2.5': ['png'], 'gpt-image-2.6': ['gif'] },
      })
    );
    source = result.current.applyVisualChangesToYaml(source);
    expect(parse(source).images['chatgpt-web']['model-output-formats']).toEqual({
      'gpt-image-2.5': ['png'],
      'gpt-image-2.6': ['gif'],
    });
    expect(source).toContain('# alias policy');
    expect(source).toContain('# format policy');
    expect(source).toContain('future: keep');
    expect(parse(source).images['chatgpt-web']['image-models']).toBeUndefined();
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebModelOutputFormats: {} }));
    expect(result.current.visualDirtyFields).toContain('chatgptWebModelOutputFormats');
    expect(result.current.applyVisualChangesToYaml(source)).not.toContain('model-output-formats');
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualValues.chatgptWebModelOutputFormats['gpt-image-2.6']).toEqual([
      'gif',
    ]);
  });
  it('persists a first override without writing the default model list', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() =>
      result.current.setVisualValues({ chatgptWebModelOutputFormats: { 'gpt-image-2.6': ['png'] } })
    );
    const saved = parse(result.current.applyVisualChangesToYaml('port: 8317\n'));
    expect(saved.images['chatgpt-web']['model-output-formats']).toEqual({
      'gpt-image-2.6': ['png'],
    });
    expect(saved.images['chatgpt-web']['image-models']).toBeUndefined();
  });
  it('preserves a concurrent format change when another image option changes', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ chatgptWebIgnoreUnsupportedImageParams: true }));
    const source =
      'images:\n  chatgpt-web:\n    model-output-formats:\n      gpt-image-2.5: [gif]\n';
    expect(
      parse(result.current.applyVisualChangesToYaml(source)).images['chatgpt-web'][
        'model-output-formats'
      ]
    ).toEqual({ 'gpt-image-2.5': ['gif'] });
  });
  it('validates empty overrides and missing aliases', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() =>
      result.current.setVisualValues({ chatgptWebModelOutputFormats: { missing: ['png'] } })
    );
    expect(result.current.visualValidationErrors.chatgptWebModelOutputFormats).toBe(
      'image_output_formats'
    );
    act(() => result.current.setVisualValues({ chatgptWebImageModels: ['missing'] }));
    expect(result.current.visualValidationErrors.chatgptWebModelOutputFormats).toBeUndefined();
    act(() => result.current.setVisualValues({ chatgptWebModelOutputFormats: { missing: [] } }));
    expect(result.current.visualValidationErrors.chatgptWebModelOutputFormats).toBe(
      'image_output_formats'
    );
  });
});
