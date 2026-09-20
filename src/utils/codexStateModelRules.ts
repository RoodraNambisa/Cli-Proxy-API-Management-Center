import { generateId } from './helpers';
import {
  readStateModelOverrides,
  serializeCodexState,
  type CodexStateOverride,
  type CodexStateRule,
  type CodexStateRuleModelOverride,
} from './codexStateOverride';

export const STATE_SETTING_KEYS = [
  'mode',
  'missing-policy',
  'acquisition',
  'active-minutes',
  'ttl-minutes',
  'refresh-before-minutes',
  'retry-seconds',
  'max-attempts',
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
];
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
export const sameStateValue = (a: unknown, b: unknown) => stable(a) === stable(b);

export function inheritedStateSettings(
  value: CodexStateOverride,
  parent: Record<string, unknown> = {},
  model?: string
): Record<string, unknown> {
  const defaults = serializeCodexState({ ...value, rules: undefined });
  const override = readStateModelOverrides(value['model-overrides'])?.find(
    (item) => item.model === model
  );
  return { ...defaults, ...override, ...parent };
}

function modelSettings(rule: CodexStateRule, model: string) {
  const override = rule['model-overrides']?.find(
    (item) => item.enabled !== false && item.models.includes(model)
  );
  return { ...rule.settings, ...override?.settings };
}

export type StateRuleMerge = {
  rule: CodexStateRule;
  rows: Array<{ model: string; from: string; settings: Record<string, unknown> }>;
};

// Merge only finite adjacent scopes. Explicit equal values remain explicit;
// omitted fields continue to follow their original default layer.
export function mergeStateRules(
  first: CodexStateRule,
  second: CodexStateRule
): StateRuleMerge | undefined {
  if (
    first.action !== 'manage' ||
    second.action !== 'manage' ||
    !first.models.length ||
    !second.models.length
  )
    return;
  const scope = (rule: CodexStateRule) =>
    Object.fromEntries(
      Object.entries(rule)
        .filter(([k]) => !['id', 'name', 'models', 'settings', 'model-overrides'].includes(k))
        .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : k === 'enabled' ? v !== false : v])
    );
  if (
    !sameStateValue(
      scope({ ...first, enabled: first.enabled !== false }),
      scope({ ...second, enabled: second.enabled !== false })
    )
  )
    return;
  for (const rule of [first, second]) {
    if (
      rule['model-overrides']?.some(
        (item) => item.enabled === false || item.models.some((m) => !rule.models.includes(m))
      )
    )
      return;
    if (
      Object.keys(rule.settings).some((k) => !STATE_SETTING_KEYS.includes(k)) ||
      rule['model-overrides']?.some(
        (item) =>
          Object.keys(item).some((k) => !['id', 'models', 'settings', 'enabled'].includes(k)) ||
          Object.keys(item.settings).some((k) => !STATE_SETTING_KEYS.includes(k))
      )
    )
      return;
  }
  const models = [...new Set([...first.models, ...second.models])];
  if (models.length > 256) return;
  const rows = models.map((model) => {
    const rule = first.models.includes(model) ? first : second;
    return { model, from: rule.name || rule.id, settings: modelSettings(rule, model) };
  });
  const common = Object.fromEntries(
    Object.entries(rows[0].settings).filter(([key, value]) =>
      rows.every((row) => key in row.settings && sameStateValue(row.settings[key], value))
    )
  );
  const overrides: CodexStateRuleModelOverride[] = [];
  for (const row of rows) {
    const settings = Object.fromEntries(
      Object.entries(row.settings).filter(([key]) => !(key in common))
    );
    if (!Object.keys(settings).length) continue;
    const existing = overrides.find((item) => sameStateValue(item.settings, settings));
    if (existing) existing.models.push(row.model);
    else overrides.push({ id: generateId(), models: [row.model], settings });
  }
  return { rule: { ...first, models, settings: common, 'model-overrides': overrides }, rows };
}
