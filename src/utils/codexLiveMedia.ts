import { parseDocument, type Document } from 'yaml';
import type { CodexLiveMediaConfig, CodexLiveMediaVisualConfig, CodexLiveMediaValidationCode } from '@/types/codexLiveMedia';
import { readMergedYamlField, detachErrorRuleAliases } from './requestScopedErrorsYaml';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

export const codexMediaField = (value: Record<string, unknown> | undefined, name: string, alias: string) =>
  value && Object.prototype.hasOwnProperty.call(value, name) ? value[name] : value?.[alias];

export function normalizeCodexLiveMedia(value: unknown, yamlIntegers = false): CodexLiveMediaConfig {
  const source = value == null ? {} : record(value);
  if (!source) throw new Error('codex.live-media-relay must be an object');
  const boolean = (name: string, alias = name): boolean => {
    const raw = codexMediaField(source, name, alias);
    if (raw != null && typeof raw !== 'boolean') throw new Error(`codex.live-media-relay.${name} must be a boolean`);
    return raw ?? false;
  };
  const integer = (name: string, alias: string, max: number): number => {
    const raw = codexMediaField(source, name, alias);
    if (raw == null) return 0;
    if (yamlIntegers && typeof raw !== 'bigint') throw new Error(`codex.live-media-relay.${name} must be a YAML integer`);
    if ((typeof raw !== 'number' && typeof raw !== 'bigint') || !Number.isSafeInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > max)
      throw new Error(`codex.live-media-relay.${name} is outside its integer range`);
    return Number(raw);
  };
  const string = (raw: unknown, field: string): string => {
    if (raw == null) return '';
    if (typeof raw !== 'string') throw new Error(`codex.live-media-relay.${field} must be a string`);
    return raw;
  };
  const ice = codexMediaField(source, 'ice-servers', 'iceServers');
  if (ice != null && !Array.isArray(ice)) throw new Error('codex.live-media-relay.ice-servers must be an array');
  return {
    enabled: boolean('enabled'), maxSessions: integer('max-sessions', 'maxSessions', 2147483647),
    disablePrivateRemoteIps: boolean('disable-private-remote-ips', 'disablePrivateRemoteIps'),
    publicIp: string(codexMediaField(source, 'public-ip', 'publicIp'), 'public-ip'),
    udpPortMin: integer('udp-port-min', 'udpPortMin', 65535), udpPortMax: integer('udp-port-max', 'udpPortMax', 65535),
    iceServers: (ice ?? []).map((item: unknown) => {
      const server = record(item);
      if (!server || !Array.isArray(server.urls) || !server.urls.every((url) => typeof url === 'string'))
        throw new Error('codex.live-media-relay ICE urls must be an array of strings');
      return { urls: server.urls.slice(), username: string(server.username, 'username'), credential: string(server.credential, 'credential') };
    }),
  };
}

export function readCodexLiveMediaYaml(content: string): CodexLiveMediaVisualConfig {
  const doc = parseDocument(content, { intAsBigInt: true });
  const codex = record(readMergedYamlField(doc, ['codex']));
  const cfg = normalizeCodexLiveMedia(codexMediaField(codex, 'live-media-relay', 'liveMediaRelay'), true);
  return {
    ...cfg, maxSessions: String(cfg.maxSessions), udpPortMin: String(cfg.udpPortMin), udpPortMax: String(cfg.udpPortMax),
    iceServers: cfg.iceServers.map((server, index) => ({
      id: `ice-${index}`, sourceIndex: index, urls: server.urls.join('\n'), username: server.username ?? '', credential: server.credential ?? '',
    })),
  };
}

export function isCodexMediaIP(raw: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(raw))
    return raw.split('.').every((part) => String(Number(part)) === part && Number(part) <= 255);
  if (!raw.includes(':') || !/^[\da-f:.]+$/i.test(raw)) return false;
  try { return new URL(`http://[${raw}]/`).hostname.startsWith('['); } catch { return false; }
}

export function validCodexMediaICEURL(raw: string): boolean {
  const parts = /^(stun|stuns|turn|turns):(\[[^\]]+\]|[^:\s/@?#\\%]+)(?::(\d+))?(?:\?([^#]*))?$/i.exec(raw.trim());
  if (!parts) return false;
  if (parts[2].startsWith('[') && !isCodexMediaIP(parts[2].slice(1, -1))) return false;
  if (parts[3] && (Number(parts[3]) < 1 || Number(parts[3]) > 65535)) return false;
  if (!parts[4]) return true;
  if (!parts[1].toLowerCase().startsWith('turn')) return false;
  const entries = [...new URLSearchParams(parts[4]).entries()];
  return entries.length === 1 && entries[0][0] === 'transport' && ['tcp', 'udp'].includes(entries[0][1]);
}

export function codexLiveMediaErrors(value: CodexLiveMediaVisualConfig): Record<string, CodexLiveMediaValidationCode> {
  const errors: Record<string, CodexLiveMediaValidationCode> = {};
  const field = (name: string, error: CodexLiveMediaValidationCode) => { errors[`codexLiveMediaRelay.${name}`] = error; };
  const integer = (raw: string, max: number) => raw.trim() === '' || (/^\d+$/.test(raw.trim()) && Number(raw) <= max);
  if (!integer(value.maxSessions, 2147483647)) field('maxSessions', 'codex_media_capacity');
  const low = Number(value.udpPortMin), high = Number(value.udpPortMax);
  if (!integer(value.udpPortMin, 65535) || !integer(value.udpPortMax, 65535) || ((low === 0) !== (high === 0)) || low > high || (low > 0 && high - low + 1 < (Number(value.maxSessions) || 32) * 2)) {
    field('udpPortMin', 'codex_media_ports'); field('udpPortMax', 'codex_media_ports');
  }
  if (value.publicIp.trim() && !isCodexMediaIP(value.publicIp.trim())) field('publicIp', 'codex_media_ip');
  value.iceServers.forEach((server) => {
    const urls = server.urls.split('\n').map((url) => url.trim()).filter(Boolean);
    if (!urls.length || urls.some((url) => !validCodexMediaICEURL(url))) field(`iceServers.${server.id}.urls`, 'codex_media_ice_url');
    if (urls.some((url) => /^turns?:/i.test(url)) && (!server.username.trim() || !server.credential))
      field(`iceServers.${server.id}.credential`, 'codex_media_ice_credentials');
  });
  return errors;
}

export function codexLiveMediaEqual(a: CodexLiveMediaVisualConfig, b: CodexLiveMediaVisualConfig): boolean {
  const comparable = (value: CodexLiveMediaVisualConfig) => JSON.stringify(value, (key, field: unknown) => key === 'id' ? undefined : field);
  return comparable(a) === comparable(b);
}

export function writeCodexLiveMediaYaml(doc: Document, value: CodexLiveMediaVisualConfig): void {
  if (Object.keys(codexLiveMediaErrors(value)).length) throw new Error('Invalid codex.live-media-relay configuration');
  const codex = record(readMergedYamlField(doc, ['codex']));
  const original = record(codexMediaField(codex, 'live-media-relay', 'liveMediaRelay')) ?? {};
  const previousServers = codexMediaField(original, 'ice-servers', 'iceServers');
  const result: Record<string, unknown> = { ...original,
    enabled: value.enabled, 'max-sessions': Number(value.maxSessions) || 0,
    'disable-private-remote-ips': value.disablePrivateRemoteIps, 'public-ip': value.publicIp.trim(),
    'udp-port-min': Number(value.udpPortMin) || 0, 'udp-port-max': Number(value.udpPortMax) || 0,
    'ice-servers': value.iceServers.map((server) => ({
      ...(Array.isArray(previousServers) && server.sourceIndex !== undefined ? record(previousServers[server.sourceIndex]) : {}),
      urls: server.urls.split('\n').map((url) => url.trim()).filter(Boolean), username: server.username, credential: server.credential,
    })),
  };
  for (const alias of ['maxSessions', 'disablePrivateRemoteIps', 'publicIp', 'udpPortMin', 'udpPortMax', 'iceServers']) delete result[alias];
  detachErrorRuleAliases(doc, doc.getIn(['codex', 'live-media-relay'], true));
  detachErrorRuleAliases(doc, doc.getIn(['codex', 'liveMediaRelay'], true));
  doc.setIn(['codex', 'live-media-relay'], doc.createNode(result));
  doc.deleteIn(['codex', 'liveMediaRelay']);
}
