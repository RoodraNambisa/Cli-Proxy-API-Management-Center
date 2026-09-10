import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import type { CodexConfig } from '@/types/config';
import type { VisualConfigValues } from '@/types/visualConfig';

const policies: Array<[string, keyof CodexConfig, keyof VisualConfigValues]> = [
  ['passthrough-prompt-cache-key', 'passthroughPromptCacheKey', 'codexPassthroughPromptCacheKey'],
  ['stream-bootstrap-buffering', 'streamBootstrapBuffering', 'codexStreamBootstrapBuffering'],
  ['estimate-claude-input-tokens', 'estimateClaudeInputTokens', 'codexEstimateClaudeInputTokens'],
  ['observe-quota', 'observeQuota', 'codexObserveQuota'],
  ['orphan-delegation-compatibility', 'orphanDelegationCompatibility', 'codexOrphanDelegationCompatibility'],
  ['optimize-multi-agent-v2', 'optimizeMultiAgentV2', 'codexOptimizeMultiAgentV2'],
];

test.each(policies)('canonical null keeps %s disabled even when a camel alias is true', (key, alias, visual) => {
  expect(normalizeConfigResponse({ codex: {} }).codex?.[alias]).toBe(false);
  expect(normalizeConfigResponse({ codex: { [key]: null, [alias]: true } }).codex?.[alias]).toBe(false);
  expect(normalizeConfigResponse({ codex: { [alias]: true } }).codex?.[alias]).toBe(true);
  const original = `codex:\n  ${key}: null\n  ${alias}: true\n  future-field: retained\n`;
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  expect(result.current.visualParseError).toBeNull();
  expect(result.current.visualValues[visual]).toBe(false);
  act(() => result.current.setVisualValues({ debug: true }));
  const saved = result.current.applyVisualChangesToYaml(original);
  const codex = parse(saved).codex;
  expect(codex[key]).toBe(false);
  expect(codex).not.toHaveProperty(alias);
  expect(codex['future-field']).toBe('retained');
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualValues[visual]).toBe(false);
  expect(result.current.visualDirty).toBe(false);
});

test.each(policies)('%s rejects invalid API and YAML values instead of enabling it', (key) => {
  for (const value of ['true', 1, []]) {
    expect(() => normalizeConfigResponse({ codex: { [key]: value } })).toThrow(key);
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`codex:\n  ${key}: ${JSON.stringify(value)}\n`));
    expect(result.current.visualParseError).toContain(key);
  }
});
