import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

describe('independent response guard configuration', () => {
  it('preserves unknown values and explicit empty overrides while management stays off', () => {
    const source = `codex:
  state-override:
    enabled: false
  response-guard:
    enabled: true
    mode: enforce
    future: retained
    rules:
      - id: one
        credentials: [credential]
        future-rule: retained
        settings:
          match-model: true
          lengths: [292]
          future-setting: retained
      - id: two
        settings: {}
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const value = result.current.visualValues.codexResponseGuard;
    expect(value.enabled).toBe(true);
    expect(result.current.visualValues.codexStateOverride.enabled).toBe(false);
    const rules = value.rules!;
    act(() =>
      result.current.setVisualValues({
        codexResponseGuard: {
          ...value,
          rules: [
            rules[1],
            { ...rules[0], settings: { ...rules[0].settings, lengths: [], 'match-model': false } },
          ],
        },
      })
    );
    expect(result.current.visualDirtyFields).toContain('codexResponseGuard');
    const output = result.current.applyVisualChangesToYaml(source);
    const root = parse(output).codex;
    expect(root['state-override'].enabled).toBe(false);
    expect(root['response-guard']).toMatchObject({
      future: 'retained',
      rules: [
        { id: 'two' },
        {
          id: 'one',
          'future-rule': 'retained',
          settings: { lengths: [], 'match-model': false, 'future-setting': 'retained' },
        },
      ],
    });
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
  });

  it('does not add defaults on unrelated saves and rejects invalid lengths or duplicate overrides', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(
      parse(result.current.applyVisualChangesToYaml('port: 8317\n')).codex?.['response-guard']
    ).toBeUndefined();
    act(() =>
      result.current.setVisualValues({
        codexResponseGuard: { enabled: true, mode: 'enforce', lengths: [0] },
      })
    );
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).codexResponseGuard
    ).toBeTruthy();
    act(() =>
      result.current.setVisualValues({
        codexResponseGuard: {
          enabled: true,
          mode: 'observe',
          rules: [
            {
              id: 'r',
              settings: {},
              'plan-types': [],
              'model-overrides': [
                { id: 'a', models: ['sol'], settings: {} },
                { id: 'b', models: ['sol'], settings: {} },
              ],
            },
          ],
        },
      })
    );
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).codexResponseGuard
    ).toBeTruthy();
  });
});
