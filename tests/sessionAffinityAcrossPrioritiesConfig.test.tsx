import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useConfigStore } from '@/stores/useConfigStore';

describe('session affinity across priorities configuration data', () => {
  test('explicit canonical null keeps default off instead of a shadowing alias', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-across-priorities: null\n  sessionAffinityAcrossPriorities: true\n'));
    expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
    expect(normalizeConfigResponse({ routing: {
      'session-affinity-across-priorities': null,
      sessionAffinityAcrossPriorities: true,
    } }).routingSessionAffinityAcrossPriorities).toBeUndefined();
  });

  test.each(['request-retry: 2\n', 'routing:\n  session-affinity: false\n  future-setting: kept\n'])(
    'keeps default off, saves both values and preserves unrelated YAML',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
      act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: true }));
      expect(result.current.visualDirtyFields).toContain('routingSessionAffinityAcrossPriorities');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved).routing['session-affinity-across-priorities']).toBe(true);
      expect(result.current.visualValues.routingSessionAffinity).toBe(false);
      if (original.includes('future-setting')) {
        expect(parse(saved).routing['future-setting']).toBe('kept');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
      act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      expect(parse(disabled).routing['session-affinity-across-priorities']).toBe(false);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
    }
  );

  test('reads API aliases, updates cache and canonicalizes edited YAML', () => {
    for (const field of ['session-affinity-across-priorities', 'sessionAffinityAcrossPriorities']) {
      for (const value of [true, false]) {
        expect(normalizeConfigResponse({ routing: { [field]: value } }).routingSessionAffinityAcrossPriorities).toBe(value);
      }
    }
    const previous = useConfigStore.getState();
    try {
      useConfigStore.getState().updateConfigValue('routing/session-affinity-across-priorities', true);
      expect(useConfigStore.getState().config?.routingSessionAffinityAcrossPriorities).toBe(true);
    } finally {
      useConfigStore.setState(previous, true);
    }
    const original = 'routing:\n  sessionAffinityAcrossPriorities: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(true);
    act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.routing['session-affinity-across-priorities']).toBe(false);
    expect(saved.routing).not.toHaveProperty('sessionAffinityAcrossPriorities');
    act(() => result.current.setVisualValues({ routingSessionAffinityAcrossPriorities: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML value %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-across-priorities: ' + value + '\n'));
    expect(result.current.visualParseError).toContain('session-affinity-across-priorities');
  });
});
