import type { ProxyPoolEntry } from '@/types';

export const PROXY_TRANSFER_FORMATS = [
  'url',
  'host-port-user-pass',
  'port-host-user-pass',
  'pass-port-host-user',
  'user-pass-host-port',
] as const;
export type ProxyTransferFormat = (typeof PROXY_TRANSFER_FORMATS)[number];
export const PROXY_PROTOCOLS = ['http', 'https', 'socks5', 'socks5h'] as const;
export type ProxyProtocol = (typeof PROXY_PROTOCOLS)[number];
export const MAX_PROXY_TRANSFER_LINES = 10000;
export type ProxyTransferError =
  | 'format'
  | 'host'
  | 'port'
  | 'protocol'
  | 'credentials'
  | 'template'
  | 'masked'
  | 'limit'
  | 'ambiguous';
export interface ProxyTransferIssue {
  line: number;
  code: ProxyTransferError;
}
interface ProxyParts {
  protocol: ProxyProtocol;
  host: string;
  port: string;
  userInfo: string;
}

class ProxyTransferFailure extends Error {
  constructor(readonly code: ProxyTransferError) {
    super(code);
  }
}
const fail = (code: ProxyTransferError): never => {
  throw new ProxyTransferFailure(code);
};
const issueCode = (error: unknown): ProxyTransferError =>
  error instanceof ProxyTransferFailure ? error.code : 'format';
const hasControl = (value: string): boolean => {
  for (const char of value) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return true;
  return false;
};
const portNumber = (value: string): number => {
  if (!/^\d+$/.test(value.trim())) return fail('port');
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) return fail('port');
  return number;
};

function credential(value: string, encoded: boolean): string {
  // Preserve raw placeholders. Percent-escaped braces remain literal credentials.
  const pieces = value.split(/(\{\d+\})/);
  return pieces
    .map((piece) => {
      if (/^\{\d+\}$/.test(piece)) {
        const length = Number(piece.slice(1, -1));
        if (length < 1 || length > 128) return fail('template');
        return piece;
      }
      if (/[{}]/.test(piece)) return fail('template');
      let decoded = piece;
      try {
        if (encoded) decoded = decodeURIComponent(piece);
      } catch {
        return fail('credentials');
      }
      if (hasControl(decoded)) return fail('credentials');
      if (decoded.includes('********')) return fail('masked');
      return encodeURIComponent(decoded).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
      );
    })
    .join('');
}

function hostname(value: string): string {
  if (!value || /[\s/@?#%\\{}]/.test(value)) return fail('host');
  if (value.includes(':') && !/^\[[^\]]+\]$/.test(value)) return fail('host');
  try {
    const parsed = new URL(`http://${value}:1`);
    if (!parsed.hostname || parsed.port !== '1' || parsed.username || parsed.password)
      return fail('host');
    return value.toLowerCase();
  } catch {
    return fail('host');
  }
}

function parseURL(raw: string, portOptional = false): ProxyParts {
  const match = raw.trim().match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/i);
  if (!match) return fail('format');
  const protocol = match[1].toLowerCase() as ProxyProtocol;
  if (!PROXY_PROTOCOLS.includes(protocol)) return fail('protocol');
  const authority = match[2];
  if (/[/?#\\\s]/.test(authority) || hasControl(authority)) return fail('format');
  const at = authority.lastIndexOf('@');
  let userInfo = '';
  if (at >= 0) {
    const rawInfo = authority.slice(0, at);
    const colon = rawInfo.indexOf(':');
    userInfo =
      colon < 0
        ? credential(rawInfo, true)
        : `${credential(rawInfo.slice(0, colon), true)}:${credential(rawInfo.slice(colon + 1), true)}`;
    userInfo += '@';
  }
  const address = authority.slice(at + 1).match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!address) return fail('host');
  if (!address[2] && !portOptional) return fail('port');
  return {
    protocol,
    host: hostname(address[1]),
    port: address[2] ? String(portNumber(address[2])) : '',
    userInfo,
  };
}

function toURL(parts: ProxyParts, port = parts.port): string {
  return `${parts.protocol}://${parts.userInfo}${parts.host}${port ? `:${port}` : ''}`;
}

function parseLine(line: string, format: ProxyTransferFormat, protocol: ProxyProtocol): ProxyParts {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line.trim())) {
    try {
      return parseURL(line);
    } catch (error) {
      if (format !== 'pass-port-host-user') throw error;
    }
  }
  if (format === 'url') return fail('format');
  let host: string, port: string, user: string, pass: string;
  let match: RegExpMatchArray | null;
  switch (format) {
    case 'host-port-user-pass':
      match = line.match(/^(\[[^\]]+\]|[^:]+):(\d+)(?::([^:]*):(.*))?$/);
      if (!match) return fail('format');
      [, host, port, user = '', pass = ''] = match;
      break;
    case 'port-host-user-pass':
      match = line.match(/^(\d+):(\[[^\]]+\]|[^:]+)(?::([^:]*):(.*))?$/);
      if (!match) return fail('format');
      [, port, host, user = '', pass = ''] = match;
      break;
    case 'pass-port-host-user':
      match = line.match(/^(.*):(\d+):(\[[^\]]+\]|[^:]+):([^:]*)$/);
      if (!match) return fail('format');
      [, pass, port, host, user] = match;
      break;
    case 'user-pass-host-port':
      match = line.match(/^([^:]*):(.*)@(\[[^\]]+\]|[^:]+):(\d+)$/);
      if (!match) return fail('format');
      [, user, pass, host, port] = match;
      break;
  }
  if (!PROXY_PROTOCOLS.includes(protocol)) return fail('protocol');
  return {
    protocol,
    host: hostname(host),
    port: String(portNumber(port)),
    userInfo: user || pass ? `${credential(user, false)}:${credential(pass, false)}@` : '',
  };
}

function entryPorts(entry: ProxyPoolEntry, inline: string): number[] {
  const raw = entry.ports?.trim();
  if (!raw) return [portNumber(inline)];
  const ports = new Set<number>();
  for (const token of raw.split(',')) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) return fail('port');
    const start = portNumber(match[1]),
      end = portNumber(match[2] ?? match[1]);
    if (end < start) return fail('port');
    if (end - start >= MAX_PROXY_TRANSFER_LINES) return fail('limit');
    for (let port = start; port <= end; port++) ports.add(port);
    if (ports.size > MAX_PROXY_TRANSFER_LINES) return fail('limit');
  }
  return [...ports].sort((a, b) => a - b);
}

export function exportProxyEntries(
  entries: ProxyPoolEntry[],
  format: ProxyTransferFormat = 'url',
  protocol: string = 'all'
): { text: string; count: number; issues: ProxyTransferIssue[] } {
  const lines: string[] = [],
    issues: ProxyTransferIssue[] = [];
  entries.forEach((entry, index) => {
    if (!entry.id.trim() && !entry['url-template'].trim() && !entry.ports?.trim()) return;
    if (
      protocol !== 'all' &&
      entry['url-template'].trim().split('://')[0].toLowerCase() !== protocol
    )
      return;
    try {
      const parts = parseURL(entry['url-template'], Boolean(entry.ports?.trim()));
      if (protocol !== 'all' && parts.protocol !== protocol) return;
      const ports = entryPorts(entry, parts.port);
      if (lines.length + ports.length > MAX_PROXY_TRANSFER_LINES) return fail('limit');
      let user = '',
        pass = '';
      if (format !== 'url' && parts.userInfo) {
        const info = parts.userInfo.slice(0, -1),
          colon = info.indexOf(':');
        user = decodeURIComponent(colon < 0 ? info : info.slice(0, colon));
        pass = colon < 0 ? '' : decodeURIComponent(info.slice(colon + 1));
        // These layouts cannot represent a colon in USER or distinguish an
        // escaped literal brace from a dynamic placeholder after decoding.
        if (
          user.includes(':') ||
          /[{}]/.test(decodeURIComponent(info.replace(/\{\d+\}/g, ''))) ||
          /[\r\n]/.test(user + pass)
        )
          return fail('ambiguous');
      }
      for (const port of ports) {
        const layouts: Record<ProxyTransferFormat, string> = {
          url: toURL(parts, String(port)),
          'host-port-user-pass': `${parts.host}:${port}:${user}:${pass}`,
          'port-host-user-pass': `${port}:${parts.host}:${user}:${pass}`,
          'pass-port-host-user': `${pass}:${port}:${parts.host}:${user}`,
          'user-pass-host-port': `${user}:${pass}@${parts.host}:${port}`,
        };
        lines.push(layouts[format]);
      }
    } catch (error) {
      issues.push({ line: index + 1, code: issueCode(error) });
    }
  });
  return { text: lines.join('\n'), count: lines.length, issues };
}

export function importProxyEntries(
  text: string,
  format: ProxyTransferFormat,
  protocol: ProxyProtocol,
  existing: ProxyPoolEntry[] = []
): { entries: ProxyPoolEntry[]; duplicates: number; issues: ProxyTransferIssue[] } {
  const entries: ProxyPoolEntry[] = [],
    issues: ProxyTransferIssue[] = [];
  let duplicates = 0;
  const lines = text.split(/\r\n|\n|\r/);
  if (
    text.length > 2 * 1024 * 1024 ||
    lines.filter((line) => line.trim()).length > MAX_PROXY_TRANSFER_LINES
  )
    return { entries, duplicates, issues: [{ line: 0, code: 'limit' }] };
  const seen = new Set(exportProxyEntries(existing).text.split('\n').filter(Boolean));
  const ids = new Set(existing.map((entry) => entry.id.trim().toLowerCase()));
  let nextId = 1;
  lines.forEach((raw, index) => {
    const line = raw;
    if (!line.trim()) return;
    try {
      const url = toURL(parseLine(line, format, protocol));
      if (seen.has(url)) {
        duplicates++;
        return;
      }
      seen.add(url);
      let id: string;
      do {
        id = `proxy-${String(nextId++).padStart(3, '0')}`;
      } while (ids.has(id));
      ids.add(id);
      entries.push({ id, 'url-template': url, ports: '' });
    } catch (error) {
      issues.push({ line: index + 1, code: issueCode(error) });
    }
  });
  return { entries, duplicates, issues };
}
