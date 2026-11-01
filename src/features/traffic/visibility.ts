export type TrafficVisibility = { apiKeyTraffic: boolean; credentialTraffic: boolean };

export function readTrafficVisibility(raw: unknown): TrafficVisibility {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    apiKeyTraffic: value['api-key-traffic'] !== false,
    credentialTraffic: value['credential-traffic'] !== false,
  };
}
