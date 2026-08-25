import { describe, expect, it } from 'vitest';
import { normalizeSystemMetricsSnapshot } from './systemMetrics';

describe('normalizeSystemMetricsSnapshot', () => {
  it('normalizes process rates and rolling image phases', () => {
    const snapshot = normalizeSystemMetricsSnapshot({
      runtime: {
        resident_set_bytes: 2048,
        resident_set_available: true,
        allocation_bytes_per_second: 512.5,
        gc_cycles_per_second: 1.25,
        gc_pause_percent: 0.75,
        process_cpu_percent: 250.5,
        process_cpu_normalized_percent: 31.3125,
        process_cpu_available: true,
        rate_sample_seconds: 5,
        rates_available: true,
      },
      image_request_phases: {
        metrics: {
          web_download: { count: 9, total_nanos: 90, max_nanos: 20 },
        },
        rolling: {
          available: true,
          requested_window_seconds: 60,
          sample_seconds: 5,
          history_samples: 2,
          metrics: {
            web_download: {
              count: 2,
              total_nanos: 30,
              average_nanos: 15,
              over_10_seconds: 1,
            },
          },
        },
      },
      chatgpt_web_image_poll_breaker: {
        enabled: true,
        open: true,
        stall_seconds: 120,
        opened_at: '2026-08-26T10:00:00Z',
        full_since: '2026-08-26T09:58:00Z',
        last_completion_at: '2026-08-26T09:57:00Z',
        no_completion_age_nanos: 120_000_000_000,
        rejected: 7,
        transport_completions: 42,
        canceled_completions: 3,
      },
    });

    expect(snapshot.runtime).toMatchObject({
      resident_set_bytes: 2048,
      resident_set_available: true,
      allocation_bytes_per_second: 512.5,
      gc_cycles_per_second: 1.25,
      gc_pause_percent: 0.75,
      process_cpu_percent: 250.5,
      process_cpu_normalized_percent: 31.3125,
      process_cpu_available: true,
      rate_sample_seconds: 5,
      rates_available: true,
    });
    expect(snapshot.image_request_phases.rolling).toMatchObject({
      available: true,
      requested_window_seconds: 60,
      sample_seconds: 5,
      history_samples: 2,
      metrics: {
        web_download: {
          count: 2,
          total_nanos: 30,
          average_nanos: 15,
          over_10_seconds: 1,
        },
      },
    });
    expect(snapshot.chatgpt_web_image_poll_breaker).toEqual({
      available: true,
      enabled: true,
      open: true,
      stall_seconds: 120,
      opened_at: '2026-08-26T10:00:00Z',
      full_since: '2026-08-26T09:58:00Z',
      last_completion_at: '2026-08-26T09:57:00Z',
      no_completion_age_nanos: 120_000_000_000,
      rejected: 7,
      transport_completions: 42,
      canceled_completions: 3,
    });
  });

  it('keeps older backend responses compatible', () => {
    const snapshot = normalizeSystemMetricsSnapshot({ runtime: {}, image_request_phases: {} });

    expect(snapshot.runtime.resident_set_available).toBe(false);
    expect(snapshot.runtime.process_cpu_available).toBe(false);
    expect(snapshot.runtime.rates_available).toBe(false);
    expect(snapshot.image_request_phases.rolling).toEqual({
      available: false,
      requested_window_seconds: 0,
      sample_seconds: 0,
      history_samples: 0,
      metrics: {},
    });
    expect(snapshot.chatgpt_web_image_poll_breaker).toEqual({
      available: false,
      enabled: false,
      open: false,
      stall_seconds: 0,
      opened_at: null,
      full_since: null,
      last_completion_at: null,
      no_completion_age_nanos: 0,
      rejected: 0,
      transport_completions: 0,
      canceled_completions: 0,
    });
  });
});
