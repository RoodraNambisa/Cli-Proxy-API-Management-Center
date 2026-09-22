import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { GuardRecord } from '@/utils/codexResponseGuard';
import { ResponseGuardDetails } from './ResponseGuardDetails';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

it('shows an upstream failure even when no guard verdict was obtained', () => {
  const record = JSON.parse(
    JSON.stringify({
      requested_model: 'requested',
      upstream_model: 'upstream',
      original_model: '',
      response_model: '',
      state_present: false,
      state_length: 0,
      verdict: { model: '', state: '', reasons: null },
      outcome: 'upstream_error',
      phase: 'upstream',
      transport: 'http',
      attempt: 1,
      status: 401,
      upstream_status: 401,
      completed: false,
      rule: 0,
    })
  ) as GuardRecord;
  render(<ResponseGuardDetails record={record} />);
  expect(screen.getByText('response_guard.outcome_upstream_error')).toBeTruthy();
  expect(screen.getAllByText('response_guard.verdict_unknown')).toHaveLength(2);
  expect(screen.getByText('response_guard.usage_unknown')).toBeTruthy();
});
