import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

const source = `response-model-rewrite:
  enabled: true
  extension: keep
  rules:
    - providers: [codex]
      auth-priorities: [0, -1]
      credential-ids: [abc123]
      request-models: [gpt-6-astra]
      future: preserved
`;

describe('response model rules', () => {
  it('loads, edits, persists unknown fields, disables, and removes rules', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const initial = result.current.visualValues.responseModelRewrite;
    expect(initial.enabled).toBe(true);
    expect(initial.rules[0].authPriorities).toEqual(['0', '-1']);
    act(() =>
      result.current.setVisualValues({
        responseModelRewrite: {
          ...initial,
          enabled: false,
          rules: [{ ...initial.rules[0], authPriorities: ['3'], requestModels: ['gpt-*'] }],
        },
      })
    );
    expect(result.current.visualDirtyFields).toContain('responseModelRewrite');
    const output = result.current.applyVisualChangesToYaml(source);
    const config = parse(output)['response-model-rewrite'];
    expect(config).toMatchObject({
      enabled: false,
      extension: 'keep',
      rules: [{ 'auth-priorities': [3], future: 'preserved', 'request-models': ['gpt-*'] }],
    });
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
    act(() =>
      result.current.setVisualValues({ responseModelRewrite: { enabled: false, rules: [] } })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml(output))['response-model-rewrite'].rules
    ).toEqual([]);
  });

  it('allows empty conditions and blocks invalid priorities', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const value = result.current.visualValues.responseModelRewrite;
    act(() =>
      result.current.setVisualValues({
        responseModelRewrite: {
          enabled: true,
          rules: [
            {
              ...value.rules[0],
              providers: [],
              authPriorities: [],
              credentialIds: [],
              requestModels: [],
            },
          ],
        },
      })
    );
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).responseModelRewrite
    ).toBeUndefined();
    act(() =>
      result.current.setVisualValues({
        responseModelRewrite: { ...value, rules: [{ ...value.rules[0], authPriorities: ['1.5'] }] },
      })
    );
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).responseModelRewrite
    ).toBeTruthy();
  });
});
