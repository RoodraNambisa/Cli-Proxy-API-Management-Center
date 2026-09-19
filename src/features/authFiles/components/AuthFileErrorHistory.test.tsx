import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthFileErrorHistory } from './AuthFileErrorHistory';
import type { AuthFileItem, AuthErrorHistorySummary } from '@/types/authFile';

const mocks = vi.hoisted(() => ({ load: vi.fn(), generation: 1 }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key === 'auth_error_history.card_count'
        ? `${values?.distinct} kinds / ${values?.count} failures`
        : key,
  }),
}));
vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ apiBase: 'https://fixture', connectionGeneration: mocks.generation }),
}));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { errorHistory: mocks.load } }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'fixture' }) },
}));

const since = '2026-09-19T10:00:00Z';
const summary: AuthErrorHistorySummary = {
  total: 7,
  retained_total: 7,
  distinct: 1,
  limit: 20,
  since,
  current_model: 'gpt-a',
};
const file: AuthFileItem = { name: 'fixture.json', auth_index: 'auth1', error_history: summary };
const details: AuthErrorHistorySummary = {
  ...summary,
  models: [
    { model: 'gpt-a', count: 5, last_at: since },
    { model: 'gpt-b', count: 2, last_at: since },
  ],
  recent: [
    {
      id: 'error1',
      http_status: 503,
      code: 'server_overloaded',
      message: 'Our servers are overloaded',
      details: '{"error":"overloaded"}',
      count: 7,
      first_at: since,
      last_at: since,
      last_model: 'gpt-a',
      models: [
        { model: 'gpt-a', count: 5, last_at: since },
        { model: 'gpt-b', count: 2, last_at: since },
      ],
    },
  ],
};

describe('credential error history', () => {
  beforeEach(() => {
    mocks.load.mockReset();
    mocks.generation = 1;
  });
  const open = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'auth_error_history.details: fixture.json' })
    );
  it('loads details on demand and displays grouped and per-model counts', async () => {
    mocks.load.mockResolvedValue(details);
    render(<AuthFileErrorHistory file={file} disabled={false} />);
    expect(mocks.load).not.toHaveBeenCalled();
    open();
    expect(await screen.findByText('Our servers are overloaded')).toBeTruthy();
    expect(screen.getByText('HTTP 503')).toBeTruthy();
    const table = within(
      screen.getByRole('region', { name: 'auth_error_history.by_model' })
    ).getByRole('table');
    expect(within(table).getByText('gpt-a')).toBeTruthy();
    expect(within(table).getByText('5')).toBeTruthy();
    expect(within(table).getByText('2')).toBeTruthy();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it('aborts the previous credential details when the server changes', async () => {
    mocks.load.mockImplementation(() => new Promise(() => {}));
    const view = render(<AuthFileErrorHistory file={file} disabled={false} />);
    open();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    const signal = mocks.load.mock.calls[0][2] as AbortSignal;
    mocks.generation++;
    view.rerender(<AuthFileErrorHistory file={file} disabled={false} />);
    expect(signal.aborted).toBe(true);
  });
  it('shows a refresh failure and allows another attempt', async () => {
    mocks.load
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce(details);
    render(<AuthFileErrorHistory file={file} disabled={false} />);
    open();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'temporarily unavailable'
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.refresh' }));
    expect(await screen.findByText('Our servers are overloaded')).toBeTruthy();
  });
  it('uses fresh card counters after closing details', async () => {
    mocks.load.mockResolvedValue(details);
    const view = render(<AuthFileErrorHistory file={file} disabled={false} />);
    open();
    await screen.findByText('Our servers are overloaded');
    const closeButtons = screen.getAllByRole('button', { name: 'common.close' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    view.rerender(
      <AuthFileErrorHistory
        file={{ ...file, error_history: { ...summary, total: 9 } }}
        disabled={false}
      />
    );
    expect(screen.getByText('1 kinds / 9 failures')).toBeTruthy();
  });
  it('hides the feature for an older backend or an empty history', () => {
    const view = render(<AuthFileErrorHistory file={{ name: 'old.json' }} disabled={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(
      <AuthFileErrorHistory
        file={{ ...file, error_history: { ...summary, total: 0 } }}
        disabled={false}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
