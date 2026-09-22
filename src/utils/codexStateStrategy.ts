export const STATE_STRATEGY_KEYS = [
  'strategy',
  'cookie-verify-after-acquire',
  'cookie-max-age-seconds',
  'cookie-refresh-before-seconds',
  'ttl-seconds',
  'refresh-before-seconds',
  'missing-returned-state',
] as const;

export type StateStrategyFields = {
  strategy: string;
  'cookie-verify-after-acquire': boolean;
  'ttl-seconds': string;
  'refresh-before-seconds': string;
  'missing-returned-state': string;
};

export function readStateStrategy(raw: Record<string, unknown>): StateStrategyFields {
  return {
    strategy: typeof raw.strategy === 'string' ? raw.strategy : 'state',
    'cookie-verify-after-acquire': raw['cookie-verify-after-acquire'] === true,
    'ttl-seconds': raw['ttl-seconds'] == null ? '' : String(raw['ttl-seconds']),
    'refresh-before-seconds':
      raw['refresh-before-seconds'] == null ? '' : String(raw['refresh-before-seconds']),
    'missing-returned-state':
      typeof raw['missing-returned-state'] === 'string' ? raw['missing-returned-state'] : 'ignore',
  };
}

// Resolve units inside each layer before applying the existing rule precedence.
export function mergeStateSettings(
  base: Record<string, unknown>,
  override: Record<string, unknown>
) {
  const merged = { ...base, ...override };
  if (override['ttl-minutes'] !== undefined && override['ttl-seconds'] === undefined)
    delete merged['ttl-seconds'];
  if (
    override['refresh-before-minutes'] !== undefined &&
    override['refresh-before-seconds'] === undefined
  )
    delete merged['refresh-before-seconds'];
  return merged;
}

export function stateStrategySettingsInvalid(s: Record<string, unknown>): boolean {
  if (s.strategy !== undefined && !['state', 'cookie-only'].includes(String(s.strategy)))
    return true;
  if (
    s['missing-returned-state'] !== undefined &&
    !['ignore', 'reject'].includes(String(s['missing-returned-state']))
  )
    return true;
  if (
    s['cookie-verify-after-acquire'] !== undefined &&
    typeof s['cookie-verify-after-acquire'] !== 'boolean'
  )
    return true;
  return [
    'ttl-seconds',
    'refresh-before-seconds',
    'cookie-max-age-seconds',
    'cookie-refresh-before-seconds',
  ].some((key) => {
    const n = s[key];
    return (
      n !== undefined &&
      (typeof n !== 'number' ||
        !Number.isInteger(n) ||
        n < (key === 'ttl-seconds' ? 1 : 0) ||
        n > 86400)
    );
  });
}

export function stateNeedsTurnState(value: {
  strategy: string;
  'model-overrides'?: string;
  rules?: Array<{
    enabled?: boolean;
    action: string;
    settings: Record<string, unknown>;
    'model-overrides'?: Array<{ enabled?: boolean; settings: Record<string, unknown> }>;
  }>;
}): boolean {
  if (!value.rules) {
    if (value.strategy !== 'cookie-only') return true;
    try {
      const overrides = JSON.parse(value['model-overrides'] || '[]');
      return Array.isArray(overrides) && overrides.some((o) => o.strategy === 'state');
    } catch {
      return true;
    }
  }
  return value.rules.some(
    (rule) =>
      rule.enabled !== false &&
      rule.action !== 'skip' &&
      ((rule.settings.strategy ?? value.strategy) !== 'cookie-only' ||
        rule['model-overrides']?.some(
          (item) =>
            item.enabled !== false &&
            (item.settings.strategy ?? rule.settings.strategy ?? value.strategy) !== 'cookie-only'
        ))
  );
}
