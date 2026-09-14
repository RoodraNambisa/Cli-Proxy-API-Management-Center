import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

describe('image homepage timeout and retries', () => {
  it('defaults to disabled and saves a retry-only change without losing the total budget', () => {
    const yaml = 'images:\n  chatgpt-web:\n    request-timeout-seconds: 120 # keep\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebImageBootstrapTimeoutSeconds).toBe('0');
    expect(result.current.visualValues.chatgptWebImageBootstrapRetries).toBe('0');
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ chatgptWebImageBootstrapRetries: '1' }));
    expect(result.current.visualDirtyFields).toContain('chatgptWebImageBootstrapRetries');
    expect(result.current.visualDirty).toBe(true);
    const output = result.current.applyVisualChangesToYaml(yaml);
    expect(output).toContain('# keep');
    expect(parseYaml(output).images['chatgpt-web']).toMatchObject({
      'request-timeout-seconds': 120,
      'bootstrap-timeout-seconds': 0,
      'bootstrap-retries': 1,
    });
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
  });
  it.each(['yaml', 'camel'])('normalizes, saves, disables and reloads %s keys', (style) => {
    const timeoutKey = style === 'yaml' ? 'bootstrap-timeout-seconds' : 'bootstrapTimeoutSeconds';
    const retriesKey = style === 'yaml' ? 'bootstrap-retries' : 'bootstrapRetries';
    const yaml = `images:\n  chatgpt-web:\n    ${timeoutKey}: 10\n    ${retriesKey}: 2\n`;
    const normalized = normalizeConfigResponse(parseYaml(yaml));
    expect(normalized.images?.chatgptWeb?.bootstrapTimeoutSeconds).toBe(10);
    expect(normalized.images?.chatgptWeb?.bootstrapRetries).toBe(2);
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.chatgptWebImageBootstrapTimeoutSeconds).toBe('10');
    expect(result.current.visualValues.chatgptWebImageBootstrapRetries).toBe('2');
    act(() =>
      result.current.setVisualValues({
        chatgptWebImageBootstrapTimeoutSeconds: '0',
        chatgptWebImageBootstrapRetries: '0',
      })
    );
    expect(result.current.visualDirtyFields).toContain('chatgptWebImageBootstrapTimeoutSeconds');
    const output = result.current.applyVisualChangesToYaml(yaml);
    const values = parseYaml(output).images['chatgpt-web'];
    expect(values['bootstrap-timeout-seconds']).toBe(0);
    expect(values['bootstrap-retries']).toBe(0);
    expect(values).not.toHaveProperty('bootstrapTimeoutSeconds');
    expect(values).not.toHaveProperty('bootstrapRetries');
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
  });
  it.each([
    ['chatgptWebImageBootstrapTimeoutSeconds', '3600', undefined],
    ['chatgptWebImageBootstrapTimeoutSeconds', '3601', 'integer_range_0_3600'],
    ['chatgptWebImageBootstrapTimeoutSeconds', '1.5', 'integer_range_0_3600'],
    ['chatgptWebImageBootstrapRetries', '5', undefined],
    ['chatgptWebImageBootstrapRetries', '6', 'integer_range_0_5'],
    ['chatgptWebImageBootstrapRetries', '-1', 'integer_range_0_5'],
    ['chatgptWebImageBootstrapRetries', '1.5', 'integer_range_0_5'],
  ] as const)('validates %s=%s', (field, value, expected) => {
    const errors = getVisualConfigValidationErrors({ ...DEFAULT_VISUAL_VALUES, [field]: value });
    expect(errors[field]).toBe(expected);
  });
});
