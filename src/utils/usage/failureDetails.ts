export interface UsageImageAggregation {
  role: 'attempt' | 'delivery';
  batch_id: string;
  image_index: number;
  attempt_index: number;
  requested: number;
  generated: number;
  delivered: number;
  retry_attempts: number;
  executed: boolean;
  original_code?: string;
  original_stage?: string;
}
export interface UsageFailureDetails {
  image_aggregation?: UsageImageAggregation;
  aggregation_from?: string;
  aggregation_to?: string;
  status_code?: number;
  upstream_status_code?: number;
  error_code?: string;
  error_type?: string;
  error_message?: string;
  error_response?: string;
  failure_stage?: string;
  request_id?: string;
  upstream_request_id?: string;
  credential_selected?: boolean;
  upstream_committed?: boolean;
  auth_request_slot_consumed?: boolean;
}

export function normalizeUsageFailureDetails(record: Record<string, unknown>): UsageFailureDetails {
  const detail: UsageFailureDetails = {};
  const status = record.status_code ?? record.status;
  const numeric = typeof status === 'number' || typeof status === 'string' ? Number(status) : NaN;
  if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) detail.status_code = numeric;
  const upstream = record.upstream_status_code;
  const upstreamStatus =
    typeof upstream === 'number' || typeof upstream === 'string' ? Number(upstream) : NaN;
  if (Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599)
    detail.upstream_status_code = upstreamStatus;
  for (const key of [
    'error_code',
    'error_type',
    'error_message',
    'error_response',
    'failure_stage',
    'request_id',
    'upstream_request_id',
  ] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim())
      detail[key] = value.slice(
        0,
        key === 'error_response' ? 4096 : key === 'error_message' ? 1024 : 128
      );
  }
  for (const key of [
    'credential_selected',
    'upstream_committed',
    'auth_request_slot_consumed',
  ] as const) {
    if (typeof record[key] === 'boolean') detail[key] = record[key];
  }
  const aggregation = record.image_aggregation as Partial<UsageImageAggregation> | undefined;
  if (
    aggregation &&
    ['attempt', 'delivery'].includes(aggregation.role ?? '') &&
    typeof aggregation.batch_id === 'string' &&
    /^[a-zA-Z0-9-]{1,64}$/.test(aggregation.batch_id)
  ) {
    const count = (key: keyof UsageImageAggregation) => {
      const value = Number(aggregation[key]);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    };
    detail.image_aggregation = {
      role: aggregation.role as UsageImageAggregation['role'],
      batch_id: aggregation.batch_id,
      image_index: count('image_index'),
      attempt_index: count('attempt_index'),
      requested: count('requested'),
      generated: count('generated'),
      delivered: count('delivered'),
      retry_attempts: count('retry_attempts'),
      executed: aggregation.executed === true,
      original_code:
        typeof aggregation.original_code === 'string'
          ? aggregation.original_code.slice(0, 128)
          : undefined,
      original_stage:
        typeof aggregation.original_stage === 'string'
          ? aggregation.original_stage.slice(0, 128)
          : undefined,
    };
    const start = Date.parse(String(record.timestamp ?? ''));
    const latency = Number(record.latency_ms);
    const from = new Date(start - 1000);
    const to = new Date(start + (Number.isFinite(latency) ? Math.max(0, latency) : 0) + 60000);
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
      detail.aggregation_from = from.toISOString();
      detail.aggregation_to = to.toISOString();
    }
  }
  return detail;
}
