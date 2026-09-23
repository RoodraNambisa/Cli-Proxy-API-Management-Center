import { generateId } from './helpers';

const ruleGroupPrefix = 'cookie-rule-';

export function hasCookieRulePool(settings: Record<string, unknown>): boolean {
  return (
    settings['cookie-pool-mode'] === 'shared' &&
    typeof settings['cookie-pool-group'] === 'string' &&
    settings['cookie-pool-group'].startsWith(ruleGroupPrefix)
  );
}

// Persist pool identity independently of its models and acquisition model.
export function shareCookieRule(settings: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...settings,
    'cookie-pool-mode': 'shared',
    'cookie-pool-group': hasCookieRulePool(settings)
      ? settings['cookie-pool-group']
      : `${ruleGroupPrefix}${generateId()}`,
  };
}

export function copyCookieRulePools<
  T extends {
    settings: Record<string, unknown>;
    'model-overrides'?: Array<{ settings: Record<string, unknown> }>;
  },
>(rule: T): T {
  const copy = structuredClone(rule);
  const groups = new Map<unknown, unknown>();
  for (const item of [copy, ...(copy['model-overrides'] ?? [])]) {
    if (!hasCookieRulePool(item.settings)) continue;
    const previous = item.settings['cookie-pool-group'];
    if (!groups.has(previous)) groups.set(previous, shareCookieRule()['cookie-pool-group']);
    item.settings['cookie-pool-group'] = groups.get(previous);
  }
  return copy;
}
