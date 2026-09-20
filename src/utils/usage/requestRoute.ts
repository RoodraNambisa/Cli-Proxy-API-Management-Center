export interface UsageRequestRoute {
  request_method?: string;
  request_path?: string;
}

// Explicit request metadata wins over legacy endpoint grouping. API key groups
// are never treated as paths, and query parameters are excluded from display.
export function normalizeUsageRequestRoute(
  record: Record<string, unknown>,
  endpoint = ''
): UsageRequestRoute {
  const match = endpoint.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/\S*)/i);
  const method = record.request_method ?? record.method ?? record.__endpointMethod ?? match?.[1];
  const path = record.request_path ?? record.path ?? record.__endpointPath ?? match?.[2];
  const requestPath = typeof path === 'string' ? path.trim().split(/[?#]/)[0] : '';
  return {
    ...(typeof method === 'string' && /^[A-Za-z]+$/.test(method.trim())
      ? { request_method: method.trim().toUpperCase() }
      : {}),
    ...(requestPath.startsWith('/') ? { request_path: requestPath } : {}),
  };
}
