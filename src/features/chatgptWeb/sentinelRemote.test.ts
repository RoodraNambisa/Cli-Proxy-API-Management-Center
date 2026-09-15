import { describe, expect, it } from 'vitest';
import {
  normalizeSentinelRemote,
  validSentinelRemote,
  validSentinelAccessPath,
  sentinelEndpointURL,
} from './sentinelRemote';
import { normalizeConfigResponse } from '@/services/api/transformers';

describe('Sentinel remote configuration', () => {
  it('keeps custom paths intact and supports default endpoints', () => {
    expect(sentinelEndpointURL('https://proxy.test/', '/afhkajf/Sentinel')).toBe(
      'https://proxy.test/afhkajf/Sentinel'
    );
    expect(sentinelEndpointURL('http://127.0.0.1:8317')).toBe('http://127.0.0.1:8317/v1/sentinel');
    expect(validSentinelAccessPath('/afhkajf/Sentinel')).toBe(true);
    expect(validSentinelAccessPath('')).toBe(true);
    for (const path of ['/', '/a//b', '/a/../b', '/a/%2f', '/a?key=b', '/a#fragment'])
      expect(validSentinelAccessPath(path)).toBe(false);
    expect(
      validSentinelRemote('remote', {
        nodes: [{ name: 'custom', url: 'https://proxy.test/afhkajf/Sentinel', 'api-key': 'key' }],
      })
    ).toBe(true);
  });
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
