import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrafficSummary } from './TrafficSummary';
import type { TrafficSnapshot } from './types';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const snapshot: TrafficSnapshot = {
  id: 'credential',
  active: 2,
  concurrency_limit: 3,
  rpm_60s: 8,
  current_minute: 5,
  queued: 0,
  rpm_limit: 20,
  window_used: 5,
  window_minutes: 1,
  as_of: '2026-11-01T00:00:00Z',
  source: 'priority',
  concurrency_source: 'credential',
};

describe('live traffic visibility on read failure', () => {
  it('shows an unavailable message on first failure without inventing zero usage', () => {
    const view = render(<TrafficSummary stale />);
    expect(screen.getByRole('status').textContent).toBe('traffic.unavailable');
    expect(screen.queryByText('RPM · 60s')).toBeNull();
    view.rerender(<TrafficSummary unsupported stale />);
    expect(screen.getByRole('status').textContent).toBe('traffic.unsupported');
  });
  it('retains a previous snapshot and marks it stale', () => {
    render(<TrafficSummary value={snapshot} stale credential />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('traffic.stale');
    expect(screen.queryByText('traffic.unavailable')).toBeNull();
  });
});
