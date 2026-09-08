import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useConfigStore } from '@/stores/useConfigStore';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('session affinity history configuration data', () => {
  test('explicit canonical null keeps default off instead of a shadowing alias', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-lcp: null\n  sessionAffinityLCP: true\n'));
    expect(result.current.visualValues.routingSessionAffinityLCP).toBe(false);
    expect(normalizeConfigResponse({ routing: {
      'session-affinity-lcp': null,
      sessionAffinityLCP: true,
    } }).routingSessionAffinityLCP).toBeUndefined();
  });

  test.each(['request-retry: 2\n', 'routing:\n  session-affinity: false\n  future-setting: kept\n'])(
    'keeps default off, saves both values and preserves unrelated YAML',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.routingSessionAffinityLCP).toBe(false);
      act(() => result.current.setVisualValues({ routingSessionAffinityLCP: true }));
      expect(result.current.visualDirtyFields).toContain('routingSessionAffinityLCP');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved).routing['session-affinity-lcp']).toBe(true);
      expect(result.current.visualValues.routingSessionAffinity).toBe(false);
      if (original.includes('future-setting')) {
        expect(parse(saved).routing['future-setting']).toBe('kept');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.routingSessionAffinityLCP).toBe(true);
      act(() => result.current.setVisualValues({ routingSessionAffinityLCP: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      expect(parse(disabled).routing['session-affinity-lcp']).toBe(false);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.routingSessionAffinityLCP).toBe(false);
    }
  );

  test('reads API aliases, updates cache and canonicalizes edited YAML', () => {
    for (const field of ['session-affinity-lcp', 'sessionAffinityLCP']) {
      for (const value of [true, false]) {
        expect(normalizeConfigResponse({ routing: { [field]: value } }).routingSessionAffinityLCP).toBe(value);
      }
    }
    const previous = useConfigStore.getState();
    try {
      useConfigStore.getState().updateConfigValue('routing/session-affinity-lcp', true);
      expect(useConfigStore.getState().config?.routingSessionAffinityLCP).toBe(true);
    } finally {
      useConfigStore.setState(previous, true);
    }
    const original = 'routing:\n  sessionAffinityLCP: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.routingSessionAffinityLCP).toBe(true);
    act(() => result.current.setVisualValues({ routingSessionAffinityLCP: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.routing['session-affinity-lcp']).toBe(false);
    expect(saved.routing).not.toHaveProperty('sessionAffinityLCP');
    act(() => result.current.setVisualValues({ routingSessionAffinityLCP: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML value %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  session-affinity-lcp: ' + value + '\n'));
    expect(result.current.visualParseError).toContain('session-affinity-lcp');
  });
});
