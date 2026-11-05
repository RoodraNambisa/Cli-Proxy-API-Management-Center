import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('GIF output ratio settings', () => {
  it('inherits the general tolerance and leaves default settings absent', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source = 'images:\n  chatgpt-web:\n    aspect-ratio-max-error-percent: 1\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualValues.chatgptWebGIFAspectRatioMaxErrorPercent).toBe('');
    expect(result.current.visualValues.chatgptWebGIFAllowAspectRatioMismatch).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebStrictSize: true }));
    expect(result.current.applyVisualChangesToYaml(source)).not.toContain('gif-');
  });
  it('preserves comments, false and zero, and clearing restores inheritance', () => {
    const { result } = renderHook(() => useVisualConfig());
    const source =
      '# keep\nimages:\n  chatgpt-web:\n    future: kept\n    gif-allow-aspect-ratio-mismatch: true # preference\n    gif-aspect-ratio-max-error-percent: 5\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() =>
      result.current.setVisualValues({
        chatgptWebGIFAllowAspectRatioMismatch: false,
        chatgptWebGIFAspectRatioMaxErrorPercent: '0',
      })
    );
    expect(result.current.visualDirtyFields).toContain('chatgptWebGIFAspectRatioMaxErrorPercent');
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved).images['chatgpt-web']).toMatchObject({
      'gif-allow-aspect-ratio-mismatch': false,
      'gif-aspect-ratio-max-error-percent': 0,
      future: 'kept',
    });
    expect(saved).toContain('# keep');
    expect(saved).toContain('# preference');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebGIFAspectRatioMaxErrorPercent: '' }));
    expect(result.current.applyVisualChangesToYaml(saved)).not.toContain(
      'gif-aspect-ratio-max-error-percent'
    );
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualValues.chatgptWebGIFAspectRatioMaxErrorPercent).toBe('5');
    expect(result.current.visualDirty).toBe(false);
  });
  it('saves first settings and preserves concurrent values on unrelated edits', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() =>
      result.current.setVisualValues({
        chatgptWebGIFAllowAspectRatioMismatch: true,
        chatgptWebGIFAspectRatioMaxErrorPercent: '5',
      })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml('port: 8317\n')).images['chatgpt-web']
    ).toMatchObject({
      'gif-allow-aspect-ratio-mismatch': true,
      'gif-aspect-ratio-max-error-percent': 5,
    });
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ chatgptWebIgnoreUnsupportedImageParams: true }));
    const saved = result.current.applyVisualChangesToYaml(
      'images:\n  chatgpt-web:\n    gif-aspect-ratio-max-error-percent: 4\n    gif-allow-aspect-ratio-mismatch: true\n'
    );
    expect(parse(saved).images['chatgpt-web']).toMatchObject({
      'gif-allow-aspect-ratio-mismatch': true,
      'gif-aspect-ratio-max-error-percent': 4,
    });
  });
  it.each(['-1', '11', 'NaN'])('validates tolerance %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.setVisualValues({ chatgptWebGIFAspectRatioMaxErrorPercent: value }));
    expect(result.current.visualValidationErrors.chatgptWebGIFAspectRatioMaxErrorPercent).toBe(
      'number_range_0_10'
    );
  });
  it.each([
    'gif-allow-aspect-ratio-mismatch: "true"',
    'gif-aspect-ratio-max-error-percent: "5"',
    'gif-aspect-ratio-max-error-percent: .nan',
  ])('rejects invalid YAML %s', (setting) => {
    const { result } = renderHook(() => useVisualConfig());
    let outcome: { ok: boolean } | undefined;
    act(() => {
      outcome = result.current.loadVisualValuesFromYaml(
        `images:\n  chatgpt-web:\n    ${setting}\n`
      );
    });
    expect(outcome?.ok).toBe(false);
  });
});
