export const STATE_STRATEGY_KEYS = [
  'strategy',
  'cookie-acquisition-model',
  'cookie-pool-mode',
  'cookie-pool-group',
  'cookie-verify-after-acquire',
  'cookie-backup-count',
  'cookie-max-age-seconds',
  'cookie-refresh-before-seconds',
  'ttl-seconds',
  'refresh-before-seconds',
  'missing-returned-state',
] as const;

export type StateStrategyFields = {
  strategy: string;
  'cookie-acquisition-model': string;
  'cookie-pool-mode': string;
  'cookie-pool-group': string;
  'cookie-verify-after-acquire': boolean;
  'ttl-seconds': string;
  'refresh-before-seconds': string;
  'missing-returned-state': string;
};

export function readStateStrategy(raw: Record<string, unknown>): StateStrategyFields {
  return {
    'cookie-acquisition-model':
      typeof raw['cookie-acquisition-model'] === 'string' ? raw['cookie-acquisition-model'] : '',
    'cookie-pool-mode':
      typeof raw['cookie-pool-mode'] === 'string' ? raw['cookie-pool-mode'] : 'auto',
    'cookie-pool-group':
      typeof raw['cookie-pool-group'] === 'string' ? raw['cookie-pool-group'] : '',
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
  if (
    s['cookie-pool-mode'] !== undefined &&
    !['auto', 'model', 'shared', 'credential'].includes(String(s['cookie-pool-mode']))
  )
    return true;
  const source = s['cookie-acquisition-model'];
  if (
    source !== undefined &&
    (typeof source !== 'string' ||
      new TextEncoder().encode(source).length > 256 ||
      /[\s\x00-\x1f\x7f*?]/.test(source))
  )
    return true;
  const group = s['cookie-pool-group'];
  if (
    group !== undefined &&
    (typeof group !== 'string' ||
      new TextEncoder().encode(group).length > 128 ||
      group.trim() !== group ||
      /[\x00-\x1f\x7f]/.test(group))
  )
    return true;
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
  if (
    s['cookie-backup-count'] !== undefined &&
    (typeof s['cookie-backup-count'] !== 'number' ||
      !Number.isInteger(s['cookie-backup-count']) ||
      s['cookie-backup-count'] < 0 ||
      s['cookie-backup-count'] > 10)
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
