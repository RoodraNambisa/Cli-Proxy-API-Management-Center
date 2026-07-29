import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { getVisualConfigValidationErrors, useVisualConfig } from '@/hooks/useVisualConfig';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const initialYaml = `routing:
  strategy: random
  fill-first-per-auth-rpm: 10
  per-auth-request-limit: 60
  per-auth-request-window-minutes: 5
  priority-overrides:
    - priority: 4
      per-auth-request-limit: 0
      per-auth-request-window-minutes: 2
      subscription-overrides:
        - providers: [codex]
          plan-types: [ChatGPTProPlan, plus, ChatGPTBusinessPlan]
          per-auth-request-limit: 20
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
    localStorage.clear();
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
      subscriptionOverrides: [
        {
          providers: ['codex'],
          planTypes: ['pro', 'plus', 'team'],
          perAuthRequestLimit: '20',
          perAuthRequestWindowMinutes: '',
        },
      ],
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
          'subscription-overrides': [
            {
              providers: ['codex'],
              'plan-types': ['pro', 'plus', 'team'],
              'per-auth-request-limit': 20,
            },
          ],
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
        subscriptionOverrides: [
          {
            clientId: 'missing-subscription',
            providers: [],
            planTypes: [],
            perAuthRequestLimit: '',
            perAuthRequestWindowMinutes: '',
          },
        ],
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
      'routingPriorityOverrides.priority-4.subscriptionOverrides.missing-subscription.planTypes':
        'routing_subscription_plan_required',
      'routingPriorityOverrides.priority-4.subscriptionOverrides.missing-subscription.perAuthRequestLimit':
        'routing_subscription_limit_required',
      'errorResponseRewrites.missing-both-sides.statusCode':
        'error_response_rewrite_match_required',
      'errorResponseRewrites.missing-both-sides.responseStatusCode':
        'error_response_rewrite_result_required',
      'errorResponseRewrites.invalid-body.responseBody': 'json_object',
    });
  });

  test('rejects overlapping subscription plan rules within one priority', () => {
    const values = cloneValues();
    values.routingPriorityOverrides = [
      {
        clientId: 'priority-0',
        priority: '0',
        strategy: 'random',
        maxRetryCredentials: '',
        fillFirstRange: '',
        fillFirstPerAuthRpm: '',
        perAuthRequestLimit: '',
        perAuthRequestWindowMinutes: '',
        subscriptionOverrides: [
          {
            clientId: 'all-providers',
            providers: [],
            planTypes: ['pro'],
            perAuthRequestLimit: '10',
            perAuthRequestWindowMinutes: '',
          },
          {
            clientId: 'codex-pro',
            providers: ['codex'],
            planTypes: ['ChatGPTProPlan'],
            perAuthRequestLimit: '20',
            perAuthRequestWindowMinutes: '',
          },
        ],
      },
    ];

    expect(getVisualConfigValidationErrors(values)).toMatchObject({
      'routingPriorityOverrides.priority-0.subscriptionOverrides.codex-pro.planTypes':
        'routing_subscription_overlap',
    });
  });

  test('allows the same plan in disjoint provider scopes', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => {
      result.current.loadVisualValuesFromYaml(
        'routing:\n  priority-overrides:\n    - priority: 0\n'
      );
    });
    act(() => {
      result.current.setVisualValues({
        routingPriorityOverrides: [
          {
            clientId: 'priority-0',
            priority: '0',
            strategy: '',
            maxRetryCredentials: '',
            fillFirstRange: '',
            fillFirstPerAuthRpm: '',
            perAuthRequestLimit: '',
            perAuthRequestWindowMinutes: '',
            subscriptionOverrides: [
              {
                clientId: 'codex-pro',
                providers: ['codex'],
                planTypes: ['pro'],
                perAuthRequestLimit: '10',
                perAuthRequestWindowMinutes: '',
              },
              {
                clientId: 'web-pro',
                providers: ['chatgpt-web'],
                planTypes: ['ChatGPTProPlan'],
                perAuthRequestLimit: '20',
                perAuthRequestWindowMinutes: '',
              },
            ],
          },
        ],
      });
    });

    expect(result.current.visualValidationErrors).not.toHaveProperty(
      'routingPriorityOverrides.priority-0.subscriptionOverrides.web-pro.planTypes'
    );
    const merged = parse(
      result.current.applyVisualChangesToYaml(
        'routing:\n  priority-overrides:\n    - priority: 0\n'
      )
    );
    expect(merged.routing['priority-overrides'][0]['subscription-overrides']).toEqual([
      {
        providers: ['codex'],
        'plan-types': ['pro'],
        'per-auth-request-limit': 10,
      },
      {
        providers: ['chatgpt-web'],
        'plan-types': ['pro'],
        'per-auth-request-limit': 20,
      },
    ]);
  });

  test('keeps incomplete subscription drafts when switching through YAML', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(initialYaml));

    act(() => {
      result.current.setVisualValues({
        routingPriorityOverrides: result.current.visualValues.routingPriorityOverrides.map(
          (rule) => ({
            ...rule,
            subscriptionOverrides: rule.subscriptionOverrides.map((subscriptionRule) => ({
              ...subscriptionRule,
              planTypes: [],
              perAuthRequestLimit: 'not-a-number',
            })),
          })
        ),
      });
    });

    const merged = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(merged.routing['priority-overrides'][0]['subscription-overrides']).toEqual([
      {
        providers: ['codex'],
        'plan-types': [],
        'per-auth-request-limit': 'not-a-number',
      },
    ]);
  });

  test('adds, edits, and removes subscription request limits in the visual editor', () => {
    const initialValues = cloneValues();
    initialValues.routingPriorityOverrides = [
      {
        clientId: 'priority-0',
        priority: '0',
        strategy: 'random',
        maxRetryCredentials: '',
        fillFirstRange: '',
        fillFirstPerAuthRpm: '',
        perAuthRequestLimit: '',
        perAuthRequestWindowMinutes: '',
        subscriptionOverrides: [],
      },
    ];
    function Harness() {
      const [values, setValues] = useState(initialValues);
      return (
        <MemoryRouter initialEntries={['/config?section=global-network']}>
          <>
            <output data-testid="routing-values">{JSON.stringify(values)}</output>
            <VisualConfigEditor
              values={values}
              baselineValues={initialValues}
              validationErrors={getVisualConfigValidationErrors(values)}
              onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
            />
          </>
        </MemoryRouter>
      );
    }
    const readValues = () =>
      JSON.parse(screen.getByTestId('routing-values').textContent ?? '{}') as VisualConfigValues;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'config_management.visual.sections.network.priority_subscription_overrides_add',
      })
    );

    const planTypesInput = screen.getByRole('textbox', {
      name: 'config_management.visual.sections.network.priority_subscription_overrides_plan_types',
    });
    const providersInput = screen.getByRole('textbox', {
      name: 'config_management.visual.sections.network.priority_subscription_overrides_providers',
    });
    const describedBy = planTypesInput.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(planTypesInput.id).not.toBe('');
    expect(planTypesInput.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy).toHaveLength(2);
    describedBy.forEach((id) => expect(document.getElementById(id)).not.toBeNull());

    fireEvent.change(planTypesInput, { target: { value: 'pro,plus' } });
    fireEvent.keyDown(planTypesInput, { key: 'Enter', code: 'Enter' });
    expect(planTypesInput.getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(providersInput, { target: { value: 'codex' } });
    fireEvent.keyDown(providersInput, { key: 'Enter', code: 'Enter' });

    const title = screen.getByText(
      'config_management.visual.sections.network.priority_subscription_overrides_rule'
    );
    const subscriptionCard = title.parentElement?.parentElement;
    expect(subscriptionCard).not.toBeNull();
    const card = within(subscriptionCard as HTMLElement);
    fireEvent.change(
      card.getByRole('spinbutton', {
        name: 'config_management.visual.sections.network.priority_subscription_overrides_limit',
      }),
      { target: { value: '20' } }
    );
    fireEvent.change(
      card.getByRole('spinbutton', {
        name: 'config_management.visual.sections.network.priority_subscription_overrides_window',
      }),
      { target: { value: '5' } }
    );

    expect(readValues().routingPriorityOverrides[0].subscriptionOverrides[0]).toMatchObject({
      planTypes: ['pro', 'plus'],
      providers: ['codex'],
      perAuthRequestLimit: '20',
      perAuthRequestWindowMinutes: '5',
    });

    fireEvent.click(card.getByRole('button', { name: 'config_management.visual.common.delete' }));
    expect(readValues().routingPriorityOverrides[0].subscriptionOverrides).toEqual([]);
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
              'subscription-overrides': [
                {
                  providers: ['chatgpt-web'],
                  'plan-types': ['pro'],
                  'per-auth-request-limit': 12,
                },
              ],
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
          subscriptionOverrides: [
            {
              providers: ['chatgpt-web'],
              planTypes: ['pro'],
              perAuthRequestLimit: 12,
            },
          ],
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
        subscriptionOverrides: [
          {
            providers: ['codex'],
            planTypes: ['pro', 'plus'],
            perAuthRequestLimit: 20,
          },
        ],
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
          'subscription-overrides': [
            {
              providers: ['codex'],
              'plan-types': ['pro', 'plus'],
              'per-auth-request-limit': 20,
            },
          ],
        },
      ],
    });
  });
});
