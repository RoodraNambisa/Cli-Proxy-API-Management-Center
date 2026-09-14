import { describe, expect, test, vi } from 'vitest';
import { normalizeAuthFileEntry } from '@/services/api/authFiles';
import { codexObservedQuotaWindows, normalizeCodexQuotaObservation } from '@/utils/codexQuotaObservation';
import reserveObservation from './fixtures/codexQuotaReserve.json';

const observedAt = '2026-09-10T12:00:00Z';
const observation = (signals: Record<string, string>) => normalizeCodexQuotaObservation({ observed_at: observedAt, source: 'http', signals })!;

describe('Optional Codex reserve quota', () => {
  test('reads all three observed pools and skips both empty secondary windows', () => {
    const snapshot = normalizeCodexQuotaObservation(reserveObservation)!;
    expect(snapshot.signals['x-base-model-inference-limit-name']).toBe('gpt-reserve');
    const windows = codexObservedQuotaWindows(snapshot);
    expect(windows).toHaveLength(4);
    expect(windows.find((window) => window.poolId === 'codex')).toMatchObject({ usedPercent: 13, minutes: 10080 });
    expect(windows.filter((window) => window.poolId === 'codex_bengalfox')).toMatchObject([
      { name: 'GPT-5.3-Codex-Spark', usedPercent: 0, minutes: 300 },
      { name: 'GPT-5.3-Codex-Spark', usedPercent: 0, minutes: 10080 },
    ]);
    expect(windows.find((window) => window.poolId === 'base_model_inference')).toMatchObject({
      name: 'gpt-reserve', usedPercent: 0, minutes: 10080,
      resetAt: new Date(1790005638000).toISOString(),
    });
    expect(windows.every((window) => window.minutes !== null)).toBe(true);
  });

  test.each([false, true])('does not invent a reserve balance for other accounts (name only: %s)', (nameOnly) => {
    const signals: Record<string, string> = Object.fromEntries(Object.entries(reserveObservation.signals).filter(([key]) => !key.startsWith('x-base-model-inference-')));
    if (nameOnly) signals['x-base-model-inference-limit-name'] = 'gpt-reserve';
    const windows = codexObservedQuotaWindows(observation(signals));
    expect(windows).toHaveLength(3);
    expect(windows.some((window) => window.poolId === 'base_model_inference' || window.name === 'gpt-reserve')).toBe(false);
  });

  test('deduplicates a reserve active alias and keeps the explicit family authoritative', () => {
    const windows = codexObservedQuotaWindows(observation({
      ...reserveObservation.signals,
      'x-codex-active-limit': 'base_model_inference',
      'x-codex-primary-used-percent': '9',
    }));
    expect(windows).toHaveLength(3);
    expect(windows.filter((window) => window.poolId === 'base_model_inference')).toMatchObject([
      { name: 'gpt-reserve', usedPercent: 0, minutes: 10080 },
    ]);
    expect(windows.some((window) => window.poolId === 'codex')).toBe(false);
  });

  test('keeps retained reserve data at its own observation time', () => {
    const snapshot = normalizeCodexQuotaObservation({
      ...reserveObservation,
      observed_at: '2026-09-14T15:48:18Z',
      signals: { 'x-codex-active-limit': 'premium' },
      pools: [{
        id: 'base_model_inference', name: 'gpt-reserve', source: 'http',
        observed_at: reserveObservation.observed_at,
        signals: { 'x-codex-primary-used-percent': '0', 'x-codex-primary-window-minutes': '10080', 'x-codex-primary-reset-after-seconds': '604800' },
      }],
    })!;
    expect(codexObservedQuotaWindows(snapshot)).toMatchObject([{
      poolId: 'base_model_inference', name: 'gpt-reserve', usedPercent: 0, minutes: 10080,
      observedAt: reserveObservation.observed_at, resetAt: '2026-09-21T15:47:18.000Z',
    }]);
  });
});

describe('Passive Codex quota data', () => {
  test('normalizes management data, preserves zero/false, and filters private or malformed signals', () => {
    const raw = { observed_at: observedAt, source: 'websocket', signals: { 'X-Codex-Primary-Used-Percent': '0', 'X-Codex-Credits-Has-Credits': 'false', Authorization: 'fixture-private', 'Set-Cookie': 'fixture-private', 'X-Codex-Private-Token': 'fixture-private', 'X-Codex-Plan-Type': 'bad\nvalue', 'X-Codex-Credits-Balance': 10 } };
    const file = normalizeAuthFileEntry({ name: 'quota.json', type: 'codex', quota_observation_enabled: false, quota_observation: raw as never });
    expect(file.quota_observation_enabled).toBe(false);
    expect(file.quota_observation).toEqual({ observed_at: observedAt, source: 'websocket', signals: { 'x-codex-primary-used-percent': '0', 'x-codex-credits-has-credits': 'false' } });
    raw.signals['X-Codex-Primary-Used-Percent'] = '99';
    expect(file.quota_observation?.signals['x-codex-primary-used-percent']).toBe('0');
  });

  test.each([null, [], {}, { observed_at: 'bad', source: 'http', signals: { 'Retry-After': '1' } }, { observed_at: observedAt, source: 'other', signals: { 'Retry-After': '1' } }, { observed_at: observedAt, source: 'http', signals: {} }])('ignores invalid snapshots %j', (raw) => {
    expect(normalizeCodexQuotaObservation(raw)).toBeUndefined();
  });

  test('bounds signal count and length', () => {
    const signals = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`X-Ratelimit-Fixture-${index}`, '1']));
    expect(Object.keys(observation(signals).signals)).toHaveLength(64);
    expect(normalizeCodexQuotaObservation({ observed_at: observedAt, source: 'http', signals: { 'Retry-After': '1'.repeat(513) } })).toBeUndefined();
    expect(normalizeCodexQuotaObservation({ observed_at: '0', source: 'http', signals: { 'Retry-After': '1' } })).toBeUndefined();
  });

  test('keeps partial quota unknown and anchors reset-after to observation time', () => {
    const snapshot = observation({ 'X-Codex-Primary-Used-Percent': '0', 'X-Codex-Primary-Reset-After-Seconds': '0', 'X-Codex-Secondary-Window-Minutes': '10080', 'X-Codex-Secondary-Reset-After-Seconds': '3600', 'X-Codex-Limit-Reached': 'true' });
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-01T00:00:00Z'));
    try {
      expect(codexObservedQuotaWindows(snapshot)).toMatchObject([
        { id: 'primary', usedPercent: 0, minutes: null, resetAt: '2026-09-10T12:00:00.000Z' },
        { id: 'secondary', usedPercent: null, minutes: 10080, resetAt: '2026-09-10T13:00:00.000Z' },
      ]);
    } finally { now.mockRestore(); }
  });

  test('rejects numeric overflow and separates additional and code-review windows', () => {
    const snapshot = observation({ 'X-Codex-Additional-GPT-5-Primary-Used-Percent': '25', 'X-Codex-Additional-GPT-5-Limit-Name': 'GPT-5', 'X-Codex-Code-Review-Primary-Used-Percent': '101', 'X-Codex-Code-Review-Primary-Reset-At': '9999999999999999999999', 'X-Codex-Code-Review-Primary-Window-Minutes': '1.5', 'X-Codex-Primary-Used-Percent': '-1', 'X-Codex-Primary-Reset-After-Seconds': 'NaN' });
    expect(codexObservedQuotaWindows(snapshot)).toMatchObject([
      { id: 'primary', usedPercent: null, resetAt: null },
      { group: 'code-review', usedPercent: null, minutes: null, resetAt: null },
      { group: 'additional-gpt-5', name: 'GPT-5', usedPercent: 25 },
    ]);
  });

  test('scopes the main windows to the active pool without renaming other quota groups', () => {
    const signals = {
      'X-Codex-Active-Limit': 'codex_bengalfox',
      'X-Codex-Primary-Used-Percent': '0',
      'X-Codex-Primary-Window-Minutes': '300',
      'X-Codex-Secondary-Used-Percent': '2',
      'X-Codex-Secondary-Window-Minutes': '10080',
      'X-Codex-Additional-Spark-Limit-Name': 'GPT-5.3-Codex-Spark',
      'X-Codex-Additional-Spark-Secondary-Used-Percent': '2',
      'X-Codex-Code-Review-Primary-Used-Percent': '10',
    };
    expect(codexObservedQuotaWindows(observation(signals))).toMatchObject([
      { id: 'primary', name: 'codex_bengalfox', usedPercent: 0 },
      { id: 'secondary', name: 'codex_bengalfox', usedPercent: 2 },
      { id: 'code-review-primary', name: undefined, usedPercent: 10 },
      { id: 'additional-spark-secondary', name: 'GPT-5.3-Codex-Spark', usedPercent: 2 },
    ]);

    const next = observation({
      'X-Codex-Active-Limit': 'premium',
      'X-Codex-Primary-Used-Percent': '35',
      'X-Codex-Primary-Window-Minutes': '10080',
    });
    expect(codexObservedQuotaWindows(next)).toMatchObject([
      { id: 'primary', name: 'premium', usedPercent: 35, minutes: 10080 },
    ]);
    expect(codexObservedQuotaWindows(observation({ 'X-Codex-Primary-Used-Percent': '35' }))[0].name).toBeUndefined();
  });

  test('prefers valid absolute resets and never carries data from a previous list response', () => {
    const snapshot = observation({ 'X-Codex-Primary-Reset-At': '1789042200', 'X-Codex-Primary-Reset-After-Seconds': '3600' });
    expect(codexObservedQuotaWindows(snapshot)[0].resetAt).toBe(new Date(1789042200000).toISOString());
    expect(normalizeAuthFileEntry({ name: 'quota.json', type: 'codex' })).not.toHaveProperty('quota_observation');
    expect(normalizeAuthFileEntry({ name: 'quota.json', type: 'codex', quota_observation_enabled: 'false' as never })).not.toHaveProperty('quota_observation_enabled');
  });

  test('deduplicates the active Spark alias using its native header family on older servers', () => {
    const snapshot = observation({
      'X-Codex-Active-Limit': 'codex_bengalfox',
      'X-Codex-Primary-Used-Percent': '0', 'X-Codex-Primary-Window-Minutes': '300',
      'X-Codex-Secondary-Used-Percent': '2', 'X-Codex-Secondary-Window-Minutes': '10080',
      'X-Codex-Bengalfox-Limit-Name': 'GPT-5.3-Codex-Spark',
      'X-Codex-Bengalfox-Primary-Used-Percent': '0', 'X-Codex-Bengalfox-Primary-Window-Minutes': '300',
      'X-Codex-Bengalfox-Secondary-Used-Percent': '2', 'X-Codex-Bengalfox-Secondary-Window-Minutes': '10080',
      'X-Codex-Other-Primary-Used-Percent': '0', 'X-Codex-Other-Primary-Window-Minutes': '300',
    });
    const windows = codexObservedQuotaWindows(snapshot);
    expect(windows).toHaveLength(3);
    expect(windows.filter((window) => window.poolId === 'codex_bengalfox')).toMatchObject([
      { name: 'GPT-5.3-Codex-Spark', usedPercent: 0, minutes: 300 },
      { name: 'GPT-5.3-Codex-Spark', usedPercent: 2, minutes: 10080 },
    ]);
    expect(windows.some((window) => window.poolId === 'codex_other')).toBe(true);
    expect(windows.some((window) => window.poolId === 'codex')).toBe(false);
  });

  test('keeps each retained pool timestamp and reset clock independently scoped', () => {
    const oldAt = '2026-09-10T11:00:00Z';
    const snapshot = normalizeCodexQuotaObservation({
      observed_at: observedAt, source: 'http', signals: { 'X-Codex-Active-Limit': 'codex_bengalfox' },
      pools: [
        { id: 'codex', observed_at: oldAt, source: 'http', signals: { 'X-Codex-Primary-Used-Percent': '50', 'X-Codex-Primary-Window-Minutes': '10080', 'X-Codex-Primary-Reset-After-Seconds': '7200' } },
        { id: 'codex_bengalfox', name: 'GPT-5.3-Codex-Spark', observed_at: observedAt, source: 'websocket', signals: { 'X-Codex-Secondary-Used-Percent': '2', 'X-Codex-Secondary-Window-Minutes': '10080', 'X-Codex-Secondary-Reset-After-Seconds': '7200' } },
      ],
    })!;
    expect(codexObservedQuotaWindows(snapshot)).toMatchObject([
      { poolId: 'codex', group: '', usedPercent: 50, observedAt: oldAt, resetAt: '2026-09-10T13:00:00.000Z' },
      { poolId: 'codex_bengalfox', name: 'GPT-5.3-Codex-Spark', usedPercent: 2, observedAt, resetAt: '2026-09-10T14:00:00.000Z' },
    ]);
  });

  test('bounds and validates retained pools without trusting nested or private data', () => {
    const valid = { id: 'codex', observed_at: observedAt, source: 'http', signals: { 'X-Codex-Primary-Used-Percent': '0', 'X-Codex-Bengalfox-Primary-Used-Percent': '99', Authorization: 'private' } };
    const snapshot = normalizeCodexQuotaObservation({
      ...valid,
      pools: [valid, { ...valid, id: 'codex', name: 'duplicate' }, { ...valid, id: 'bad/id' }, { ...valid, id: 'future', observed_at: '2027-01-01T00:00:00Z' }, { ...valid, id: 'other', pools: [valid] }],
    })!;
    expect(snapshot.pools?.map((pool) => pool.id)).toEqual(['codex', 'other']);
    expect(JSON.stringify(snapshot)).not.toMatch(/private|Authorization|duplicate|future/);
    expect(snapshot.pools?.[1]).not.toHaveProperty('pools');
    expect(snapshot.pools?.[0].signals).toEqual({ 'x-codex-primary-used-percent': '0' });
    const bounded = normalizeCodexQuotaObservation({ ...valid, pools: Array.from({ length: 12 }, (_, i) => ({ ...valid, id: `pool_${i}` })) })!;
    expect(bounded.pools).toHaveLength(8);
  });
});
