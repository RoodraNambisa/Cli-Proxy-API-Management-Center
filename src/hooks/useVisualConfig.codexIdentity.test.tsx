import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

describe('Codex identity policy', () => {
  it('keeps defaults implicit and writes explicit false values', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.codexIdentityConfuseRequireSessionAffinity).toBe(true);
    expect(result.current.visualValues.codexIdentityConfuseRestoreResponse).toBe(true);
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(parse(result.current.applyVisualChangesToYaml('port: 8317\n')).codex).toBeUndefined();
    act(() =>
      result.current.setVisualValues({
        codexIdentityConfuseRequireSessionAffinity: false,
        codexIdentityConfuseRestoreResponse: false,
      })
    );
    expect(result.current.visualDirtyFields).toContain('codexIdentityConfuseRestoreResponse');
    const saved = parse(result.current.applyVisualChangesToYaml('port: 8317\n'));
    expect(saved.codex['identity-confuse-require-session-affinity']).toBe(false);
    expect(saved.codex['identity-confuse-restore-response']).toBe(false);
  });
  it('preserves nested unknown fields and comments while resetting known overrides', () => {
    const yaml =
      'routing:\n  priority-overrides:\n    - priority: 5\n      # identity note\n      codex:\n        identity-confuse: false # keep comment\n        future-setting: untouched\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.routingPriorityOverrides[0];
    expect(rule.codex?.['identity-confuse']).toBe(false);
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [
          { ...rule, codex: { ...rule.codex, 'identity-confuse-restore-response': false } },
        ],
      })
    );
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(saved).toContain('# identity note');
    expect(saved).toContain('# keep comment');
    expect(parse(saved).routing['priority-overrides'][0].codex).toEqual({
      'identity-confuse': false,
      'identity-confuse-restore-response': false,
      'future-setting': 'untouched',
    });
    act(() =>
      result.current.setVisualValues({ routingPriorityOverrides: [{ ...rule, codex: undefined }] })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml(yaml)).routing['priority-overrides'][0].codex
    ).toEqual({ 'future-setting': 'untouched' });
  });
  it('validates pool limits before saving', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() =>
      result.current.loadVisualValuesFromYaml(
        'routing:\n  priority-overrides:\n    - priority: 5\n      codex:\n        session-identity-pool-size: 65\n'
      )
    );
    expect(Object.values(getVisualConfigValidationErrors(result.current.visualValues))).toContain(
      'integer_range_1_64'
    );
  });
});
