/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import {
  normalizeStringValue,
  normalizePlanType,
  parseIdTokenPayload
} from './parsers';

const CODEX_ACCOUNT_ID_KEYS = [
  'chatgpt_account_id',
  'chatgptAccountId',
  'account_id',
  'accountId',
] as const;

const CODEX_USER_ID_FALLBACK_KEYS = [
  'chatgpt_user_id',
  'chatgptUserId',
  'user_id',
  'userId',
] as const;

const OPENAI_AUTH_CLAIM_KEY = 'https://api.openai.com/auth';

const pickStringFromRecord = (
  record: Record<string, unknown> | null,
  keys: readonly string[]
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const id = normalizeStringValue(record[key]);
    if (id) return id;
  }
  return null;
};

const pickCodexAccountIdFromRecord = (record: Record<string, unknown> | null): string | null => {
  if (!record) return null;

  const directAccountId = pickStringFromRecord(record, CODEX_ACCOUNT_ID_KEYS);
  if (directAccountId) return directAccountId;

  const account =
    record.account && typeof record.account === 'object' && !Array.isArray(record.account)
      ? (record.account as Record<string, unknown>)
      : null;
  const nestedAccountId = pickStringFromRecord(account, [...CODEX_ACCOUNT_ID_KEYS, 'id']);
  if (nestedAccountId) return nestedAccountId;

  const openaiAuth =
    record[OPENAI_AUTH_CLAIM_KEY] &&
    typeof record[OPENAI_AUTH_CLAIM_KEY] === 'object' &&
    !Array.isArray(record[OPENAI_AUTH_CLAIM_KEY])
      ? (record[OPENAI_AUTH_CLAIM_KEY] as Record<string, unknown>)
      : null;
  const openaiAccountId = pickStringFromRecord(openaiAuth, CODEX_ACCOUNT_ID_KEYS);
  if (openaiAccountId) return openaiAccountId;

  const directUserId = pickStringFromRecord(record, CODEX_USER_ID_FALLBACK_KEYS);
  if (directUserId) return directUserId;

  const openaiUserId = pickStringFromRecord(openaiAuth, CODEX_USER_ID_FALLBACK_KEYS);
  if (openaiUserId) return openaiUserId;

  return null;
};

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return pickCodexAccountIdFromRecord(payload);
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const base = file as unknown as Record<string, unknown>;
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const records = [base, metadata, attributes];
  for (const record of records) {
    const id = pickCodexAccountIdFromRecord(record);
    if (id) return id;
  }

  const candidates = [
    file.id_token,
    file.idToken,
    file['id_token_source'],
    file.access_token,
    file.accessToken,
    metadata?.id_token,
    metadata?.idToken,
    metadata?.id_token_source,
    metadata?.access_token,
    metadata?.accessToken,
    attributes?.id_token,
    attributes?.idToken,
    attributes?.id_token_source,
    attributes?.access_token,
    attributes?.accessToken
  ];

  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const idToken =
    file && typeof file.id_token === 'object' && file.id_token !== null
      ? (file.id_token as Record<string, unknown>)
      : null;
  const metadataIdToken =
    metadata && typeof metadata.id_token === 'object' && metadata.id_token !== null
      ? (metadata.id_token as Record<string, unknown>)
      : null;
  const candidates = [
    file.plan_type,
    file.planType,
    file['plan_type'],
    file['planType'],
    file.id_token,
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan_type,
    metadata?.planType,
    metadata?.id_token,
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    attributes?.plan_type,
    attributes?.planType,
    attributes?.id_token
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.account,
    file['account'],
    metadata?.account,
    attributes?.account
  ];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
