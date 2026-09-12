export interface UsageFailureDetails {
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
  const upstreamStatus = typeof upstream === 'number' || typeof upstream === 'string' ? Number(upstream) : NaN;
  if (Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599) detail.upstream_status_code = upstreamStatus;
  for (const key of ['error_code', 'error_type', 'error_message', 'error_response', 'failure_stage', 'request_id', 'upstream_request_id'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) detail[key] = value.slice(0, key === 'error_response' ? 4096 : key === 'error_message' ? 1024 : 128);
  }
  for (const key of ['credential_selected', 'upstream_committed', 'auth_request_slot_consumed'] as const) {
    if (typeof record[key] === 'boolean') detail[key] = record[key];
  }
  return detail;
}
