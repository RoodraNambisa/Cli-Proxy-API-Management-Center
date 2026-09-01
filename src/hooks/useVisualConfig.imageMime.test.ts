import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';

describe('ChatGPT Web image input and error visual configuration', () => {
  it('loads kebab-case YAML values', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml(`
images:
  chatgpt-web:
    sanitize-error-responses: true
    normalize-mismatched-image-mime: true
    normalize-remote-image-mime: false
`);
    });

    expect(result.current.visualValues.chatgptWebSanitizeErrorResponses).toBe(true);
    expect(result.current.visualValues.chatgptWebNormalizeMismatchedImageMime).toBe(true);
    expect(result.current.visualValues.chatgptWebNormalizeRemoteImageMime).toBe(false);
  });

  it('uses safe defaults and writes all settings back to YAML', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml('images: {}\n');
    });
    expect(result.current.visualValues.chatgptWebNormalizeMismatchedImageMime).toBe(false);
    expect(result.current.visualValues.chatgptWebNormalizeRemoteImageMime).toBe(true);
    expect(result.current.visualValues.chatgptWebSanitizeErrorResponses).toBe(false);

    act(() => {
      result.current.setVisualValues({
        chatgptWebSanitizeErrorResponses: true,
        chatgptWebNormalizeMismatchedImageMime: true,
        chatgptWebNormalizeRemoteImageMime: false,
      });
    });
    const output = result.current.applyVisualChangesToYaml('images: {}\n');
    const parsed = parseYaml(output) as {
      images: {
        'chatgpt-web': {
          'sanitize-error-responses': boolean;
          'normalize-mismatched-image-mime': boolean;
          'normalize-remote-image-mime': boolean;
        };
      };
    };
    expect(parsed.images['chatgpt-web']['sanitize-error-responses']).toBe(true);
    expect(parsed.images['chatgpt-web']['normalize-mismatched-image-mime']).toBe(true);
    expect(parsed.images['chatgpt-web']['normalize-remote-image-mime']).toBe(false);
  });

  it('marks both MIME settings dirty and clears them when restored', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml('images: {}\n');
    });

    act(() => {
      result.current.setVisualValues({ chatgptWebNormalizeMismatchedImageMime: true });
    });
    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('chatgptWebNormalizeMismatchedImageMime');

    act(() => {
      result.current.setVisualValues({ chatgptWebNormalizeMismatchedImageMime: false });
    });
    expect(result.current.visualDirty).toBe(false);

    act(() => {
      result.current.setVisualValues({ chatgptWebNormalizeRemoteImageMime: false });
    });
    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('chatgptWebNormalizeRemoteImageMime');

    act(() => {
      result.current.setVisualValues({ chatgptWebNormalizeRemoteImageMime: true });
    });
    expect(result.current.visualDirty).toBe(false);
  });

  it('tracks the error sanitization setting independently', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml('images: {}\n');
      result.current.setVisualValues({ chatgptWebSanitizeErrorResponses: true });
    });

    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('chatgptWebSanitizeErrorResponses');

    act(() => {
      result.current.setVisualValues({ chatgptWebSanitizeErrorResponses: false });
    });
    expect(result.current.visualDirty).toBe(false);
  });
});
