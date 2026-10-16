export type BrowserRegionConfig = {
  'auto-timezone': boolean;
  'auto-language': boolean;
  language: string;
  timezone: string;
  'timezone-offset-minutes': number | null;
  'lookup-url': string;
  'lookup-timeout-seconds': number;
  'cache-ttl-seconds': number;
  'route-cache-size': number;
  'ip-cache-size': number;
};

export type BrowserRegionPreview = {
  application?: import('@/services/api/proxyIp').ProxyRegionApplication;
  timezone: string;
  timezone_offset_minutes: number;
  language: string;
  timezone_source: string;
  language_source: string;
  observation_source?: string;
  country?: string;
  region?: string;
  cache_state: string;
  cache_age_seconds: number;
  refresh_state: string;
  reason?: string;
  retry_after_seconds?: number;
};

export const browserRegionDefaults: BrowserRegionConfig = {
  'auto-timezone': false,
  'auto-language': false,
  language: '',
  timezone: 'UTC',
  'timezone-offset-minutes': null,
  'lookup-url': 'https://ipwho.is/{ip}',
  'lookup-timeout-seconds': 8,
  'cache-ttl-seconds': 21600,
  'route-cache-size': 100000,
  'ip-cache-size': 100000,
};

export type BrowserRegionDraft = {
  [K in keyof BrowserRegionConfig]: BrowserRegionConfig[K] extends boolean ? boolean : string;
};
export const regionToDraft = (config: BrowserRegionConfig): BrowserRegionDraft => ({
  ...config,
  'timezone-offset-minutes':
    config['timezone-offset-minutes'] === null ? '' : String(config['timezone-offset-minutes']),
  'lookup-timeout-seconds': String(config['lookup-timeout-seconds']),
  'cache-ttl-seconds': String(config['cache-ttl-seconds']),
  'route-cache-size': String(config['route-cache-size']),
  'ip-cache-size': String(config['ip-cache-size']),
});

export const parseBrowserRegionDraft = (draft: BrowserRegionDraft): BrowserRegionConfig | null => {
  const positive = [
    'lookup-timeout-seconds',
    'cache-ttl-seconds',
    'route-cache-size',
    'ip-cache-size',
  ] as const;
  if (
    positive.some(
      (key) =>
        !draft[key].trim() || !Number.isSafeInteger(Number(draft[key])) || Number(draft[key]) < 1
    )
  )
    return null;
  const offset =
    draft['timezone-offset-minutes'].trim() === ''
      ? null
      : Number(draft['timezone-offset-minutes']);
  if (offset !== null && (!Number.isSafeInteger(offset) || offset < -840 || offset > 840))
    return null;
  try {
    if (draft.timezone.trim()) new Intl.DateTimeFormat('en', { timeZone: draft.timezone.trim() });
    if (draft.language.trim()) Intl.getCanonicalLocales(draft.language.trim());
    const target = new URL(draft['lookup-url'].trim().replace(/\{ip\}/g, '8.8.8.8'));
    const authority = draft['lookup-url']
      .trim()
      .replace(/^https:\/\//, '')
      .split(/[/?#]/)[0];
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      authority.includes('{ip}') ||
      /[{}\r\n\t]/.test(target.href)
    )
      return null;
    if (/[{}]/.test(draft['lookup-url'].replace(/\{ip\}/g, ''))) return null;
  } catch {
    return null;
  }
  return {
    'auto-timezone': draft['auto-timezone'],
    'auto-language': draft['auto-language'],
    timezone: draft.timezone.trim() || 'UTC',
    language: draft.language.trim(),
    'timezone-offset-minutes': offset,
    'lookup-url': draft['lookup-url'].trim(),
    'lookup-timeout-seconds': Number(draft['lookup-timeout-seconds']),
    'cache-ttl-seconds': Number(draft['cache-ttl-seconds']),
    'route-cache-size': Number(draft['route-cache-size']),
    'ip-cache-size': Number(draft['ip-cache-size']),
  };
};
