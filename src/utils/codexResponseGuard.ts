import type { Document } from 'yaml';
import { detachErrorRuleAliases } from './requestScopedErrorsYaml';
import { API_KEY_PRIORITY_LIMIT } from './apiKeyGroups';

export type GuardMode = 'off' | 'observe' | 'enforce';
export type GuardSettings = {
  mode?: GuardMode;
  'match-model'?: boolean;
  'allowed-returned-models'?: string[];
  'length-mode'?: 'off' | 'allow' | 'deny';
  lengths?: number[];
  'missing-model'?: 'allow' | 'reject';
  'missing-state'?: 'allow' | 'reject';
  'on-reject'?: 'error' | 'retry';
  'clear-affinity'?: 'none' | 'session' | 'credential';
  'late-mismatch'?: 'observe' | 'abort';
  'error-type'?: string;
  'error-code'?: string;
  'error-message'?: string;
};
export type GuardModelOverride = {
  id: string;
  enabled?: boolean;
  models: string[];
  settings: GuardSettings;
};
export type GuardRule = {
  id: string;
  name?: string;
  enabled?: boolean;
  priorities?: number[];
  credentials?: string[];
  'excluded-credentials'?: string[];
  'plan-types'?: string[];
  models?: string[];
  settings: GuardSettings;
  'model-overrides'?: GuardModelOverride[];
};
export type CodexResponseGuard = GuardSettings & { enabled: boolean; rules?: GuardRule[] };
export const GUARD_DEFAULTS: Required<GuardSettings> = {
  mode: 'off',
  'match-model': true,
  'allowed-returned-models': [],
  'length-mode': 'off',
  lengths: [],
  'missing-model': 'allow',
  'missing-state': 'allow',
  'on-reject': 'error',
  'clear-affinity': 'session',
  'late-mismatch': 'observe',
  'error-type': 'rate_limit_exceeded',
  'error-code': 'rate_limit_exceeded',
  'error-message': 'Rate limit exceeded. Please try again later.',
};
export function readResponseGuard(raw: unknown): CodexResponseGuard {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { enabled: false };
  return { ...(raw as CodexResponseGuard), enabled: (raw as CodexResponseGuard).enabled === true };
}
export const responseGuardEqual = (a: CodexResponseGuard, b: CodexResponseGuard) =>
  JSON.stringify(a) === JSON.stringify(b);
export const newGuardRule = (): GuardRule => ({
  id: crypto.randomUUID(),
  enabled: true,
  settings: {},
});

export function guardNameError(v: string): boolean {
  return !v.trim() || new TextEncoder().encode(v).length > 256 || /[\r\n\0]/.test(v);
}
export function responseGuardError(v: CodexResponseGuard): boolean {
  const names = (values: unknown): boolean =>
    values !== undefined &&
    (!Array.isArray(values) ||
      values.length > 128 ||
      values.some((item) => typeof item !== 'string' || guardNameError(item)));
  const settings = (s: GuardSettings): boolean => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return true;
    const enums = {
      mode: ['off', 'observe', 'enforce'],
      'length-mode': ['off', 'allow', 'deny'],
      'missing-model': ['allow', 'reject'],
      'missing-state': ['allow', 'reject'],
      'on-reject': ['error', 'retry'],
      'clear-affinity': ['none', 'session', 'credential'],
      'late-mismatch': ['observe', 'abort'],
    };
    for (const [key, values] of Object.entries(enums)) {
      const value = s[key as keyof GuardSettings];
      if (value !== undefined && !values.includes(String(value))) return true;
    }
    if (s['match-model'] !== undefined && typeof s['match-model'] !== 'boolean') return true;
    if (names(s['allowed-returned-models'])) return true;
    if (
      s.lengths !== undefined &&
      (!Array.isArray(s.lengths) ||
        s.lengths.length > 128 ||
        s.lengths.some((n) => !Number.isInteger(n) || n < 1 || n > 8192))
    )
      return true;
    return (['error-type', 'error-code', 'error-message'] as const).some(
      (key) =>
        s[key] !== undefined &&
        (typeof s[key] !== 'string' ||
          !s[key]!.trim() ||
          new TextEncoder().encode(s[key]!).length > 2048 ||
          /[\r\n\0]/.test(s[key]!))
    );
  };
  if (
    settings(v) ||
    (v.rules !== undefined && !Array.isArray(v.rules)) ||
    (v.rules?.length ?? 0) > 128
  )
    return true;
  const ids = new Set<string>();
  return (v.rules ?? []).some((r) => {
    if (!r.id || ids.has(r.id) || settings(r.settings)) return true;
    ids.add(r.id);
    if (
      ['credentials', 'excluded-credentials', 'plan-types', 'models'].some((key) =>
        names(r[key as keyof GuardRule])
      )
    )
      return true;
    if (
      r.priorities !== undefined &&
      (!Array.isArray(r.priorities) ||
        r.priorities.length > 128 ||
        r.priorities.some((n) => !Number.isInteger(n) || Math.abs(n) > API_KEY_PRIORITY_LIMIT))
    )
      return true;
    if (r['model-overrides'] !== undefined && !Array.isArray(r['model-overrides'])) return true;
    const models = new Set<string>();
    const overrideIds = new Set<string>();
    return (r['model-overrides'] ?? []).some((o) => {
      if (
        !o.id ||
        overrideIds.has(o.id) ||
        !Array.isArray(o.models) ||
        !o.models.length ||
        names(o.models) ||
        settings(o.settings)
      )
        return true;
      overrideIds.add(o.id);
      return (
        o.enabled !== false &&
        o.models.some((m) => {
          if (models.has(m)) return true;
          models.add(m);
          return false;
        })
      );
    });
  });
}

export function writeResponseGuard(doc: Document, value: CodexResponseGuard) {
  if (responseGuardError(value)) throw new Error('Invalid Codex response guard configuration');
  detachErrorRuleAliases(doc, doc.getIn(['codex', 'response-guard'], true));
  // The visual value retains unknown fields at every level, including reordered rules.
  doc.setIn(['codex', 'response-guard'], JSON.parse(JSON.stringify(value)));
}

export type GuardVerdict = { model: string; state: string; reasons: string[] };
export type GuardRecord = {
  id: string;
  at: string;
  attempt: number;
  requested_model: string;
  upstream_model: string;
  original_model: string;
  response_model: string;
  state_present: boolean;
  state_length: number;
  verdict: GuardVerdict;
  outcome: string;
  phase: string;
  rule: number;
  rule_name?: string;
  clear_affinity: string;
  stream: boolean;
  transport: string;
  status: number;
  upstream_status: number;
  completed: boolean;
  error?: string;
  usage?: Record<string, number>;
  rewritten: boolean;
};
export type GuardPreview = {
  requested_model: string;
  upstream_model: string;
  response_model: string;
  outcome: string;
  managed: boolean;
  verdict: GuardVerdict;
  policy: {
    mode: GuardMode;
    rule: number;
    rule_name?: string;
    sources: Record<string, string>;
    on_reject: string;
  };
  resource_acceptance: {
    allowed_returned_models: string[] | null;
    lengths: number[] | null;
    length_mode: string;
    invalidate_on_model_mismatch: boolean;
    invalidate_on_state_length_mismatch: boolean;
  };
};
