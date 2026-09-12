import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { useVisualConfig } from '@/hooks/useVisualConfig';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => localStorage.clear());

const source = `future-field: keep
auth-model-exclusions:
  - providers: [codex]
    priorities: [0, 3]
    models: [-all, +gpt-5.5]
routing:
  priority-overrides:
    - priority: 3
      strategy: random
      max-retry-credentials: 2
non-retryable-errors:
  - status-code: 400
    code: misalignment_policy_violation
    message-contains: blocked
fixed-error-cooldowns:
  - status-code: 429
    message-contains: rate exceeded
    cooldown-seconds: 10
    scope: model
error-response-rewrites:
  - sources: [upstream]
    auth-priorities: [3]
    status-code: 429
    response-status-code: 503
    response-body: {error: {message: busy}}
`;

test.each([
  ['config-auth-model-exclusions', 'auth.auth_model_exclusions', 'image'],
  ['config-routing-priority-overrides', 'network.priority_overrides', 'priority'],
  ['config-non-retryable-errors', 'network.non_retryable_errors', 'error'],
  ['config-fixed-error-cooldowns', 'quota.fixed_error_cooldowns', 'cooldown'],
  ['config-error-response-rewrites', 'network.error_response_rewrites', 'rewrite'],
])('%s keeps matching semantics and saves edits made through a collapsed rule', (section, label, kind) => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(source));
  const editor = () => <MemoryRouter initialEntries={[`/config?section=${section}`]}>
    <VisualConfigEditor values={result.current.visualValues} baselineValues={result.current.baselineValues}
      validationErrors={result.current.visualValidationErrors} dirtyFields={result.current.visualDirtyFields}
      onChange={result.current.setVisualValues} />
  </MemoryRouter>;
  const view = render(editor());
  const table = screen.getByRole('table', { name: `config_management.visual.sections.${label}` });
  const toggle = within(table).getByRole('button', { name: /common.edit:/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(within(table).queryByRole('textbox')).toBeNull();
  if (kind === 'error') expect(table.textContent).toContain('misalignment_policy_violation');
  fireEvent.click(toggle);
  if (kind === 'image') {
    fireEvent.click(within(table).getByRole('checkbox', { name: `config_management.visual.sections.${label}_disable_image_generation` }));
  } else {
    const suffix = kind === 'priority' ? '_priority' : kind === 'cooldown' ? '_cooldown_seconds' : kind === 'rewrite' ? '_response_status_code' : '_code';
    const value = kind === 'priority' ? '4' : kind === 'cooldown' ? '600' : kind === 'rewrite' ? '502' : 'policy_violation';
    fireEvent.change(within(table).getByLabelText(`config_management.visual.sections.${label}${suffix}`), { target: { value } });
  }
  view.rerender(editor());
  expect(result.current.visualDirty).toBe(true);
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  const saved = result.current.applyVisualChangesToYaml(source);
  const yaml = parse(saved);
  expect(yaml['future-field']).toBe('keep');
  if (kind === 'image') expect(yaml['auth-model-exclusions'][0]).toMatchObject({ providers: ['codex'], priorities: [0, 3], models: ['-all', '+gpt-5.5'], 'disable-image-generation': true });
  if (kind === 'priority') expect(yaml.routing['priority-overrides'][0]).toMatchObject({ priority: 4, strategy: 'random', 'max-retry-credentials': 2 });
  if (kind === 'error') expect(yaml['non-retryable-errors'][0]).toMatchObject({ 'status-code': 400, code: 'policy_violation', 'message-contains': 'blocked' });
  if (kind === 'cooldown') expect(yaml['fixed-error-cooldowns'][0]).toMatchObject({ 'status-code': 429, 'cooldown-seconds': 600, scope: 'model', 'message-contains': 'rate exceeded' });
  if (kind === 'rewrite') expect(yaml['error-response-rewrites'][0]).toMatchObject({ sources: ['upstream'], 'auth-priorities': [3], 'status-code': 429, 'response-status-code': 502, 'response-body': { error: { message: 'busy' } } });
  act(() => result.current.loadVisualValuesFromYaml(saved));
  view.rerender(editor());
  expect(result.current.visualDirty).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: `config_management.visual.sections.${label}_add` }));
  view.rerender(editor());
  expect(within(screen.getByRole('table', { name: `config_management.visual.sections.${label}` })).getAllByRole('button', { name: /common.edit:/ }).at(-1)?.getAttribute('aria-expanded')).toBe('true');
});
