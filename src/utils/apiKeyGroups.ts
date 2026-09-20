import type { ClientApiKeyGroup } from '@/types/config';

export const API_KEY_PRIORITY_LIMIT = Number.MAX_SAFE_INTEGER;
export const API_KEY_NAME_LIMIT = 100;

export function normalizeApiKeyName(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('api-key-groups.name must be a string');
  const name = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
  if (Array.from(name).length > API_KEY_NAME_LIMIT || /[\p{Cc}\p{Cs}]/u.test(name)) {
    throw new Error('api-key-groups.name must contain at most 100 characters and no control characters');
  }
  return name;
}

export function apiKeyNamesEqual(first: Record<string, string>, second: Record<string, string>): boolean {
  const entries = (names: Record<string, string>) => Object.entries(names).filter(([, name]) => name !== '').sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(first)) === JSON.stringify(entries(second));
}

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
    if ('allow-credential-targeting' in record || 'allowCredentialTargeting' in record) {
      group.allowCredentialTargeting = (record['allow-credential-targeting'] ?? record.allowCredentialTargeting) === true;
    }
    if ('credential-target-respect-state-policy' in record || 'credentialTargetRespectStatePolicy' in record) {
      group.credentialTargetRespectStatePolicy = (record['credential-target-respect-state-policy'] ?? record.credentialTargetRespectStatePolicy) === true;
    }
    if ('credential-target-respect-request-limit' in record || 'credentialTargetRespectRequestLimit' in record) {
      group.credentialTargetRespectRequestLimit = (record['credential-target-respect-request-limit'] ?? record.credentialTargetRespectRequestLimit) === true;
    }
    if ('credential-target-response-model-rewrite' in record || 'credentialTargetResponseModelRewrite' in record) {
      group.credentialTargetResponseModelRewrite = (record['credential-target-response-model-rewrite'] ?? record.credentialTargetResponseModelRewrite) === true;
    }
    if ('name' in record) group.name = normalizeApiKeyName(record.name);
    if ('allowed-priorities' in record || 'allowedPriorities' in record) {
      group.allowedPriorities = normalizeApiKeyPriorities(Object.prototype.hasOwnProperty.call(record, 'allowed-priorities') ? record['allowed-priorities'] : record.allowedPriorities);
    }
    if ('excluded-priorities' in record || 'excludedPriorities' in record) {
      group.excludedPriorities = normalizeApiKeyPriorities(Object.prototype.hasOwnProperty.call(record, 'excluded-priorities') ? record['excluded-priorities'] : record.excludedPriorities);
    }
    return [group];
  });
}
