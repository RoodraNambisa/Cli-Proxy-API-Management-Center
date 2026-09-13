import type { CodexObservedQuotaWindow, CodexQuotaObservation, CodexQuotaPool } from '@/types/authFile';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const signalText = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 512 || !value.trim()) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
};

const signalName = (key: string): boolean => {
  if (!/^[a-z0-9._-]{1,256}$/.test(key)) return false;
  if (key === 'retry-after' || key.startsWith('x-ratelimit-')) return true;
  if (['x-codex-plan-type', 'x-codex-active-limit', 'x-codex-credits-has-credits', 'x-codex-credits-unlimited', 'x-codex-credits-balance'].includes(key)) return true;
  return key.startsWith('x-codex-') && /-(allowed|limit-reached|limit-name|limit-id|used-percent|window-minutes|reset-after-seconds|reset-at|over-secondary-limit-percent)$/.test(key);
};

export function normalizeCodexQuotaObservation(value: unknown): CodexQuotaObservation | undefined {
  const observation = normalizeQuotaSignals(value);
  if (!observation || !isRecord(value) || !Array.isArray(value.pools)) return observation;
  const pools: CodexQuotaPool[] = [];
  const ids = new Set<string>();
  for (const raw of value.pools.slice(0, 8)) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !/^[a-z0-9._-]{1,128}$/.test(raw.id)) continue;
    const pool = normalizeQuotaSignals(raw);
    const id = normalizePoolId(raw.id);
    if (!pool || ids.has(id) || Date.parse(pool.observed_at) > Date.parse(observation.observed_at)) continue;
    pool.signals = Object.fromEntries(Object.entries(pool.signals).filter(([key]) =>
      /^x-codex-(primary|secondary)-(used-percent|window-minutes|reset-after-seconds|reset-at)$/.test(key)
    ));
    if (!Object.keys(pool.signals).length) continue;
    ids.add(id);
    pools.push({ ...pool, id, ...(signalText(raw.name) ? { name: raw.name.trim() } : {}) });
  }
  return pools.length ? { ...observation, pools } : observation;
}

function normalizeQuotaSignals(value: unknown): CodexQuotaObservation | undefined {
  if (!isRecord(value) || !isRecord(value.signals)) return undefined;
  if (value.source !== 'http' && value.source !== 'websocket') return undefined;
  if (typeof value.observed_at !== 'string' || value.observed_at.length > 128 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.observed_at) || !Number.isFinite(Date.parse(value.observed_at))) return undefined;
  const signals: Record<string, string> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value.signals)) {
    if (count >= 64) break;
    const name = key.toLowerCase();
    if (!signalName(name) || !signalText(raw) || Object.prototype.hasOwnProperty.call(signals, name)) continue;
    signals[name] = raw.trim();
    count++;
  }
  if (!count) return undefined;
  return { observed_at: value.observed_at, source: value.source, signals };
}

const quotaNumber = (raw: string | undefined, integer = false): number | null => {
  if (raw === undefined || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) return null;
  return parsed;
};

const timestamp = (milliseconds: number): string | null => {
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

// Relative resets are measured from observation time, never from rendering time.
// Missing or invalid fields remain unknown; no quota is inferred from a refusal.
export function codexObservedQuotaWindows(observation: CodexQuotaObservation): CodexObservedQuotaWindow[] {
  if (observation.pools?.length) {
    return observation.pools.flatMap((pool) => parseQuotaWindows(pool).map((window) => ({
      ...window,
      id: `${pool.id}/${window.kind}`,
      group: pool.id === 'codex' ? '' : pool.id === 'codex_code_review' ? 'code-review' : pool.id,
      name: pool.name,
      poolId: pool.id,
      observedAt: pool.observed_at,
      source: pool.source,
    }))).sort(compareQuotaWindows);
  }

  // Older servers expose only one raw snapshot. Resolve aliases by the header
  // namespace/explicit id, never by equal percentages, durations or reset times.
  const groups = new Map<string, CodexObservedQuotaWindow[]>();
  for (const window of parseQuotaWindows(observation).sort((a, b) => a.group.localeCompare(b.group))) {
    const explicit = observation.signals[`x-codex-${window.group}-limit-id`];
    const poolId = normalizePoolId(window.group ? explicit ?? `codex-${window.group}` : observation.signals['x-codex-active-limit'] ?? 'codex');
    const previous = groups.get(poolId);
    const decorated = { ...window, poolId, observedAt: observation.observed_at, source: observation.source };
    if (previous?.[0].group === window.group) previous.push(decorated);
    else groups.set(poolId, [decorated]);
  }
  return [...groups.values()].flat().sort(compareQuotaWindows);
}

const normalizePoolId = (id: string) => id.trim().toLowerCase() === 'premium' ? 'codex' : id.trim().toLowerCase().replace(/-/g, '_');

function compareQuotaWindows(a: CodexObservedQuotaWindow, b: CodexObservedQuotaWindow): number {
  const rank = (window: CodexObservedQuotaWindow) => window.poolId === 'codex' || window.group === '' ? 0 : window.group === 'code-review' ? 1 : 2;
  return rank(a) - rank(b) || a.group.localeCompare(b.group) || a.kind.localeCompare(b.kind);
}

function parseQuotaWindows(observation: CodexQuotaObservation): CodexObservedQuotaWindow[] {
  const { signals } = observation;
  const windows = new Map<string, CodexObservedQuotaWindow>();
  for (const key of Object.keys(signals)) {
    const match = /^x-codex-(.*?)(primary|secondary)-(?:used-percent|window-minutes|reset-after-seconds|reset-at)$/.exec(key);
    if (!match) continue;
    const [, prefix, kind] = match;
    const id = prefix + kind;
    if (windows.has(id)) continue;
    const start = `x-codex-${id}-`;
    const used = quotaNumber(signals[`${start}used-percent`]);
    const minutes = quotaNumber(signals[`${start}window-minutes`], true);
    const absolute = quotaNumber(signals[`${start}reset-at`], true);
    const relative = quotaNumber(signals[`${start}reset-after-seconds`], true);
    // Upstream can advertise an unused slot with three explicit zero values.
    // Missing fields remain partial observations; a valid absolute reset is meaningful.
    if (
      used === 0 && minutes === 0 && relative === 0 &&
      (signals[`${start}reset-at`] === undefined || absolute === 0)
    ) continue;
    const absoluteReset = absolute !== null && absolute > 0 ? timestamp(absolute * 1000) : null;
    const relativeReset = relative !== null ? timestamp(Date.parse(observation.observed_at) + relative * 1000) : null;
    windows.set(id, {
      id,
      group: prefix.replace(/-$/, ''),
      // Unprefixed windows describe this response's active pool, which may change
      // between requests. They are not necessarily the account's premium quota.
      name: prefix ? signals[`x-codex-${prefix}limit-name`] : signals['x-codex-active-limit'],
      kind: kind as 'primary' | 'secondary',
      usedPercent: used !== null && used <= 100 ? used : null,
      minutes: minutes !== null && minutes > 0 ? minutes : null,
      resetAt: absoluteReset ?? relativeReset,
    });
  }
  return [...windows.values()];
}
