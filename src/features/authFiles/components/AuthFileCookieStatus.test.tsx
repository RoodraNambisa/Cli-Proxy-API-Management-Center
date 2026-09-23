import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { CodexCookieSnapshot } from '@/types/authFile';
import { AuthFileCookieStatus } from './AuthFileCookieStatus';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      `${key} ${values?.count ?? ''}/${values?.target ?? ''} ${values?.index ?? ''}`.trim(),
  }),
}));

it('distinguishes ready standbys from the candidate and shows the target', () => {
  const bundle = (version: number) => ({
    version,
    digest: `digest-${version}`,
    received_at: '2026-01-01T00:00:00Z',
    age_seconds: 60,
    members: [],
  });
  const cookie: CodexCookieSnapshot = {
    model: 'model',
    length: 0,
    attempts: 4,
    acquired: 3,
    uses: 1,
    current_uses: 1,
    completed: 1,
    misses: 0,
    consecutive_failures: 0,
    exhausted: false,
    acquisition_tokens: 10,
    status: 'valid',
    main: bundle(1),
    candidate: bundle(2),
    backups: [bundle(3), bundle(4)],
    backup_target: 3,
    promotions: 1,
    pool: 'shared:cookie-rule-fixture',
    shared_models: ['luna', 'astra'],
  };
  render(
    <AuthFileCookieStatus
      cookie={cookie}
      now={Date.parse('2026-01-01T00:01:00Z')}
      disabled={false}
      onAction={vi.fn()}
    />
  );
  expect(screen.getByText('codex_state.cookie_backup_status 2/3')).toBeTruthy();
  expect(screen.getByText('codex_state.cookie_backup_item / 1')).toBeTruthy();
  expect(screen.getByText('codex_state.cookie_backup_item / 2')).toBeTruthy();
  expect(screen.getByText('codex_state.cookie_candidate /')).toBeTruthy();
  const summary = screen.getByText(/codex_state.cookie_title/, { selector: 'summary' });
  expect(summary.textContent).toContain('luna, astra');
  expect(summary.textContent).not.toContain('cookie-rule-fixture');
});
