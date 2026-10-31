import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { getVisualConfigValidationErrors, useVisualConfig } from './useVisualConfig';

const source = `auth-model-exclusions:
  # shared exclusion
  - models: [excluded]
    priorities: [3, 5]
    disable-image-generation: true # image policy
    future-option: retained
  - models: [another]
    priorities: [7]
    disable-image-generation: false # explicit false
    extension: second
`;

describe('per-rule image priorities', () => {
  it('shadows merged scopes while keeping shared alias users unchanged', () => {
    const yaml = 'defaults: &defaults {models: [excluded], priorities: [3, 5], disable-image-generation: true, disable-image-generation-priorities: [5], future-option: keep}\nauth-model-exclusions:\n  - <<: *defaults\nother-use: *defaults\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const rule = result.current.visualValues.authModelExclusions[0];
    expect(rule.disableImageGenerationPriorities).toEqual(['5']);
    act(() => result.current.setVisualValues({ authModelExclusions: [{
      ...rule, disableImageGenerationScope: 'all', disableImageGenerationPriorities: [], disableImageGeneration: false,
    }] }));
    const output = parse(result.current.applyVisualChangesToYaml(yaml), { merge: true });
    expect(output['auth-model-exclusions'][0]).toMatchObject({ 'disable-image-generation': false, 'disable-image-generation-priorities': [], 'future-option': 'keep' });
    expect(output['other-use']['disable-image-generation-priorities']).toEqual([5]);
    expect(output['other-use']['disable-image-generation']).toBe(true);
  });
  it('shares models, round trips the scope, and retains comments and unknown fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const rules = result.current.visualValues.authModelExclusions;
    expect(rules[0].disableImageGenerationScope).toBe('all');
    act(() =>
      result.current.setVisualValues({
        authModelExclusions: [
          {
            ...rules[0],
            disableImageGenerationScope: 'selected',
            disableImageGenerationPriorities: ['5'],
          },
          rules[1],
        ],
      })
    );
    expect(result.current.visualDirtyFields).toContain('authModelExclusions');
    const saved = result.current.applyVisualChangesToYaml(source);
    const config = parse(saved)['auth-model-exclusions'];
    expect(config[0]).toMatchObject({
      models: ['excluded'],
      priorities: [3, 5],
      'disable-image-generation': true,
      'disable-image-generation-priorities': [5],
      'future-option': 'retained',
    });
    expect(config[1]['disable-image-generation']).toBe(false);
    for (const comment of ['# shared exclusion', '# image policy', '# explicit false'])
      expect(saved).toContain(comment);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(
      result.current.visualValues.authModelExclusions[0].disableImageGenerationPriorities
    ).toEqual(['5']);
    const reloaded = result.current.visualValues.authModelExclusions;
    act(() =>
      result.current.setVisualValues({
        authModelExclusions: [
          {
            ...reloaded[0],
            disableImageGenerationScope: 'all',
            disableImageGenerationPriorities: [],
          },
          reloaded[1],
        ],
      })
    );
    expect(
      parse(result.current.applyVisualChangesToYaml(saved))['auth-model-exclusions'][0][
        'disable-image-generation-priorities'
      ]
    ).toEqual([]);
  });

  it('keeps extensions with the surviving rule when a sibling is deleted', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const rule = result.current.visualValues.authModelExclusions[1];
    act(() => result.current.setVisualValues({ authModelExclusions: [rule] }));
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved)['auth-model-exclusions']).toEqual([
      {
        models: ['another'],
        priorities: [7],
        'disable-image-generation': false,
        extension: 'second',
      },
    ]);
    expect(saved).toContain('# explicit false');
  });

  it('rejects an empty, invalid, or out-of-range selection without dropping its scope', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    const rule = result.current.visualValues.authModelExclusions[0];
    const check = (priorities: string[], parent = ['3', '5'], enabled = true) => {
      act(() =>
        result.current.setVisualValues({
          authModelExclusions: [
            {
              ...rule,
              priorities: parent,
              disableImageGeneration: enabled,
              disableImageGenerationScope: 'selected',
              disableImageGenerationPriorities: priorities,
            },
          ],
        })
      );
      return getVisualConfigValidationErrors(result.current.visualValues)[
        `authModelExclusions.${rule.clientId}.disableImageGenerationPriorities`
      ];
    };
    expect(check([])).toBe('auth_model_exclusion_image_priorities_required');
    expect(check(['3.5'])).toBe('integer_list');
    expect(check(['5'], ['3'])).toBe('auth_model_exclusion_image_priorities_outside');
    expect(
      result.current.visualValues.authModelExclusions[0].disableImageGenerationPriorities
    ).toEqual(['5']);
    expect(check(['3', '5'])).toBeUndefined();
    expect(check(['0', '-1'], [])).toBeUndefined();
    expect(check([], ['3'], false)).toBeUndefined();
  });

  it('does not materialize or change untouched legacy rules', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(source));
    act(() => result.current.setVisualValues({ debug: !result.current.visualValues.debug }));
    const saved = result.current.applyVisualChangesToYaml(source);
    expect(parse(saved)['auth-model-exclusions']).toEqual(parse(source)['auth-model-exclusions']);
    expect(saved).not.toContain('disable-image-generation-priorities');
  });
});
