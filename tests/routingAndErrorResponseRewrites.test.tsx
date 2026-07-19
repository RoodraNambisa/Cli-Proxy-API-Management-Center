import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getVisualConfigValidationErrors, useVisualConfig } from '@/hooks/useVisualConfig';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

const initialYaml = `routing:
  strategy: random
  fill-first-per-auth-rpm: 10
  per-auth-request-limit: 60
  per-auth-request-window-minutes: 5
  priority-overrides:
    - priority: 4
      per-auth-request-limit: 0
      per-auth-request-window-minutes: 2
error-response-rewrites:
  - status-code: 429
    response-status-code: 503
  - message-contains: quota exhausted
    response-body: {}
`;

const cloneValues = (): VisualConfigValues =>
  JSON.parse(JSON.stringify(DEFAULT_VISUAL_VALUES)) as VisualConfigValues;

describe('routing request limits and error response rewrites', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('preserves inherited overrides and distinguishes an omitted body from an explicit empty body', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    expect(result.current.visualValues.routingPerAuthRequestLimit).toBe('60');
    expect(result.current.visualValues.routingPerAuthRequestWindowMinutes).toBe('5');
    expect(result.current.visualValues.routingPriorityOverrides[0]).toMatchObject({
      priority: '4',
      perAuthRequestLimit: '0',
      perAuthRequestWindowMinutes: '2',
    });
    expect(result.current.visualValues.errorResponseRewrites).toHaveLength(2);
    expect(result.current.visualValues.errorResponseRewrites[0].responseBodyEnabled).toBe(false);
    expect(result.current.visualValues.errorResponseRewrites[1]).toMatchObject({
      responseBodyEnabled: true,
      responseBody: '{}',
    });

    act(() => {
      result.current.setVisualValues({
        routingPerAuthRequestLimit: '120',
        errorResponseRewrites: result.current.visualValues.errorResponseRewrites.map(
          (rule, index) =>
            index === 1
              ? {
                  ...rule,
                  responseBody: '{"error":{"message":"busy"}}',
                }
              : rule
        ),
      });
    });

    const merged = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(merged.routing).toMatchObject({
      'per-auth-request-limit': 120,
      'per-auth-request-window-minutes': 5,
      'fill-first-per-auth-rpm': 10,
      'priority-overrides': [
        {
          priority: 4,
          'per-auth-request-limit': 0,
          'per-auth-request-window-minutes': 2,
        },
      ],
    });
    expect(merged['error-response-rewrites'][0]).not.toHaveProperty('response-body');
    expect(merged['error-response-rewrites'][1]['response-body']).toEqual({
      error: { message: 'busy' },
    });
  });

  test('validates both sides of a rewrite and the generic request-limit fields', () => {
    const values = cloneValues();
    values.routingPerAuthRequestLimit = '-1';
    values.routingPerAuthRequestWindowMinutes = '0';
    values.routingPriorityOverrides = [
      {
        clientId: 'priority-4',
        priority: '4',
        strategy: 'random',
        maxRetryCredentials: '',
        fillFirstRange: '',
        fillFirstPerAuthRpm: '',
        perAuthRequestLimit: '-2',
        perAuthRequestWindowMinutes: '0',
      },
    ];
    values.errorResponseRewrites = [
      {
        clientId: 'missing-both-sides',
        statusCode: '',
        messageContains: '',
        responseStatusCode: '',
        responseBodyEnabled: false,
        responseBody: '{}',
      },
      {
        clientId: 'invalid-body',
        statusCode: '429',
        messageContains: '',
        responseStatusCode: '',
        responseBodyEnabled: true,
        responseBody: '[]',
      },
    ];

    expect(getVisualConfigValidationErrors(values)).toMatchObject({
      routingPerAuthRequestLimit: 'non_negative_integer',
      routingPerAuthRequestWindowMinutes: 'positive_integer',
      'routingPriorityOverrides.priority-4.perAuthRequestLimit': 'non_negative_integer',
      'routingPriorityOverrides.priority-4.perAuthRequestWindowMinutes': 'positive_integer',
      'errorResponseRewrites.missing-both-sides.statusCode':
        'error_response_rewrite_match_required',
      'errorResponseRewrites.missing-both-sides.responseStatusCode':
        'error_response_rewrite_result_required',
      'errorResponseRewrites.invalid-body.responseBody': 'json_object',
    });
  });

  test('treats zero status fields as omitted without dropping the rewrite rule', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('error-response-rewrites: []\n'));
    act(() => {
      result.current.setVisualValues({
        errorResponseRewrites: [
          {
            clientId: 'zero-statuses',
            statusCode: '0',
            messageContains: 'quota',
            responseStatusCode: '0',
            responseBodyEnabled: true,
            responseBody: '{}',
          },
        ],
      });
    });

    expect(parse(result.current.applyVisualChangesToYaml('error-response-rewrites: []\n'))).toEqual(
      {
        'error-response-rewrites': [
          {
            'message-contains': 'quota',
            'response-body': {},
          },
        ],
      }
    );
  });

  test('preserves response-body integers beyond the JavaScript safe integer range', () => {
    const yaml = `error-response-rewrites:
  - status-code: 429
    response-body:
      retry_after: 30
      trace: 9007199254740993
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));

    expect(result.current.visualValues.errorResponseRewrites[0].responseBody).toContain(
      '9007199254740993'
    );
    act(() => {
      result.current.setVisualValues({
        errorResponseRewrites: result.current.visualValues.errorResponseRewrites.map((rule) => ({
          ...rule,
          messageContains: 'quota',
        })),
      });
    });

    expect(result.current.applyVisualChangesToYaml(yaml)).toContain('trace: 9007199254740993');
  });

  test('normalizes the full management config response without losing an empty response body', () => {
    expect(
      normalizeConfigResponse({
        routing: {
          'per-auth-request-limit': 60,
          'per-auth-request-window-minutes': 5,
          'priority-overrides': [
            {
              priority: -1,
              'per-auth-request-limit': 0,
              'per-auth-request-window-minutes': 2,
            },
          ],
        },
        'error-response-rewrites': [
          {
            'message-contains': 'quota',
            'response-body': {},
          },
        ],
      })
    ).toMatchObject({
      routingPerAuthRequestLimit: 60,
      routingPerAuthRequestWindowMinutes: 5,
      routingPriorityOverrides: [
        {
          priority: -1,
          perAuthRequestLimit: 0,
          perAuthRequestWindowMinutes: 2,
        },
      ],
      errorResponseRewrites: [
        {
          messageContains: 'quota',
          responseBody: {},
        },
      ],
    });
  });

  test('uses the dedicated global endpoints and serializes priority override fields', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ 'per-auth-request-limit': 80 })
      .mockResolvedValueOnce({ 'per-auth-request-window-minutes': 3 });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      'priority-overrides': [],
    });
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });

    await expect(configApi.getRoutingPerAuthRequestLimit()).resolves.toBe(80);
    await expect(configApi.getRoutingPerAuthRequestWindowMinutes()).resolves.toBe(3);
    await configApi.updateRoutingPerAuthRequestLimit(120);
    await configApi.patchRoutingPerAuthRequestWindowMinutes(5);
    await configApi.updateRoutingPriorityOverrides([
      {
        priority: 4,
        strategy: 'random',
        perAuthRequestLimit: 0,
        perAuthRequestWindowMinutes: 2,
      },
    ]);

    expect(get).toHaveBeenNthCalledWith(1, '/routing/per-auth-request-limit');
    expect(get).toHaveBeenNthCalledWith(2, '/routing/per-auth-request-window-minutes');
    expect(put).toHaveBeenCalledWith('/routing/per-auth-request-limit', { value: 120 });
    expect(patch).toHaveBeenCalledWith('/routing/per-auth-request-window-minutes', { value: 5 });
    expect(put).toHaveBeenCalledWith('/routing/priority-overrides', {
      value: [
        {
          priority: 4,
          strategy: 'random',
          'per-auth-request-limit': 0,
          'per-auth-request-window-minutes': 2,
        },
      ],
    });
  });
});
