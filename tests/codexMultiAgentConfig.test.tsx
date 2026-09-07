import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';

describe('Codex multi-agent v2 configuration data', () => {
  test.each(['request-retry: 2\n', 'request-retry: 2\ncodex:\n  future-field: retained\n'])(
    'defaults off and preserves unrelated YAML through both values',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(false);
      act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: true }));
      expect(result.current.visualDirtyFields).toContain('codexOptimizeMultiAgentV2');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved)).toMatchObject({
        'request-retry': 2,
        codex: { 'optimize-multi-agent-v2': true },
      });
      if (original.includes('future-field')) {
        expect(parse(saved).codex['future-field']).toBe('retained');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
      act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(false);
    }
  );

  test('normalizes API aliases and canonicalizes edited YAML', () => {
    for (const field of ['optimize-multi-agent-v2', 'optimizeMultiAgentV2']) {
      for (const value of [true, false]) {
        expect(
          normalizeConfigResponse({ codex: { [field]: value } }).codex?.optimizeMultiAgentV2
        ).toBe(value);
      }
    }
    const original = 'codex:\n  optimizeMultiAgentV2: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
    act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex['optimize-multi-agent-v2']).toBe(false);
    expect(saved.codex).not.toHaveProperty('optimizeMultiAgentV2');
    act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML type %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() =>
      result.current.loadVisualValuesFromYaml('codex:\n  optimize-multi-agent-v2: ' + value + '\n')
    );
    expect(result.current.visualParseError).toContain('optimize-multi-agent-v2');
  });
});
