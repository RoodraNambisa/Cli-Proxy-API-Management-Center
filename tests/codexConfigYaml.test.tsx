import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const policy = '{passthrough-prompt-cache-key: true, optimize-multi-agent-v2: true, future: {number: 9007199254740993}}';

describe('Codex policy YAML references', () => {
  test.each([
    `defaults: &defaults ${policy}\ncodex: {<<: *defaults}\n`,
    `defaults: &defaults ${policy}\ncodex: *defaults\n`,
    `defaults: &defaults {codex: ${policy}}\n<<: *defaults\n`,
    `codex: &policy ${policy}\nother-policy: *policy\n`,
  ])('reads inherited policies and saves without changing other aliases: %s', (original) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualParseError).toBeNull();
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(true);
    expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
    act(() => result.current.setVisualValues({ codexPassthroughPromptCacheKey: false }));
    const saved = result.current.applyVisualChangesToYaml(original);
    const before = parse(original, { merge: true, intAsBigInt: true });
    const after = parse(saved, { merge: true, intAsBigInt: true });
    expect(after.codex['passthrough-prompt-cache-key']).toBe(false);
    expect(after.codex['optimize-multi-agent-v2']).toBe(true);
    expect(after.codex.future).toEqual(before.codex.future);
    expect(after.defaults).toEqual(before.defaults);
    expect(after['other-policy']).toEqual(before['other-policy']);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(false);
    expect(result.current.visualDirty).toBe(false);
  });

  test('validates inherited boolean types instead of silently treating them as absent', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(
      'defaults: &defaults {passthrough-prompt-cache-key: "false"}\ncodex: {<<: *defaults}\n'
    ));
    expect(result.current.visualParseError).toContain('passthrough-prompt-cache-key');
  });
});
