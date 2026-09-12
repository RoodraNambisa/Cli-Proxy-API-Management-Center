import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

describe('image request timeout', () => {
  it('defaults both providers to disabled', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('images: {}\n'));
    expect(result.current.visualValues.images.codexRequestTimeoutSeconds).toBe('0');
    expect(result.current.visualValues.chatgptWebImageRequestTimeoutSeconds).toBe('0');
    expect(result.current.visualDirty).toBe(false);
  });
  it.each(['yaml', 'camel'])(
    'saves and reloads independent %s values, including disabling with zero',
    (style) => {
      const codexKey =
        style === 'yaml' ? 'codex-request-timeout-seconds' : 'codexRequestTimeoutSeconds';
      const webKey = style === 'yaml' ? 'request-timeout-seconds' : 'requestTimeoutSeconds';
      const yaml = `images:\n  ${codexKey}: 1200\n  chatgpt-web:\n    ${webKey}: 1800\n`;
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      expect(result.current.visualValues.images.codexRequestTimeoutSeconds).toBe('1200');
      expect(result.current.visualValues.chatgptWebImageRequestTimeoutSeconds).toBe('1800');
      const normalized = normalizeConfigResponse(parseYaml(yaml));
      expect(normalized.images?.codexRequestTimeoutSeconds).toBe(1200);
      expect(normalized.images?.chatgptWeb?.requestTimeoutSeconds).toBe(1800);
      act(() =>
        result.current.setVisualValues({
          images: { ...result.current.visualValues.images, codexRequestTimeoutSeconds: '0' },
          chatgptWebImageRequestTimeoutSeconds: '2400',
        })
      );
      expect(result.current.visualDirtyFields).toContain('images.codexRequestTimeoutSeconds');
      expect(result.current.visualDirtyFields).toContain('chatgptWebImageRequestTimeoutSeconds');
      const output = result.current.applyVisualChangesToYaml(yaml);
      const saved = parseYaml(output);
      expect(saved.images['codex-request-timeout-seconds']).toBe(0);
      expect(saved.images['chatgpt-web']['request-timeout-seconds']).toBe(2400);
      expect(saved.images).not.toHaveProperty('codexRequestTimeoutSeconds');
      expect(saved.images['chatgpt-web']).not.toHaveProperty('requestTimeoutSeconds');
      act(() => result.current.loadVisualValuesFromYaml(output));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.images.codexRequestTimeoutSeconds).toBe('0');
      act(() => result.current.setVisualValues({ chatgptWebImageRequestTimeoutSeconds: '0' }));
      const disabled = result.current.applyVisualChangesToYaml(output);
      expect(parseYaml(disabled).images['chatgpt-web']['request-timeout-seconds']).toBe(0);
    }
  );
  it.each(['0', '1', '1800', '86400', '-1', '1.5', '86401', 'invalid'])(
    'validates %s for both providers',
    (value) => {
      const errors = getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        images: { ...DEFAULT_VISUAL_VALUES.images, codexRequestTimeoutSeconds: value },
        chatgptWebImageRequestTimeoutSeconds: value,
      });
      const expected = ['0', '1', '1800', '86400'].includes(value)
        ? undefined
        : 'integer_range_0_86400';
      expect(errors['images.codexRequestTimeoutSeconds']).toBe(expected);
      expect(errors.chatgptWebImageRequestTimeoutSeconds).toBe(expected);
    }
  );
});
