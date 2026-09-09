export interface UsageResponseMetrics {
  stream?: boolean;
  ttft_ms?: number;
  first_packet_ms?: number;
}

const positiveMilliseconds = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export function normalizeUsageResponseMetrics(
  record: Record<string, unknown>
): UsageResponseMetrics {
  return {
    stream: typeof record.stream === 'boolean' ? record.stream : undefined,
    ttft_ms: positiveMilliseconds(record.ttft_ms),
    first_packet_ms: positiveMilliseconds(record.first_packet_ms),
  };
}
