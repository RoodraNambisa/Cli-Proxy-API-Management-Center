import { apiClient } from './client';
import type { PprofConfig } from '@/types/config';
import { REQUEST_TIMEOUT_MS } from '@/utils/constants';

export const PPROF_PROFILES = [
  'profile',
  'heap',
  'allocs',
  'goroutine',
  'block',
  'mutex',
  'threadcreate',
  'trace',
] as const;

export const PPROF_FORMATS = ['top', 'svg', 'proto', 'text'] as const;

export type PprofProfileName = (typeof PPROF_PROFILES)[number];
export type PprofFormat = (typeof PPROF_FORMATS)[number];

export interface PprofRuntimeConfig extends PprofConfig {
  management: {
    profiles: PprofProfileName[];
    formats: PprofFormat[];
    goToolAvailable?: boolean;
    graphvizAvailable?: boolean;
    maxSeconds: number;
  };
}

export interface PprofProfileResult {
  blob: Blob;
  filename: string;
  contentType: string;
  profile: PprofProfileName;
  format: PprofFormat;
}

type RawHeaders = Record<string, unknown> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeProfileList = (value: unknown): PprofProfileName[] => {
  const requested = new Set(
    (Array.isArray(value) ? value : [])
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  const normalized = PPROF_PROFILES.filter((profile) => requested.has(profile));
  return normalized.length ? normalized : [...PPROF_PROFILES];
};

const normalizeFormatList = (value: unknown): PprofFormat[] => {
  const requested = new Set(
    (Array.isArray(value) ? value : [])
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  const normalized = PPROF_FORMATS.filter((format) => requested.has(format));
  return normalized.length ? normalized : [...PPROF_FORMATS];
};

const normalizeRuntimeConfig = (payload: unknown): PprofRuntimeConfig => {
  const root = isRecord(payload) ? payload : {};
  const pprof = isRecord(root.pprof) ? root.pprof : root;
  const management = isRecord(pprof.management) ? pprof.management : {};

  return {
    enable: normalizeBoolean(pprof.enable) ?? false,
    addr: typeof pprof.addr === 'string' ? pprof.addr : String(pprof.addr ?? ''),
    management: {
      profiles: normalizeProfileList(management.profiles),
      formats: normalizeFormatList(management.formats),
      goToolAvailable: normalizeBoolean(
        management['go_tool_available'] ?? management.goToolAvailable
      ),
      graphvizAvailable: normalizeBoolean(
        management['graphviz_available'] ?? management.graphvizAvailable
      ),
      maxSeconds: normalizeNumber(management['max_seconds'] ?? management.maxSeconds) ?? 120,
    },
  };
};

const readHeaderValue = (headers: RawHeaders, key: string): string | null => {
  if (!headers) return null;

  const headerGetter = (headers as { get?: (name: string) => unknown }).get;
  if (typeof headerGetter === 'function') {
    const value = headerGetter.call(headers, key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const entry = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(entry)) {
    const matched = entry.find((value) => typeof value === 'string' && value.trim());
    return typeof matched === 'string' ? matched.trim() : null;
  }
  return typeof entry === 'string' && entry.trim() ? entry.trim() : null;
};

const parseDownloadFilename = (headers: RawHeaders, fallback: string): string => {
  const disposition = readHeaderValue(headers, 'content-disposition');
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim());
      if (decoded) return decoded;
    } catch {
      // Ignore malformed RFC5987 filenames and fall back.
    }
  }

  const quotedMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]?.trim()) return quotedMatch[1].trim();

  const plainMatch = disposition.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]?.trim()) return plainMatch[1].trim();

  return fallback;
};

const getFallbackFilename = (profile: PprofProfileName, format: PprofFormat): string => {
  if (format === 'proto') return `${profile}.pb.gz`;
  if (format === 'svg') return `${profile}.svg`;
  return `${profile}-${format}.txt`;
};

export const pprofApi = {
  async getConfig(): Promise<PprofRuntimeConfig> {
    const payload = await apiClient.get('/pprof/config');
    return normalizeRuntimeConfig(payload);
  },

  updateEnable: (enabled: boolean) => apiClient.put('/pprof/enable', { value: enabled }),

  updateAddr: (addr: string) => apiClient.put('/pprof/addr', { value: addr }),

  async collectProfile(
    profile: PprofProfileName,
    format: PprofFormat,
    seconds: number
  ): Promise<PprofProfileResult> {
    const response = await apiClient.requestRaw({
      url: `/pprof/profile/${encodeURIComponent(profile)}`,
      method: 'GET',
      params: { format, seconds },
      responseType: 'blob',
      timeout: Math.max(REQUEST_TIMEOUT_MS, (Math.max(seconds, 1) + 15) * 1000),
    });
    const headers = response.headers as RawHeaders;
    const contentType = readHeaderValue(headers, 'content-type') ?? '';
    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: contentType || undefined });

    return {
      blob,
      filename: parseDownloadFilename(headers, getFallbackFilename(profile, format)),
      contentType,
      profile,
      format,
    };
  },
};
