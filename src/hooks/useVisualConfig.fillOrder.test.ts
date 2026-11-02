import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
import { useVisualConfig } from './useVisualConfig';
const source = `routing:
  session-affinity: true
  session-affinity-capacity-spillover: true # global borrowing
  priority-overrides:
    - priority: 5
      session-affinity-capacity-spillover: false # explicit override
      extension: retained
`;
it('preserves explicit false, removes inherited overrides, and retains unrelated YAML', () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(source));
  expect(result.current.visualValues.routingSessionAffinityCapacitySpillover).toBe(true);
  const rule = result.current.visualValues.routingPriorityOverrides[0];
  expect(rule.sessionAffinityCapacitySpillover).toBe(false);
  act(() => result.current.setVisualValues({ routingSessionAffinityCapacitySpillover: false }));
  const saved = result.current.applyVisualChangesToYaml(source);
  expect(parse(saved).routing['session-affinity-capacity-spillover']).toBe(false);
  expect(saved).toContain('# global borrowing');
  expect(saved).toContain('# explicit override');
  act(() =>
    result.current.setVisualValues({
      routingPriorityOverrides: [{ ...rule, sessionAffinityCapacitySpillover: undefined }],
    })
  );
  const inherited = parse(result.current.applyVisualChangesToYaml(source)).routing[
    'priority-overrides'
  ][0];
  expect(inherited['session-affinity-capacity-spillover']).toBeUndefined();
  expect(inherited.extension).toBe('retained');
});
it('keeps new settings absent until edited', () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml('routing: {strategy: fill-first}\n'));
  expect(result.current.visualValues.routingSessionAffinityCapacitySpillover).toBe(false);
  act(() => result.current.setVisualValues({ debug: true }));
  expect(
    result.current.applyVisualChangesToYaml('routing: {strategy: fill-first}\n')
  ).not.toContain('session-affinity-capacity-spillover');
});
