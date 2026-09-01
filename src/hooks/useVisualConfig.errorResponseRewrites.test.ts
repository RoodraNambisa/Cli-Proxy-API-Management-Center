import { act, renderHook } from '@testing-library/react';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { getVisualConfigValidationErrors, useVisualConfig } from './useVisualConfig';

const rewriteYaml = `
error-response-rewrites:
  - sources:
      - ChatGPT-Web
      - custom-provider
    auth-priorities:
      - 0
      - -1
    status-code: 400
    message-contains: image
    response-status-code: 429
`;

describe('error response rewrite source filters', () => {
  it('loads, saves, and reloads source and credential priority filters', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(rewriteYaml));

    const [loaded] = result.current.visualValues.errorResponseRewrites;
    expect(loaded.sources).toEqual(['chatgpt-web', 'custom-provider']);
    expect(loaded.authPriorities).toEqual(['0', '-1']);

    act(() => {
      result.current.setVisualValues({
        errorResponseRewrites: [
          {
            ...loaded,
            sources: ['custom-provider', 'local', 'codex'],
            authPriorities: ['0', '-2', '0'],
          },
        ],
      });
    });

    const output = result.current.applyVisualChangesToYaml(rewriteYaml);
    const parsed = parseYaml(output) as {
      'error-response-rewrites': Array<{
        sources: string[];
        'auth-priorities': number[];
      }>;
    };
    expect(parsed['error-response-rewrites'][0].sources).toEqual([
      'custom-provider',
      'local',
      'codex',
    ]);
    expect(parsed['error-response-rewrites'][0]['auth-priorities']).toEqual([0, -2]);

    act(() => result.current.loadVisualValuesFromYaml(output));
    const [reloaded] = result.current.visualValues.errorResponseRewrites;
    expect(reloaded.sources).toEqual(['custom-provider', 'local', 'codex']);
    expect(reloaded.authPriorities).toEqual(['0', '-2']);
  });

  it('tracks filter changes in the visual dirty state', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(rewriteYaml));
    const [baselineRule] = result.current.visualValues.errorResponseRewrites;

    act(() => {
      result.current.setVisualValues({
        errorResponseRewrites: [{ ...baselineRule, authPriorities: ['3'] }],
      });
    });
    expect(result.current.visualDirtyFields).toContain('errorResponseRewrites');

    act(() => {
      result.current.setVisualValues({
        errorResponseRewrites: [{ ...baselineRule }],
      });
    });
    expect(result.current.visualDirty).toBe(false);
  });

  it('accepts signed integers and rejects unsafe priority tags', () => {
    const baseRule = {
      clientId: 'rewrite-rule',
      sources: ['local', 'codex'],
      authPriorities: ['0', '-2'],
      statusCode: '400',
      messageContains: '',
      responseStatusCode: '429',
      responseBodyEnabled: false,
      responseBody: '{}',
    };
    expect(
      getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        errorResponseRewrites: [baseRule],
      })['errorResponseRewrites.rewrite-rule.authPriorities']
    ).toBeUndefined();

    expect(
      getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        errorResponseRewrites: [{ ...baseRule, authPriorities: ['-1.5'] }],
      })['errorResponseRewrites.rewrite-rule.authPriorities']
    ).toBe('integer_list');
    expect(
      getVisualConfigValidationErrors({
        ...DEFAULT_VISUAL_VALUES,
        errorResponseRewrites: [{ ...baseRule, authPriorities: ['9007199254740992'] }],
      })['errorResponseRewrites.rewrite-rule.authPriorities']
    ).toBe('integer_list');
  });
});
