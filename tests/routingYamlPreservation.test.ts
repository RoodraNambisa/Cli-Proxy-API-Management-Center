import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { useVisualConfig } from '@/hooks/useVisualConfig';

const source = `routing:
  strategy: round-robin
  extension: keep
  priority-overrides:
    - priority: 10
      strategy: random
      rule-extension: first
      future-integer: 9007199254740993
      subscription-overrides:
        - providers: [codex]
          plan-types: [pro]
          per-auth-request-limit: 3
          subscription-extension: preserve
    - priority: 0
      strategy: fill-first
      rule-extension: second
`;

describe('routing YAML extension preservation', () => {
  test('leaves unedited rules and scalar precision intact when changing the global strategy', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ routingStrategy: 'weighted-round-robin' }));
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved).routing['priority-overrides'][0]).toMatchObject({
      'rule-extension': 'first',
      'subscription-overrides': [expect.objectContaining({ 'subscription-extension': 'preserve' })],
    });
    expect(saved).toContain('9007199254740993');
  });

  test('keeps extensions with their rule when editing, reordering and clearing known fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const [first, second] = result.current.visualValues.routingPriorityOverrides;
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [
          { ...second, strategy: 'weighted-round-robin' },
          {
            ...first,
            priority: '9',
            strategy: '',
            subscriptionOverrides: first.subscriptionOverrides.map((rule) => ({
              ...rule,
              perAuthRequestLimit: '0',
            })),
          },
        ],
      })
    );
    const saved = result.current.applyVisualChangesToYaml(source);
    const rules = parse(saved).routing['priority-overrides'];
    expect(rules[0]).toMatchObject({
      priority: 0,
      strategy: 'weighted-round-robin',
      'rule-extension': 'second',
    });
    expect(rules[1]).toMatchObject({
      priority: 9,
      'rule-extension': 'first',
      'subscription-overrides': [
        expect.objectContaining({
          'per-auth-request-limit': 0,
          'subscription-extension': 'preserve',
        }),
      ],
    });
    expect(rules[1]).not.toHaveProperty('strategy');
    expect(saved).toContain('9007199254740993');
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
  });

  test('does not attach a deleted rule extension to a new rule', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const first = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [
          { ...first, clientId: 'new-rule', priority: '7', subscriptionOverrides: [] },
        ],
      })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml(source)).routing['priority-overrides']
    ).toEqual([{ priority: 7, strategy: 'random' }]);
  });

  test('matches latest server rules by their previous priority, not their old array index', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const first = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [{ ...first, priority: '8', strategy: 'weighted-round-robin' }],
      })
    );
    const latest =
      'routing:\n  priority-overrides:\n    - priority: 0\n      rule-extension: second\n    - priority: 10\n      rule-extension: updated-first\n';
    expect(
      parse(result.current.applyVisualChangesToYaml(latest)).routing['priority-overrides'][0]
    ).toMatchObject({ priority: 8, 'rule-extension': 'updated-first' });
  });

  test('editing an aliased list does not redefine anchors owned by the source template', () => {
    const yaml = `rule-source: &rules
  - &original-rule
    priority: 10
    strategy: random
    extension: anchor
routing:
  priority-overrides: *rules
after: *original-rule
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [{ ...rule, strategy: 'weighted-round-robin' }],
      })
    );
    const saved = parse(result.current.applyVisualChangesToYaml(yaml));
    expect(saved.routing['priority-overrides'][0]).toMatchObject({
      strategy: 'weighted-round-robin',
      extension: 'anchor',
    });
    expect(saved.after.strategy).toBe('random');
    expect(saved['rule-source'][0].strategy).toBe('random');
  });

  test('matches reordered server subscription scopes before merging unknown extensions', () => {
    const yaml = `routing:
  priority-overrides:
    - priority: 10
      subscription-overrides:
        - providers: [codex]
          plan-types: [ChatGPTProPlan]
          per-auth-request-limit: 3
        - providers: [claude]
          plan-types: [plus]
          per-auth-request-limit: 6
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [
          {
            ...rule,
            subscriptionOverrides: [{ ...rule.subscriptionOverrides[0], perAuthRequestLimit: '0' }],
          },
        ],
      })
    );
    const latest = `routing:
  priority-overrides:
    - priority: 10
      subscription-overrides:
        - providers: [claude]
          plan-types: [plus]
          extension: second
        - providers: [CODEX]
          plan-types: [pro]
          extension: first
`;
    const saved = parse(result.current.applyVisualChangesToYaml(latest));
    expect(saved.routing['priority-overrides'][0]['subscription-overrides']).toEqual([
      {
        providers: ['codex'],
        'plan-types': ['pro'],
        'per-auth-request-limit': 0,
        extension: 'first',
      },
    ]);
  });

  test('clearing a known field cannot restore its old value through a YAML merge', () => {
    const yaml = `defaults: &defaults
  strategy: fill-first
  extension: inherited
routing:
  priority-overrides:
    - <<: *defaults
      priority: 10
      strategy: random
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({ routingPriorityOverrides: [{ ...rule, strategy: '' }] })
    );
    const saved = parse(result.current.applyVisualChangesToYaml(yaml), { merge: true });
    expect(saved.routing['priority-overrides'][0]).toEqual({
      priority: 10,
      extension: 'inherited',
    });
    expect(saved.defaults.strategy).toBe('fill-first');
  });

  test('resolves nested alias values at their original document position', () => {
    const yaml = `first: &label {value: first}
rules: &rules
  - priority: 10
    extension: *label
later: &label {value: later}
routing:
  priority-overrides: *rules
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.routingPriorityOverrides[0];
    act(() =>
      result.current.setVisualValues({
        routingPriorityOverrides: [{ ...rule, strategy: 'weighted-round-robin' }],
      })
    );
    const saved = parse(result.current.applyVisualChangesToYaml(yaml));
    expect(saved.routing['priority-overrides'][0].extension).toEqual({ value: 'first' });
  });
});
