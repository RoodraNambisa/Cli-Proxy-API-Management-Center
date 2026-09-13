import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const policies = `  strategy: weighted-round-robin
  session-affinity: true
  session-affinity-use-history: true
  session-affinity-lcp: true
  session-affinity-subagents: true
  session-affinity-across-priorities: true
  future-number: 9007199254740993
`;

test.each([
  `defaults: &policy\n${policies}routing:\n  <<: *policy\n`,
  `defaults: &policy\n${policies}routing: *policy\n`,
  `defaults: &root\n  routing:\n${policies.split('\n').filter(Boolean).map((line) => '  ' + line).join('\n')}\n<<: *root\n`,
  `routing: &policy\n${policies}unrelated: *policy\n`,
])('loads and disables inherited routing policies without changing their source', (original) => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(original));
  expect(result.current.visualParseError).toBeNull();
  expect(result.current.visualValues).toMatchObject({
    routingStrategy: 'weighted-round-robin', routingSessionAffinity: true,
    routingSessionAffinityLCP: true, routingSessionAffinitySubagents: true,
    routingSessionAffinityAcrossPriorities: true,
    routingSessionAffinityUseHistory: true,
  });
  act(() => result.current.setVisualValues({
    routingStrategy: 'round-robin', routingSessionAffinityLCP: false,
    routingSessionAffinitySubagents: false, routingSessionAffinityAcrossPriorities: false,
    routingSessionAffinityUseHistory: false,
  }));
  expect(result.current.visualDirty).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(original);
  const decoded = parse(saved, { merge: true, intAsBigInt: true });
  expect(decoded.routing).toMatchObject({
    strategy: 'round-robin', 'session-affinity': true, 'session-affinity-lcp': false,
    'session-affinity-subagents': false, 'session-affinity-across-priorities': false,
    'session-affinity-use-history': false,
    'future-number': 9007199254740993n,
  });
  const before = parse(original, { merge: true, intAsBigInt: true });
  if (before.defaults) expect(decoded.defaults).toEqual(before.defaults);
  if (before.unrelated) expect(decoded.unrelated).toEqual(before.unrelated);
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualValues.routingSessionAffinityLCP).toBe(false);
  expect(result.current.visualValues.routingSessionAffinitySubagents).toBe(false);
  expect(result.current.visualValues.routingSessionAffinityAcrossPriorities).toBe(false);
  expect(result.current.visualValues.routingSessionAffinityUseHistory).toBe(false);
  expect(result.current.visualDirty).toBe(false);
});
