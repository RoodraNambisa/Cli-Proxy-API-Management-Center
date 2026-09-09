import { describe, expect, test } from 'vitest';
import { normalizeUsageDetail } from '@/stores/useUsageStatsStore';
import { collectUsageDetails, collectUsageDetailsWithEndpoint } from '@/utils/usage';

const snapshot = (detail: Record<string, unknown>) => ({
  apis: { 'POST /v1/responses': { models: { 'gpt-5.4-mini': { details: [detail] } } } },
});

const paths = {
  paginated: (detail: Record<string, unknown>) => normalizeUsageDetail(detail, 0),
  snapshot: (detail: Record<string, unknown>) => collectUsageDetails(snapshot(detail))[0],
  endpoints: (detail: Record<string, unknown>) => collectUsageDetailsWithEndpoint(snapshot(detail))[0],
};

describe.each(Object.entries(paths))('usage response metrics: %s', (_, normalize) => {
  test.each([false, true])('preserves explicit stream=%s and independent timings', (stream) => {
    const detail = normalize({
      timestamp: '2026-09-09T00:00:00Z',
      stream,
      ttft_ms: 900,
      first_packet_ms: 125,
      latency_ms: 2000,
      tokens: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    });
    expect(detail.stream).toBe(stream);
    expect(detail.ttft_ms).toBe(900);
    expect(detail.first_packet_ms).toBe(125);
    expect(detail.latency_ms).toBe(2000);
    expect(detail.tokens.total_tokens).toBe(3);
  });

  test('does not infer old metrics or first content from a packet or total latency', () => {
    const old = normalize({ timestamp: '2026-09-09T00:00:00Z', latency_ms: 2000 });
    expect(old.stream).toBeUndefined();
    expect(old.ttft_ms).toBeUndefined();
    expect(old.first_packet_ms).toBeUndefined();
    const failed = normalize({
      timestamp: '2026-09-09T00:00:00Z',
      failed: true,
      first_packet_ms: 125,
    });
    expect(failed.ttft_ms).toBeUndefined();
    expect(failed.first_packet_ms).toBe(125);
    expect(failed.failed).toBe(true);
  });

  test.each([undefined, null, '', '125', false, true, 0, -1, Infinity, NaN, {}, []])(
    'rejects unavailable or invalid timing %j',
    (value) => {
      const detail = normalize({
        timestamp: '2026-09-09T00:00:00Z',
        stream: 'false',
        ttft_ms: value,
        first_packet_ms: value,
      });
      expect(detail.stream).toBeUndefined();
      expect(detail.ttft_ms).toBeUndefined();
      expect(detail.first_packet_ms).toBeUndefined();
    }
  );
});
