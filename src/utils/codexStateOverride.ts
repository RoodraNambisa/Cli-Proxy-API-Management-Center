import { generateId } from './helpers';
import type { Document } from 'yaml';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';
import { API_KEY_PRIORITY_LIMIT } from './apiKeyGroups';

export const STATE_NUMBER_DEFAULTS = {
  'active-minutes': 60,
  'ttl-minutes': 60,
  'refresh-before-minutes': 5,
  concurrency: 1,
  'retry-seconds': 60,
  'max-attempts': 3,
  'retry-round-interval-minutes': 30,
  'max-retry-rounds': 0,
};
export type StateNumberField = keyof typeof STATE_NUMBER_DEFAULTS;
export type StatePlanLengthRule = {
  planTypes: string;
  models: string;
  lengths: string;
  extra: Record<string, unknown>;
};
export type CodexStateRuleModelOverride = {
  id: string;
  enabled?: boolean;
  models: string[];
  settings: Record<string, unknown>;
  [key: string]: unknown;
};
export type CodexStateRule = {
  id: string;
  name: string;
  enabled?: boolean;
  action: 'manage' | 'skip';
  'model-overrides'?: CodexStateRuleModelOverride[];
  priorities: number[];
  credentials: string[];
  'excluded-credentials': string[];
  'plan-types': string[];
  models: string[];
  settings: Record<string, unknown>;
  [key: string]: unknown;
};
export type CodexStateOverride = Record<StateNumberField, string> & {
  rules?: CodexStateRule[];
  enabled: boolean;
  priorities: string;
  'included-credentials': string;
  models: string;
  'excluded-credentials': string;
  mode: string;
  'missing-policy': string;
  acquisition: string;
  'proxy-mode': string;
  'proxy-url': string;
  lengths: string;
  'match-model': boolean;
  'invalidate-on-state-length-mismatch': boolean;
  'invalidate-on-model-mismatch': boolean;
  prompt: string;
  'response-contains': string;
  'error-type': string;
  'error-code': string;
  'error-message': string;
  'model-overrides': string;
  'plan-lengths': StatePlanLengthRule[];
};
const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
const listText = (raw: unknown) => (Array.isArray(raw) ? raw.join(', ') : '');
export const splitStateList = (value: string) => [
  ...new Set(
    value
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
  ),
];

export type StateListKind = 'priority' | 'credential' | 'model' | 'plan' | 'length';
export function stateListItemError(value: string, kind: StateListKind): string | undefined {
  if (kind === 'priority') {
    return /^-?\d+$/.test(value) &&
      Number.isSafeInteger(Number(value)) &&
      Math.abs(Number(value)) <= API_KEY_PRIORITY_LIMIT
      ? undefined
      : 'picker_invalid_priority';
  }
  if (kind === 'length') {
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 8192
      ? undefined
      : 'picker_invalid_length';
  }
  return value.trim() &&
    new TextEncoder().encode(value).length <= (kind === 'credential' ? 512 : 256) &&
    !/[,，\r\n\0]/.test(value)
    ? undefined
    : 'picker_invalid_identifier';
}

export function readStateModelOverrides(value: string): Record<string, unknown>[] | undefined {
  try {
    const entries: unknown = JSON.parse(value || '[]');
    return Array.isArray(entries) &&
      entries.every((item) => item && typeof item === 'object' && !Array.isArray(item))
      ? entries
      : undefined;
  } catch {
    return undefined;
  }
}
export function readCodexState(raw: unknown): CodexStateOverride {
  const s = record(raw);
  const text = (key: string, fallback: string) =>
    typeof s[key] === 'string' && s[key] !== '' ? (s[key] as string) : fallback;
  return {
    ...(Object.fromEntries(
      Object.entries(STATE_NUMBER_DEFAULTS).map(([k, v]) => [k, String(s[k] || v)])
    ) as Record<StateNumberField, string>),
    'model-overrides': JSON.stringify(s['model-overrides'] ?? [], null, 2),
    'plan-lengths': Array.isArray(s['plan-lengths'])
      ? s['plan-lengths'].map((raw) => {
          const { 'plan-types': plans, models, lengths, ...extra } = record(raw);
          return {
            planTypes: listText(plans),
            models: listText(models),
            lengths: listText(lengths),
            extra,
          };
        })
      : [],
    ...(Array.isArray(s.rules)
      ? {
          rules: s.rules.map((raw) => {
            const r = record(raw);
            return {
              ...r,
              id: String(r.id ?? ''),
              name: String(r.name ?? ''),
              enabled: r.enabled !== false,
              action: String(r.action || 'manage') as CodexStateRule['action'],
              priorities: Array.isArray(r.priorities) ? r.priorities : [],
              credentials: Array.isArray(r.credentials) ? r.credentials : [],
              'excluded-credentials': Array.isArray(r['excluded-credentials'])
                ? r['excluded-credentials']
                : [],
              'plan-types': Array.isArray(r['plan-types']) ? r['plan-types'] : [],
              models: Array.isArray(r.models) ? r.models : [],
              settings: record(r.settings),
              ...(Array.isArray(r['model-overrides'])
                ? {
                    'model-overrides': r['model-overrides'].map((raw) => {
                      const item = record(raw);
                      return {
                        ...item,
                        id: typeof item.id === 'string' ? item.id : '',
                        models: Array.isArray(item.models) ? item.models : [],
                        settings: record(item.settings),
                      };
                    }),
                  }
                : {}),
            } as CodexStateRule;
          }),
        }
      : {}),
    enabled: s.enabled === true,
    priorities: listText(s.priorities),
    'included-credentials': listText(s['included-credentials']),
    models: listText(s.models),
    'excluded-credentials': listText(s['excluded-credentials']),
    mode: text('mode', 'override'),
    'missing-policy': text('missing-policy', 'continue'),
    acquisition: text('acquisition', 'active'),
    'proxy-mode': text('proxy-mode', 'inherit'),
    'proxy-url': text('proxy-url', ''),
    lengths: s.lengths == null ? '292' : listText(s.lengths),
    'match-model': s['match-model'] !== false,
    'invalidate-on-state-length-mismatch': s['invalidate-on-state-length-mismatch'] === true,
    'invalidate-on-model-mismatch': s['invalidate-on-model-mismatch'] === true,
    prompt: text('prompt', 'Reply with exactly OK.'),
    'response-contains': text('response-contains', ''),
    'error-type': text('error-type', 'rate_limit_exceeded'),
    'error-code': text('error-code', 'rate_limit_exceeded'),
    'error-message': text(
      'error-message',
      'Rate limit exceeded for image_generation. Please try again later.'
    ),
  };
}
export const DEFAULT_CODEX_STATE = readCodexState(undefined);
export const codexStateEqual = (a: CodexStateOverride, b: CodexStateOverride) =>
  JSON.stringify(a) === JSON.stringify(b);
export function codexStateError(v: CodexStateOverride): boolean {
  if (!readStateModelOverrides(v['model-overrides'])) return true;
  if (v.rules !== undefined) {
    if (v.rules.length > 128) return true;
    const seen = new Set<string>();
    for (const r of v.rules) {
      if (
        !r.id.trim() ||
        seen.has(r.id) ||
        r.id.length > 128 ||
        /[\r\n\0]/.test(r.id) ||
        r.name.length > 256 ||
        !['manage', 'skip'].includes(r.action)
      )
        return true;
      seen.add(r.id);
      const selectors: [unknown[], StateListKind, number][] = [
        [r.priorities, 'priority', 128],
        [r.credentials, 'credential', 1024],
        [r['excluded-credentials'], 'credential', 1024],
        [r['plan-types'], 'plan', 32],
        [r.models, 'model', 256],
      ];
      if (
        selectors.some(
          ([values, kind, max]) =>
            values.length > max || values.some((x) => stateListItemError(String(x), kind))
        )
      )
        return true;
      const settings = r.settings;
      if (
        [
          'mode',
          'missing-policy',
          'acquisition',
          'proxy-mode',
          'prompt',
          'error-type',
          'error-code',
        ].some(
          (key) =>
            key in settings && (typeof settings[key] !== 'string' || !String(settings[key]).trim())
        )
      )
        return true;
      if (
        ['proxy-url', 'response-contains', 'error-message'].some(
          (key) => key in settings && typeof settings[key] !== 'string'
        )
      )
        return true;

      const effective = readCodexState({
        ...serializeCodexState({ ...v, rules: undefined }),
        ...Object.fromEntries(
          Object.entries(settings).filter(([key]) =>
            [
              ...Object.keys(STATE_NUMBER_DEFAULTS).filter((key) => key !== 'concurrency'),
              'mode',
              'missing-policy',
              'acquisition',
              'proxy-mode',
              'proxy-url',
              'lengths',
              'match-model',
              'prompt',
              'response-contains',
              'error-type',
              'error-code',
              'error-message',
              'invalidate-on-state-length-mismatch',
              'invalidate-on-model-mismatch',
            ].includes(key)
          )
        ),
      });
      if (
        Object.entries(STATE_NUMBER_DEFAULTS).some(
          ([key]) =>
            key in settings &&
            (typeof settings[key] !== 'number' ||
              !Number.isInteger(settings[key]) ||
              Number(settings[key]) < (key === 'max-retry-rounds' ? 0 : 1))
        )
      )
        return true;
      if (
        ['match-model', 'invalidate-on-state-length-mismatch', 'invalidate-on-model-mismatch'].some(
          (key) => key in settings && typeof settings[key] !== 'boolean'
        )
      )
        return true;
      if (
        'lengths' in settings &&
        (!Array.isArray(settings.lengths) ||
          settings.lengths.some(
            (x) => typeof x !== 'number' || stateListItemError(String(x), 'length')
          ))
      )
        return true;
      if (codexStateError(effective)) return true;
      if (r['model-overrides'] !== undefined) {
        if (!Array.isArray(r['model-overrides']) || r['model-overrides'].length > 256) return true;
        const ids = new Set<string>(),
          models = new Set<string>();
        for (const item of r['model-overrides']) {
          if (
            !item ||
            typeof item.id !== 'string' ||
            !item.id.trim() ||
            ids.has(item.id) ||
            item.id.length > 128 ||
            /[\r\n\0]/.test(item.id) ||
            (item.enabled !== undefined && typeof item.enabled !== 'boolean')
          )
            return true;
          ids.add(item.id);
          if (
            !Array.isArray(item.models) ||
            !item.models.length ||
            item.models.length > 256 ||
            new Set(item.models).size !== item.models.length ||
            item.models.some(
              (m) => typeof m !== 'string' || stateListItemError(m, 'model') || /[*?]/.test(m)
            )
          )
            return true;
          for (const model of item.models) {
            if (item.enabled === false) continue;
            if (models.has(model)) return true;
            models.add(model);
          }
          if (!item.settings || typeof item.settings !== 'object' || Array.isArray(item.settings))
            return true;
          if (
            codexStateError({
              ...v,
              rules: [
                {
                  ...r,
                  'model-overrides': undefined,
                  settings: { ...r.settings, ...item.settings },
                },
              ],
            })
          )
            return true;
        }
      }
    }
  }
  if (v['plan-lengths'].length > 64) return true;
  for (const rule of v['plan-lengths']) {
    const plans = splitStateList(rule.planTypes),
      models = splitStateList(rule.models),
      lengths = splitStateList(rule.lengths);
    if (
      !plans.length ||
      plans.length > 32 ||
      models.length > 256 ||
      lengths.length > 32 ||
      [...plans, ...models].some((value) => value.length > 256 || /[\r\n\0]/.test(value)) ||
      lengths.some((n) => !/^\d+$/.test(n) || Number(n) < 1 || Number(n) > 8192)
    )
      return true;
  }
  try {
    const overrides: unknown = JSON.parse(v['model-overrides'] || '[]');
    if (!Array.isArray(overrides) || overrides.length > 256) return true;
    const models = new Set<string>();
    for (const raw of overrides) {
      const item = record(raw);
      if (
        typeof item.model !== 'string' ||
        !item.model.trim() ||
        models.has(item.model) ||
        item.model.length > 256 ||
        /[\r\n\0]/.test(item.model)
      )
        return true;
      models.add(item.model);
      if (
        item.lengths != null &&
        (!Array.isArray(item.lengths) ||
          item.lengths.length > 32 ||
          item.lengths.some(
            (n) => typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 8192
          ))
      )
        return true;
      if (item['match-model'] != null && typeof item['match-model'] !== 'boolean') return true;
      if (item.prompt != null && (typeof item.prompt !== 'string' || item.prompt.length > 4096))
        return true;
      if (
        item['response-contains'] != null &&
        (typeof item['response-contains'] !== 'string' || item['response-contains'].length > 1024)
      )
        return true;
    }
  } catch {
    return true;
  }
  const bounds: Record<StateNumberField, [number, number]> = {
    'active-minutes': [1, 10080],
    'ttl-minutes': [1, 1440],
    'refresh-before-minutes': [1, 1439],
    concurrency: [1, 16],
    'retry-seconds': [1, 3600],
    'max-attempts': [1, 10],
    'retry-round-interval-minutes': [1, 1440],
    'max-retry-rounds': [0, 10],
  };
  if (
    Object.entries(bounds).some(
      ([k, [min, max]]) =>
        !/^\d+$/.test(v[k as StateNumberField]) ||
        Number(v[k as StateNumberField]) < min ||
        Number(v[k as StateNumberField]) > max
    )
  )
    return true;
  if (Number(v['refresh-before-minutes']) >= Number(v['ttl-minutes'])) return true;
  if (
    !['override', 'missing'].includes(v.mode) ||
    !['continue', 'error', 'hide'].includes(v['missing-policy']) ||
    !['all', 'active', 'manual'].includes(v.acquisition) ||
    !['inherit', 'direct', 'custom'].includes(v['proxy-mode'])
  )
    return true;
  if (
    splitStateList(v.priorities).some(
      (n) => !/^-?\d+$/.test(n) || Math.abs(Number(n)) > API_KEY_PRIORITY_LIMIT
    ) ||
    splitStateList(v.lengths).some((n) => !/^\d+$/.test(n) || Number(n) < 1 || Number(n) > 8192)
  )
    return true;
  if (v['proxy-mode'] === 'custom') {
    if (v['proxy-url'].length > 4096 || /[\r\n\0]/.test(v['proxy-url'])) return true;
    const matches = [...v['proxy-url'].matchAll(/\{(\d+)\}/g)];
    if (matches.some((m) => Number(m[1]) < 1 || Number(m[1]) > 64)) return true;
    const expanded = v['proxy-url'].replace(/\{\d+\}/g, '123');
    if (/[{}]/.test(expanded)) return true;
    try {
      const u = new URL(expanded);
      if (
        !['http:', 'https:', 'socks5:', 'socks5h:'].includes(u.protocol) ||
        !u.hostname ||
        u.search ||
        u.hash ||
        (u.pathname && u.pathname !== '/')
      )
        return true;
    } catch {
      return true;
    }
  }
  return (
    v.prompt.length > 4096 ||
    v['response-contains'].length > 1024 ||
    v['error-type'].length > 128 ||
    v['error-code'].length > 128 ||
    v['error-message'].length > 4096 ||
    splitStateList(v.models).length > 256 ||
    splitStateList(v.priorities).length > 128 ||
    splitStateList(v.lengths).length > 32 ||
    splitStateList(v['included-credentials']).length > 1024 ||
    splitStateList(v['included-credentials']).some((s) => s.length > 512 || /[\r\n\0]/.test(s)) ||
    splitStateList(v['excluded-credentials']).length > 1024
  );
}
export function writeCodexState(doc: Document, value: CodexStateOverride) {
  if (codexStateError(value)) throw new Error('Invalid codex.state-override configuration');
  const path = ['codex', 'state-override'];
  const old = record(record(readMergedYamlField(doc, ['codex']))['state-override']);
  detachErrorRuleAliases(doc, doc.getIn(path, true));
  doc.setIn(path, { ...old, ...serializeCodexState(value) });
}

export function serializeCodexState(value: CodexStateOverride): Record<string, unknown> {
  return {
    ...value,
    'model-overrides': JSON.parse(value['model-overrides'] || '[]'),
    'plan-lengths': value['plan-lengths'].map((rule) => ({
      ...rule.extra,
      'plan-types': splitStateList(rule.planTypes),
      models: splitStateList(rule.models),
      lengths: splitStateList(rule.lengths).map(Number),
    })),
    ...Object.fromEntries(
      Object.keys(STATE_NUMBER_DEFAULTS).map((k) => [k, Number(value[k as StateNumberField])])
    ),
    models: splitStateList(value.models),
    priorities: splitStateList(value.priorities).map(Number),
    lengths: splitStateList(value.lengths).map(Number),
    'included-credentials': splitStateList(value['included-credentials']),
    'excluded-credentials': splitStateList(value['excluded-credentials']),
  };
}

export function newCodexStateRule(): CodexStateRule {
  return {
    id: generateId(),
    name: '',
    enabled: true,
    action: 'manage',
    priorities: [],
    credentials: [],
    'excluded-credentials': [],
    'plan-types': [],
    models: [],
    settings: {},
  };
}
export function migrateCodexStateRules(value: CodexStateOverride): CodexStateOverride {
  if (value.rules !== undefined) return value;
  const base = newCodexStateRule();
  base.models = splitStateList(value.models);
  base['excluded-credentials'] = splitStateList(value['excluded-credentials']);
  const priorities = splitStateList(value.priorities).map(Number);
  const credentials = splitStateList(value['included-credentials']);
  const rules: CodexStateRule[] = [];
  if (priorities.length || !credentials.length) rules.push({ ...base, priorities });
  if (credentials.length) rules.push({ ...base, id: generateId(), credentials });
  return {
    ...value,
    priorities: '',
    'included-credentials': '',
    'excluded-credentials': '',
    models: '',
    rules,
  };
}
