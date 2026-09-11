import type { ClientApiKeyGroup } from '@/types/config';

export const API_KEY_PRIORITY_LIMIT = Number.MAX_SAFE_INTEGER;

export function normalizeApiKeyPriorities(value: unknown): number[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number' || !Number.isSafeInteger(entry))) {
    throw new Error('api-key-groups priorities must be integer arrays in [-9007199254740991, 9007199254740991]');
  }
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

export function normalizeClientApiKeyGroups(value: unknown): ClientApiKeyGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const apiKey = String(record['api-key'] ?? record.apiKey ?? '').trim();
    if (!apiKey) return [];
    const group: ClientApiKeyGroup = {
      apiKey,
      providers: Array.isArray(record.providers)
        ? [...new Set(record.providers.map((provider) => String(provider ?? '').trim().toLowerCase()).filter(Boolean))]
        : [],
    };
    if ('allowed-priorities' in record || 'allowedPriorities' in record) {
      group.allowedPriorities = normalizeApiKeyPriorities(Object.prototype.hasOwnProperty.call(record, 'allowed-priorities') ? record['allowed-priorities'] : record.allowedPriorities);
    }
    if ('excluded-priorities' in record || 'excludedPriorities' in record) {
      group.excludedPriorities = normalizeApiKeyPriorities(Object.prototype.hasOwnProperty.call(record, 'excluded-priorities') ? record['excluded-priorities'] : record.excludedPriorities);
    }
    return [group];
  });
}
