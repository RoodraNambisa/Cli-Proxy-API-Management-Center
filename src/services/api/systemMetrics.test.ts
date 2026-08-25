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
  });
});
