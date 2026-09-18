import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

const source = `codex:
  observe-quota: true
  future-codex: retained
  quota-auto-disable:
    enabled: true
    extension: keep
    rules:
      - providers: [codex]
        auth-priorities: [0, 3]
        weekly-remaining-percent: 10
        five-hour-remaining-percent: null
        future-rule: preserved
`;

describe('Codex passive quota auto-disable configuration', () => {
  it('leaves old configs disabled and does not insert rules on an unrelated edit', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('codex:\n  observe-quota: true\n'));
    expect(result.current.visualValues.codexQuotaAutoDisable).toEqual({
      enabled: false,
      rules: [],
    });
    act(() => result.current.setVisualValues({ debug: true }));
    expect(
      parse(result.current.applyVisualChangesToYaml('codex:\n  observe-quota: true\n')).codex[
        'quota-auto-disable'
      ]
    ).toBeUndefined();
  });

  it('saves independent thresholds, preserves unknown fields, and can clear all rules', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const initial = result.current.visualValues.codexQuotaAutoDisable;
    expect(initial.rules[0]).toMatchObject({
      weeklyRemainingPercent: '10',
      fiveHourRemainingPercent: '',
      authPriorities: ['0', '3'],
    });
    act(() =>
      result.current.setVisualValues({
        codexQuotaAutoDisable: {
          ...initial,
          rules: [
            {
              ...initial.rules[0],
              weeklyRemainingPercent: '',
              fiveHourRemainingPercent: '2.5',
              providers: [],
              authPriorities: [],
              credentialIds: ['short-id'],
            },
          ],
        },
      })
    );
    expect(result.current.visualDirtyFields).toContain('codexQuotaAutoDisable');
    const output = result.current.applyVisualChangesToYaml(source);
    expect(parse(output).codex).toMatchObject({
      'future-codex': 'retained',
      'quota-auto-disable': {
        enabled: true,
        extension: 'keep',
        rules: [
          {
            'weekly-remaining-percent': null,
            'five-hour-remaining-percent': 2.5,
            'future-rule': 'preserved',
            providers: [],
            'auth-priorities': [],
            'credential-ids': ['short-id'],
          },
        ],
      },
    });
    act(() => result.current.loadVisualValuesFromYaml(output));
    expect(result.current.visualDirty).toBe(false);
    act(() =>
      result.current.setVisualValues({ codexQuotaAutoDisable: { enabled: false, rules: [] } })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml(output)).codex['quota-auto-disable']
    ).toMatchObject({ enabled: false, rules: [] });
  });

  it('rejects invalid thresholds or priorities, but accepts zero and one ignored window', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const initial = result.current.visualValues.codexQuotaAutoDisable;
    for (const value of ['', '-1', '101', 'NaN', 'Infinity', '0x10']) {
      act(() =>
        result.current.setVisualValues({
          codexQuotaAutoDisable: {
            ...initial,
            rules: [{ ...initial.rules[0], weeklyRemainingPercent: value }],
          },
        })
      );
      expect(
        getVisualConfigValidationErrors(result.current.visualValues).codexQuotaAutoDisable
      ).toBeTruthy();
    }
    for (const value of ['0', '100', '10.1']) {
      act(() =>
        result.current.setVisualValues({
          codexQuotaAutoDisable: {
            ...initial,
            rules: [{ ...initial.rules[0], weeklyRemainingPercent: value }],
          },
        })
      );
      expect(
        getVisualConfigValidationErrors(result.current.visualValues).codexQuotaAutoDisable
      ).toBeUndefined();
    }
    act(() =>
      result.current.setVisualValues({
        codexQuotaAutoDisable: {
          ...initial,
          rules: [{ ...initial.rules[0], authPriorities: ['1.5'] }],
        },
      })
    );
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).codexQuotaAutoDisable
    ).toBeTruthy();
  });

  it('detaches inherited rules without modifying their YAML anchor', () => {
    const yaml = `defaults: &defaults
  quota-auto-disable:
    enabled: true
    rules:
      - weekly-remaining-percent: 12
codex:
  <<: *defaults
  observe-quota: true
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const initial = result.current.visualValues.codexQuotaAutoDisable;
    expect(initial.rules[0].weeklyRemainingPercent).toBe('12');
    act(() =>
      result.current.setVisualValues({
        codexQuotaAutoDisable: {
          ...initial,
          rules: [{ ...initial.rules[0], weeklyRemainingPercent: '7' }],
        },
      })
    );
    const saved = parse(result.current.applyVisualChangesToYaml(yaml), { merge: true });
    expect(saved.defaults['quota-auto-disable'].rules[0]['weekly-remaining-percent']).toBe(12);
    expect(saved.codex['quota-auto-disable'].rules[0]['weekly-remaining-percent']).toBe(7);
  });
});
