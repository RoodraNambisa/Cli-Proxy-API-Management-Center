import type { AuthFileItem } from '@/types/authFile';
import type { TrafficSnapshot } from './types';

const validLimit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function hasCredentialConcurrencySummary(file: AuthFileItem): boolean {
  return validLimit(file.request_limit?.concurrency_limit) &&
    Boolean(file.request_limit?.concurrency_source);
}

export function credentialConcurrencySummary(file: AuthFileItem, traffic?: TrafficSnapshot) {
  if (hasCredentialConcurrencySummary(file)) {
    return {
      limit: file.request_limit!.concurrency_limit!,
      source: file.request_limit!.concurrency_source,
      rule: file.request_limit!.concurrency_rule,
      fromTraffic: false,
    };
  }
  if (traffic && validLimit(traffic.concurrency_limit)) {
    return {
      limit: traffic.concurrency_limit,
      source: traffic.concurrency_source,
      rule: undefined,
      fromTraffic: true,
    };
  }
  return undefined;
}
