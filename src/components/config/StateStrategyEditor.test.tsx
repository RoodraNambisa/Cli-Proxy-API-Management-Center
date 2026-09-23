import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StateStrategyEditor } from './StateStrategyEditor';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

it('distinguishes using the current model from inheriting a configured base model', () => {
  const change = vi.fn();
  render(
    <StateStrategyEditor
      settings={{ strategy: 'cookie-only', 'cookie-acquisition-model': 'base' }}
      onChange={change}
    />
  );
  const field = screen
    .getByLabelText('codex_state.cookie_unified_model')
    .closest('.form-group')!.parentElement!;
  fireEvent.click(within(field).getByRole('button', { name: 'codex_state.cookie_source_self' }));
  expect(change.mock.calls[change.mock.calls.length - 1][0]['cookie-acquisition-model']).toBe('');
  fireEvent.click(within(field).getByRole('button', { name: 'codex_state.rule_inherit' }));
  expect(change.mock.calls[change.mock.calls.length - 1][0]).not.toHaveProperty(
    'cookie-acquisition-model'
  );
});
