import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { RoutingCredentialPicker } from '@/components/config/RoutingCredentialPicker';
import { useVisualConfig, getVisualConfigValidationErrors } from '@/hooks/useVisualConfig';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { configFileApi } from '@/services/api/configFile';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore } from '@/stores';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const yaml = `routing:
  priority-overrides:
    - priority: 3
      subscription-overrides:
        - providers: [xai]
          per-auth-request-limit: 10
        - credentials: [Short-ID]
          per-auth-request-limit: 2
          extension: first
        - credentials: [Other-ID]
          per-auth-request-limit: 0
          extension: second
`;

test('round-trips credential-only rules through visual config, API parsers and YAML edits', async () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  expect(getVisualConfigValidationErrors(result.current.visualValues)).toEqual({});
  const rule = result.current.visualValues.routingPriorityOverrides[0];
  expect(rule.subscriptionOverrides[1].credentials).toEqual(['Short-ID']);
  act(() =>
    result.current.setVisualValues({
      routingPriorityOverrides: [
        {
          ...rule,
          subscriptionOverrides: [
            rule.subscriptionOverrides[0],
            rule.subscriptionOverrides[2],
            { ...rule.subscriptionOverrides[1], credentials: ['Changed-ID'] },
          ],
        },
      ],
    })
  );
  const output = parse(result.current.applyVisualChangesToYaml(yaml));
  const saved = output.routing['priority-overrides'][0]['subscription-overrides'];
  expect(saved[1]).toMatchObject({
    credentials: ['Other-ID'],
    'per-auth-request-limit': 0,
    extension: 'second',
  });
  expect(saved[2]).toMatchObject({ credentials: ['Changed-ID'], extension: 'first' });
  expect(
    normalizeConfigResponse(output).routingPriorityOverrides?.[0].subscriptionOverrides?.[2]
      .credentials
  ).toEqual(['Changed-ID']);
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    'priority-overrides': output.routing['priority-overrides'],
    features: { credential_request_limits: true },
  });
  const parsed = await configApi.getRoutingPriorityOverrides();
  expect(parsed[0].subscriptionOverrides?.[2].credentials).toEqual(['Changed-ID']);
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  await configApi.updateRoutingPriorityOverrides(parsed);
  expect(put.mock.calls[0][1]).toMatchObject({
    value: [
      {
        'subscription-overrides': [
          expect.anything(),
          expect.anything(),
          { credentials: ['Changed-ID'], 'per-auth-request-limit': 2, 'plan-types': [] },
        ],
      },
    ],
  });
});

test('clears credential selectors and keeps explicit zero without restoring stale YAML', () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  const rule = result.current.visualValues.routingPriorityOverrides[0];
  act(() =>
    result.current.setVisualValues({
      routingPriorityOverrides: [
        {
          ...rule,
          subscriptionOverrides: [
            { ...rule.subscriptionOverrides[2], credentials: [], providers: ['claude'] },
          ],
        },
      ],
    })
  );
  const saved = parse(result.current.applyVisualChangesToYaml(yaml)).routing[
    'priority-overrides'
  ][0]['subscription-overrides'][0];
  expect(saved.credentials).toBeUndefined();
  expect(saved['per-auth-request-limit']).toBe(0);
  expect(saved.extension).toBe('second');
});

test('validates overlaps within a layer while allowing credential exceptions to a provider rule', () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  const values = result.current.visualValues,
    rule = values.routingPriorityOverrides[0],
    specific = rule.subscriptionOverrides[1];
  const validate = (credentials: string[]) =>
    getVisualConfigValidationErrors({
      ...values,
      routingPriorityOverrides: [
        {
          ...rule,
          subscriptionOverrides: [
            ...rule.subscriptionOverrides,
            { ...specific, clientId: 'extra', credentials },
          ],
        },
      ],
    });
  expect(validate(['Different-ID'])).toEqual({});
  expect(Object.values(validate(['Short-ID']))).toContain('routing_subscription_overlap');
  expect(Object.values(validate(['bad\u0000id']))).toContain('routing_credentials_invalid');
});

test('refuses YAML and structured saves on older backends before selectors can be ignored', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
  const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow();
  const rules = [
    {
      priority: 3,
      subscriptionOverrides: [{ credentials: ['target'], planTypes: [], perAuthRequestLimit: 2 }],
    },
  ];
  await expect(configApi.updateRoutingPriorityOverrides(rules)).rejects.toThrow();
  await expect(configApi.patchRoutingPriorityOverrides(rules)).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
  expect(patch).not.toHaveBeenCalled();
  get.mockResolvedValue({ features: { credential_request_limits: true } });
  await configFileApi.saveConfigYaml(yaml);
  expect(put).toHaveBeenCalledTimes(1);
});

function Picker() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <RoutingCredentialPicker value={value} priority="3" onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}
test('selects all providers at the current priority and saves the stable ID, with manual input', async () => {
  vi.spyOn(apiClient, 'getAtConnection').mockResolvedValue({
    credentials: [
      { id: 'short-xai', name: 'grok.json', provider: 'xai', priority: 3 },
      { id: 'short-codex', name: 'codex.json', provider: 'codex', priority: 3 },
      { id: 'outside', name: 'outside.json', provider: 'claude', priority: 4 },
    ],
  });
  render(<Picker />);
  fireEvent.click(
    screen.getByRole('button', { name: 'codex_state.picker_choose: routing_credentials.label' })
  );
  await screen.findByRole('checkbox', { name: 'grok.json (short-xai)' });
  expect(screen.getByRole('checkbox', { name: 'codex.json (short-codex)' })).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'outside.json (outside)' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'grok.json (short-xai)' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
  expect(screen.getByTestId('value').textContent).toBe('["short-xai"]');
  const input = screen.getByRole('textbox', { name: 'routing_credentials.label' });
  fireEvent.change(input, { target: { value: 'CaseSensitive.json' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByTestId('value').textContent).toBe('["short-xai","CaseSensitive.json"]');
});

test('discards a credential catalog response after switching connections', async () => {
  let resolve!: (value: unknown) => void;
  const get = vi.spyOn(apiClient, 'getAtConnection').mockReturnValue(
    new Promise((r) => {
      resolve = r;
    })
  );
  render(<Picker />);
  fireEvent.click(
    screen.getByRole('button', { name: 'codex_state.picker_choose: routing_credentials.label' })
  );
  act(() =>
    useAuthStore.setState({
      connectionGeneration: (useAuthStore.getState().connectionGeneration ?? 0) + 1,
    })
  );
  await act(async () =>
    resolve({ credentials: [{ id: 'old', name: 'old.json', provider: 'xai', priority: 3 }] })
  );
  await waitFor(() => expect(screen.queryByText('old.json')).toBeNull());
  expect((get.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(true);
});
