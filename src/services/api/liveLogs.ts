import { apiClient } from './client';

export type LiveLogEvent = {
  cursor: number;
  timestamp: string;
  level: string;
  message: string;
  request_id?: string;
  provider?: string;
  auth_index?: string;
  stage?: string;
  code?: string;
  status?: number;
  method?: string;
  path?: string;
  retryable?: boolean;
  persona?: string;
  ua_major?: string;
  platform?: string;
  target_host?: string;
  target_path?: string;
  response_type?: string;
  content_type?: string;
  cf_ray?: string;
  response_bytes?: number;
  response_body?: string;
  response_body_truncated?: boolean;
  attempts?: number;
  cloudflare?: boolean;
};

export type LiveLogGap = {
  count: number;
  from: number;
  to: number;
};

export type LiveLogQuery = {
  level?: string;
  contains?: string;
  requestId?: string;
  provider?: string;
  authIndex?: string;
  stage?: string;
  code?: string;
  status?: string;
  method?: string;
  path?: string;
  hideManagement?: boolean;
  cursor?: number;
};

export type LiveLogCallbacks = {
  onOpen?: () => void;
  onEvent: (event: LiveLogEvent) => void;
  onGap: (gap: LiveLogGap) => void;
};

type ParsedSseMessage = {
  event: string;
  id?: string;
  data?: string;
};

export const parseSseMessage = (block: string): ParsedSseMessage | null => {
  const normalized = block.replace(/\r\n/g, '\n').trim();
  if (!normalized || normalized.startsWith(':')) return null;

  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  normalized.split('\n').forEach((line) => {
    if (!line || line.startsWith(':')) return;
    const separator = line.indexOf(':');
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : '';
    if (field === 'event') event = value;
    if (field === 'id') id = value;
    if (field === 'data') data.push(value);
  });
  return { event, id, data: data.length > 0 ? data.join('\n') : undefined };
};

const appendQuery = (url: URL, query: LiveLogQuery): void => {
  const values: Array<[string, string | undefined]> = [
    ['level', query.level],
    ['contains', query.contains],
    ['request_id', query.requestId],
    ['provider', query.provider],
    ['auth_index', query.authIndex],
    ['stage', query.stage],
    ['code', query.code],
    ['status', query.status],
    ['method', query.method],
    ['path', query.path],
  ];
  values.forEach(([key, value]) => {
    const normalized = value?.trim();
    if (normalized) url.searchParams.set(key, normalized);
  });
  if (query.hideManagement) url.searchParams.set('hide_management', 'true');
  if (query.cursor && query.cursor > 0) url.searchParams.set('cursor', String(query.cursor));
};

const streamError = (message: string, status?: number): Error & { status?: number } => {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

export const formatLiveLogEvent = (event: LiveLogEvent): string => {
  const prefix = [
    event.timestamp ? `[${event.timestamp}]` : '',
    event.request_id ? `[${event.request_id}]` : '',
    event.level ? `[${event.level}]` : '',
    event.provider ? `[${event.provider}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const request = [event.status ? `HTTP ${event.status}` : '', event.method, event.path]
    .filter(Boolean)
    .join(' ');
  const details = [
    event.auth_index ? `auth=${event.auth_index}` : '',
    event.stage ? `stage=${event.stage}` : '',
    event.code ? `code=${event.code}` : '',
    event.retryable !== undefined ? `retryable=${event.retryable}` : '',
    event.cloudflare ? 'cloudflare=true' : '',
    event.cf_ray ? `cf_ray=${event.cf_ray}` : '',
    event.response_type ? `response=${event.response_type}` : '',
    event.content_type ? `content_type=${event.content_type}` : '',
    event.target_host ? `target=${event.target_host}${event.target_path ?? ''}` : '',
    event.persona ? `persona=${event.persona}` : '',
    event.ua_major ? `ua=${event.ua_major}` : '',
    event.platform ? `platform=${event.platform}` : '',
    event.attempts ? `attempts=${event.attempts}` : '',
    event.response_bytes ? `bytes=${event.response_bytes}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const responseBody = event.response_body
    ? `response_body=${JSON.stringify(event.response_body)}${event.response_body_truncated ? ' [truncated]' : ''}`
    : '';
  return [prefix, request, event.message, details, responseBody].filter(Boolean).join(' · ');
};

export const streamLiveLogs = async (
  query: LiveLogQuery,
  callbacks: LiveLogCallbacks,
  signal: AbortSignal
): Promise<void> => {
  const connection = apiClient.captureConnection();
  if (!connection.apiBase) throw streamError('API connection is not configured');

  const url = new URL(`${connection.apiBase.replace(/\/+$/, '')}/logs/stream`);
  appendQuery(url, query);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...(connection.managementKey ? { Authorization: `Bearer ${connection.managementKey}` } : {}),
    },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    let message = `Live logs request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) message = body.error;
    } catch {
      // Keep the bounded status-only error when the response is not JSON.
    }
    throw streamError(message, response.status);
  }
  if (!response.body) throw streamError('Live logs response has no stream body', response.status);
  callbacks.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (block: string) => {
    const parsed = parseSseMessage(block);
    if (!parsed?.data) return;
    if (parsed.event === 'log') callbacks.onEvent(JSON.parse(parsed.data) as LiveLogEvent);
    if (parsed.event === 'gap') callbacks.onGap(JSON.parse(parsed.data) as LiveLogGap);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const normalized = buffer.replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    buffer = blocks.pop() ?? '';
    blocks.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
};
