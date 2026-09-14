import { describe, expect, it } from 'vitest';
import { normalizeSentinelRemote, validSentinelRemote } from './sentinelRemote';
import { normalizeConfigResponse } from '@/services/api/transformers';

describe('Sentinel remote configuration', () => {
  it('defaults to images without treating an explicit empty list as omitted', () => {
    expect(normalizeSentinelRemote().scopes).toEqual(['images']);
    expect(normalizeSentinelRemote({ scopes: [] }).scopes).toEqual([]);
    expect(validSentinelRemote('remote', { scopes: [] })).toBe(true);
    expect(validSentinelRemote('remote', {})).toBe(false);
  });
  it('validates integer budgets and distinct node names', () => {
    const node = { name: 'a', url: 'https://solver.example.com', 'api-key': 'secret' };
    expect(validSentinelRemote('remote', { nodes: [node] })).toBe(true);
    expect(validSentinelRemote('remote', { nodes: [node, node] })).toBe(false);
    for (const budget of [0, -1, 1.5, NaN, 3601])
      expect(validSentinelRemote('remote', { nodes: [node], 'budget-seconds': budget })).toBe(
        false
      );
    expect(
      validSentinelRemote('remote', {
        nodes: [{ ...node, url: 'https://user:password@example.com' }],
      })
    ).toBe(false);
  });
  it('retains the solver role and service config from the management API', () => {
    const service = { enabled: true, 'api-keys': ['key'], 'sdk-fallback-enabled': false };
    const config = normalizeConfigResponse({
      'runtime-role': 'sentinel-solver',
      'sentinel-solver': service,
    });
    expect(config.runtimeRole).toBe('sentinel-solver');
    expect(config.sentinelSolver).toEqual(service);
    expect(normalizeConfigResponse({}).runtimeRole).toBeUndefined();
  });
});
