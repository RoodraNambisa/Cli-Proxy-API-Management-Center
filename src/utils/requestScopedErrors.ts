import {
  REQUEST_SCOPED_ERROR_ACTIONS,
  type OAuthRequestScopedErrors,
  type RequestScopedErrorRule,
} from '@/types/requestScopedErrors';

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const invalid = (index: number, field: string): never => {
  throw new Error(`Request-scoped error rule ${index + 1}: invalid ${field}`);
};

const patterns = (value: unknown, index: number, field: string): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => item !== null && typeof item !== 'string'))
    return invalid(index, field);
  // Go decodes null string entries as empty strings. Spaces and case are significant.
  return value.map((item) => item ?? '');
};

export const normalizeRequestScopedErrors = (
  value: unknown
): RequestScopedErrorRule[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('Request-scoped errors must be a list');
  return value.map((item, index) => {
    if (item === null) return {};
    if (!record(item)) return invalid(index, 'rule');
    if (item.status != null && (typeof item.status !== 'number' || !Number.isSafeInteger(item.status)))
      return invalid(index, 'status');
    if (item.action != null && typeof item.action !== 'string') return invalid(index, 'action');
    const result: RequestScopedErrorRule = Object.fromEntries(
      Object.entries(item).filter(([key]) => !['status', 'action', 'match', 'match-regexr', 'matchRegexr'].includes(key))
    );
    if (item.status != null) result.status = item.status as number;
    if (item.action != null) result.action = item.action as string;
    const match = patterns(item.match, index, 'match');
    const regex = patterns(own(item, 'match-regexr') ? item['match-regexr'] : item.matchRegexr, index, 'match-regexr');
    if (match !== undefined) result.match = match;
    if (regex !== undefined) result.matchRegexr = regex;
    return result;
  });
};

export type RequestScopedErrorIssue = 'status' | 'action' | 'match';

// Syntax is validated by the server's Go/RE2 compiler, not JavaScript RegExp.
export const validateRequestScopedErrorRule = (
  rule: RequestScopedErrorRule
): RequestScopedErrorIssue | undefined => {
  const action = (rule.action ?? '').trim().toLowerCase();
  const hasPattern = [...(rule.match ?? []), ...(rule.matchRegexr ?? [])].some((value) => value !== '');
  if ((rule.status ?? 0) === 0 && action === '' && !hasPattern) return undefined;
  if (!Number.isSafeInteger(rule.status) || rule.status! < 100 || rule.status! > 599) return 'status';
  if (!REQUEST_SCOPED_ERROR_ACTIONS.some((value) => value === action)) return 'action';
  if (!hasPattern) return 'match';
  return undefined;
};

export const serializeRequestScopedErrors = (
  value: RequestScopedErrorRule[] | undefined
): Record<string, unknown>[] | undefined => {
  const rules = normalizeRequestScopedErrors(value);
  return rules?.map((rule, index) => {
    const issue = validateRequestScopedErrorRule(rule);
    if (issue) return invalid(index, issue);
    const result: Record<string, unknown> = { ...rule };
    delete result.matchRegexr;
    if (rule.matchRegexr !== undefined) result['match-regexr'] = rule.matchRegexr;
    return result;
  });
};

export const normalizeOAuthRequestScopedErrors = (
  value: unknown
): OAuthRequestScopedErrors | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!record(value)) throw new Error('OAuth request-scoped errors must be a provider map');
  const seen = new Set<string>();
  return Object.fromEntries(Object.entries(value).map(([provider, rules], index) => {
    const canonical = provider.trim().toLowerCase();
    if (!canonical || seen.has(canonical))
      throw new Error(`OAuth error rules: provider entry ${index + 1} is empty or duplicated`);
    seen.add(canonical);
    return [provider, normalizeRequestScopedErrors(rules) ?? []];
  }));
};

export const serializeOAuthRequestScopedErrors = (
  value: OAuthRequestScopedErrors | undefined
): Record<string, Record<string, unknown>[]> | undefined => {
  const providers = normalizeOAuthRequestScopedErrors(value);
  return providers === undefined ? undefined : Object.fromEntries(
    Object.entries(providers).map(([provider, rules]) => [provider, serializeRequestScopedErrors(rules) ?? []])
  );
};
