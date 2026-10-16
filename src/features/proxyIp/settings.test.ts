import { describe, it, expect } from 'vitest';
import { proxyIPDefaults, readTimeContext, validTimeContext, validProxyIP } from './settings';
import { buildAuthFileFieldsPatch } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
describe('shared IP configuration', () => {
  it('keeps only one exit detector and a large shared IP cache', () => {
    expect(proxyIPDefaults['ip-cache-size']).toBe(100000);
    expect(proxyIPDefaults['temporary-route-cache-size']).toBe(100000);
    expect(proxyIPDefaults).not.toHaveProperty('cache-ttl-seconds');
    expect(proxyIPDefaults).not.toHaveProperty('route-cache-size');
    expect(proxyIPDefaults['refresh-mode']).toBe('lazy');
    expect(proxyIPDefaults['cold-cache-mode']).toBe('fallback');
  });
  it('validates waiting and batched metadata configuration', () => {
    expect(
      validProxyIP({ ...proxyIPDefaults, 'refresh-mode': 'scheduled', 'cold-cache-mode': 'wait' })
    ).toBe(true);
    expect(validProxyIP({ ...proxyIPDefaults, 'refresh-batch-size': 100000 })).toBe(false);
    expect(validProxyIP({ ...proxyIPDefaults, 'lookup-url': 'http://example.test' })).toBe(false);
  });
  it('disables Codex by default and validates timezone policies', () => {
    expect(readTimeContext(undefined).enabled).toBe(false);
    expect(
      validTimeContext(readTimeContext({ enabled: true, mode: 'manual', timezone: 'Asia/Tokyo' }))
    ).toBe(true);
    expect(
      validTimeContext(readTimeContext({ enabled: true, mode: 'manual', timezone: 'Invalid/Zone' }))
    ).toBe(false);
    expect(
      validTimeContext(readTimeContext({ 'lookup-failure': 'fallback', 'fallback-timezone': '' }))
    ).toBe(false);
  });
  it('only patches the credential policy selected by its provider', () => {
    const original = { priority: 0, unknown: 'keep' };
    const next = { ...original, codex_time_context: { mode: 'manual', timezone: 'UTC' } };
    expect(buildAuthFileFieldsPatch(original, next, true, false, false)).toEqual({
      codex_time_context: next.codex_time_context,
    });
    expect(buildAuthFileFieldsPatch(original, next, false, true, false)).toEqual({});
    expect(buildAuthFileFieldsPatch(next, original, true, false, false)).toEqual({
      codex_time_context: null,
    });
  });
});
