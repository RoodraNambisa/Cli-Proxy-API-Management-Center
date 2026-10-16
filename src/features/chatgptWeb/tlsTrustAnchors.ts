import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';

export const TLS_TRUST_ANCHORS_KEY = 'tls-trust-anchors-enabled';

export function readTLSTrustAnchors(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'boolean')
    throw new Error('chatgpt-web.tls-trust-anchors-enabled must be a boolean');
  return value;
}

export async function supportsTLSTrustAnchors(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<boolean> {
  const response = await apiClient.getAtConnection<{ features?: unknown }>(
    connection,
    '/chatgpt-web/capabilities',
    { signal }
  );
  return Array.isArray(response?.features) && response.features.includes('tls_trust_anchors_v1');
}
