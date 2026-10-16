export type ProxyIPConfig = {
  'temporary-route-check-interval-seconds': number;
  'temporary-route-cache-size': number;
  'lookup-url': string;
  'lookup-timeout-seconds': number;
  'ip-cache-ttl-seconds': number;
  'ip-cache-size': number;
  'refresh-mode': 'lazy' | 'scheduled';
  'cold-cache-mode': 'fallback' | 'wait';
  'refresh-batch-size': number;
  'refresh-interval-seconds': number;
};
export const proxyIPDefaults: ProxyIPConfig = {
  'temporary-route-check-interval-seconds': 300,
  'temporary-route-cache-size': 100000,
  'lookup-url': 'https://ipwho.is/{ip}',
  'lookup-timeout-seconds': 8,
  'ip-cache-ttl-seconds': 86400,
  'ip-cache-size': 100000,
  'refresh-mode': 'lazy',
  'cold-cache-mode': 'fallback',
  'refresh-batch-size': 64,
  'refresh-interval-seconds': 5,
};
export type TimeContext = {
  enabled: boolean;
  mode: 'proxy' | 'manual' | 'inherit' | 'off';
  timezone: string;
  'lookup-failure': 'preserve' | 'fallback';
  'fallback-timezone': string;
};
export const timeContextDefaults: TimeContext = {
  enabled: false,
  mode: 'proxy',
  timezone: '',
  'lookup-failure': 'preserve',
  'fallback-timezone': '',
};
export function readTimeContext(raw: unknown): TimeContext {
  return {
    ...timeContextDefaults,
    ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
  };
}
export function validTimezone(zone: string): boolean {
  if (!zone || zone === 'Local') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export function validTimeContext(value: TimeContext): boolean {
  return (
    (!value.enabled || value.mode !== 'manual' || validTimezone(value.timezone)) &&
    (value['lookup-failure'] !== 'fallback' || validTimezone(value['fallback-timezone']))
  );
}
export function validProxyIP(value: ProxyIPConfig): boolean {
  try {
    const url = new URL(value['lookup-url'].replace('{ip}', '8.8.8.8'));
    if (url.protocol !== 'https:' || url.username || url.password) return false;
  } catch {
    return false;
  }
  return (
    Object.entries(value).every(
      ([key, v]) =>
        typeof proxyIPDefaults[key as keyof ProxyIPConfig] !== 'number' ||
        (typeof v === 'number' && Number.isSafeInteger(v) && v > 0)
    ) &&
    value['refresh-batch-size'] <= 4096 &&
    value['refresh-interval-seconds'] <= 86400
  );
}
