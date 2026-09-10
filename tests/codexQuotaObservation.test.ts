import { describe, expect, test, vi } from 'vitest';
import { normalizeAuthFileEntry } from '@/services/api/authFiles';
import { codexObservedQuotaWindows, normalizeCodexQuotaObservation } from '@/utils/codexQuotaObservation';

const observedAt = '2026-09-10T12:00:00Z';
const observation = (signals: Record<string, string>) => normalizeCodexQuotaObservation({ observed_at: observedAt, source: 'http', signals })!;

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

  test('prefers valid absolute resets and never carries data from a previous list response', () => {
    const snapshot = observation({ 'X-Codex-Primary-Reset-At': '1789042200', 'X-Codex-Primary-Reset-After-Seconds': '3600' });
    expect(codexObservedQuotaWindows(snapshot)[0].resetAt).toBe(new Date(1789042200000).toISOString());
    expect(normalizeAuthFileEntry({ name: 'quota.json', type: 'codex' })).not.toHaveProperty('quota_observation');
    expect(normalizeAuthFileEntry({ name: 'quota.json', type: 'codex', quota_observation_enabled: 'false' as never })).not.toHaveProperty('quota_observation_enabled');
  });
});
