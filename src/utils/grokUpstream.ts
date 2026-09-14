export const GROK_UPSTREAM_URLS = {
  cli: 'https://cli-chat-proxy.grok.com/v1',
  api: 'https://api.x.ai/v1',
  'us-east-1': 'https://us-east-1.api.x.ai/v1',
  'us-west-2': 'https://us-west-2.api.x.ai/v1',
  'eu-west-1': 'https://eu-west-1.api.x.ai/v1',
} as const;

export type GrokUpstreamMode = keyof typeof GROK_UPSTREAM_URLS;
export type GrokAccountUpstream = GrokUpstreamMode | 'inherit' | 'custom';
export const GROK_UPSTREAM_MODES = Object.keys(GROK_UPSTREAM_URLS) as GrokUpstreamMode[];

export function normalizeGrokBaseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return '';
  if (/[?#\\\r\n\t]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function grokAccountUpstream(baseUrl: unknown): GrokAccountUpstream {
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!raw) return 'inherit';
  const normalized = normalizeGrokBaseUrl(raw);
  return GROK_UPSTREAM_MODES.find((mode) => GROK_UPSTREAM_URLS[mode] === normalized) ?? 'custom';
}
