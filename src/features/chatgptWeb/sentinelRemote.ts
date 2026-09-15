import type { SentinelRemote } from '@/types/sentinelCompute';

export const validSentinelAccessPath = (value: string): boolean => {
  if (value === '') return true;
  if (value.length > 256 || !value.startsWith('/') || value.endsWith('/')) return false;
  return value
    .slice(1)
    .split('/')
    .every((part) => part !== '.' && part !== '..' && /^[a-zA-Z0-9_.-]+$/.test(part));
};

export const sentinelEndpointURL = (base: string, accessPath = ''): string =>
  `${base.replace(/\/+$/, '')}${accessPath || '/v1/sentinel'}`;

export const normalizeSentinelRemote = (remote?: SentinelRemote): Required<SentinelRemote> => ({
  scopes: remote?.scopes ?? ['images'],
  nodes: (remote?.nodes ?? []).map((node) => ({ ...node })),
  'budget-seconds': remote?.['budget-seconds'] ?? 30,
});

export const validSentinelRemote = (mode: string, remote: SentinelRemote): boolean => {
  const resolved = normalizeSentinelRemote(remote);
  if (!['local', 'remote'].includes(mode)) return false;
  if (
    !Number.isSafeInteger(resolved['budget-seconds']) ||
    resolved['budget-seconds'] < 1 ||
    resolved['budget-seconds'] > 3600
  )
    return false;
  if (resolved.scopes.some((scope) => !['images', 'chat', 'login'].includes(scope))) return false;
  if (new Set(resolved.scopes).size !== resolved.scopes.length) return false;
  if (mode === 'remote' && resolved.scopes.length > 0 && !resolved.nodes.length) return false;
  const names = new Set<string>();
  return resolved.nodes.every((node) => {
    if (!node.name.trim() || names.has(node.name) || !node['api-key'].trim()) return false;
    names.add(node.name);
    try {
      const url = new URL(node.url);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.pathname === '/' || validSentinelAccessPath(url.pathname.replace(/\/+$/, '')))
      );
    } catch {
      return false;
    }
  });
};
