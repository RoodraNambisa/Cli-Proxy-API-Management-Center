import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageAggregationDetails } from './UsageAggregationDetails';
import { normalizeUsageFailureDetails } from '@/utils/usage/failureDetails';
const mocks = vi.hoisted(() => ({ get: vi.fn(), generation: 1 }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'one' }), getAtConnection: mocks.get },
}));
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (fn: (s: unknown) => unknown) => fn({ connectionGeneration: mocks.generation }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const detail = normalizeUsageFailureDetails({
  timestamp: '2026-11-09T12:00:00Z',
  latency_ms: 20000,
  image_aggregation: {
    role: 'delivery',
    batch_id: 'batch',
    image_index: 1,
    attempt_index: 1,
    requested: 10,
    generated: 9,
    delivered: 0,
    retry_attempts: 1,
    executed: true,
    original_code: 'image_size_mismatch',
  },
});
describe('image delivery diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generation = 1;
  });
  it('handles malformed imported numeric and timestamp fields without crashing', () => {
    const malformed = normalizeUsageFailureDetails({
      timestamp: '2026-11-09T12:00:00Z',
      latency_ms: Infinity,
      image_aggregation: { ...detail.image_aggregation, requested: Infinity, generated: -1 },
    });
    expect(malformed.image_aggregation?.requested).toBe(0);
    expect(malformed.image_aggregation?.generated).toBe(0);
    expect(malformed.aggregation_to).toBe('2026-11-09T12:01:00.000Z');
    expect(
      normalizeUsageFailureDetails({
        timestamp: 'invalid',
        image_aggregation: detail.image_aggregation,
      }).aggregation_from
    ).toBeUndefined();
  });
  it('queries bounded attempts for the selected slot and keeps the connection pinned', async () => {
    mocks.get.mockResolvedValue({
      items: [
        {
          failed: true,
          image_aggregation: {
            role: 'attempt',
            batch_id: 'batch',
            image_index: 1,
            attempt_index: 0,
          },
          error_code: 'image_size_mismatch',
          failure_stage: 'download',
        },
      ],
    });
    render(<UsageAggregationDetails detail={detail} />);
    expect(mocks.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText(/stats.failure/);
    expect(mocks.get.mock.calls[0][0]).toEqual({ apiBase: 'one' });
    expect(mocks.get.mock.calls[0][2].params).toMatchObject({
      image_aggregation_role: 'attempt',
      image_aggregation_batch: 'batch',
      image_aggregation_index: 1,
      limit: 100,
      from: '2026-11-09T11:59:59.000Z',
      to: '2026-11-09T12:01:20.000Z',
    });
  });
  it('cancels and hides stale results when changing connection', async () => {
    let resolve!: (v: unknown) => void;
    mocks.get.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const view = render(<UsageAggregationDetails detail={detail} />);
    fireEvent.click(screen.getByRole('button'));
    const signal = mocks.get.mock.calls[0][2].signal;
    mocks.generation = 2;
    view.rerender(<UsageAggregationDetails detail={detail} />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ items: [] }));
    expect(screen.queryByText('usage_stats.image_aggregation.connection_changed')).not.toBeNull();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
