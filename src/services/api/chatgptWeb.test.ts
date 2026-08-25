import { describe, expect, it } from 'vitest';
import { normalizeImageTaskListSnapshot } from './chatgptWeb';

describe('normalizeImageTaskListSnapshot', () => {
  it('keeps safe task diagnostics and drops entries without IDs', () => {
    expect(
      normalizeImageTaskListSnapshot({
        collected_at: '2026-08-26T10:00:00Z',
        active: 2,
        canceling: 1,
        active_over_15_minutes: 1,
        registry_capacity: 64,
        tasks: [
          {
            id: 'task-safe-id',
            status: 'running',
            stage: 'polling',
            started_at: '2026-08-26T09:40:00Z',
            duration_milliseconds: 1_200_000,
            last_progress_at: '2026-08-26T09:59:59Z',
            last_progress_age_milliseconds: 1_000,
            polls_in_flight: 1,
            credential_fingerprint: 'a1b2c3d4',
            canceling: true,
            over_15_minutes: true,
          },
          { status: 'running' },
        ],
      })
    ).toEqual({
      collected_at: '2026-08-26T10:00:00Z',
      active: 2,
      canceling: 1,
      active_over_15_minutes: 1,
      registry_capacity: 64,
      tasks: [
        {
          id: 'task-safe-id',
          status: 'running',
          stage: 'polling',
          started_at: '2026-08-26T09:40:00Z',
          duration_milliseconds: 1_200_000,
          last_progress_at: '2026-08-26T09:59:59Z',
          last_progress_age_milliseconds: 1_000,
          last_poll_completed_at: null,
          polls_in_flight: 1,
          credential_fingerprint: 'a1b2c3d4',
          canceling: true,
          cancellation_requested_at: null,
          over_15_minutes: true,
        },
      ],
    });
  });
});
