import { describe, expect, it } from 'vitest';
import { normalizeConfigResponse } from './transformers';

describe('normalizeConfigResponse management diagnostics', () => {
  it('reads the safe and full detail-level contract', () => {
    expect(
      normalizeConfigResponse({
        'remote-management': { diagnostics: { 'detail-level': 'full' } },
      }).remoteManagement?.diagnostics?.detailLevel
    ).toBe('full');

    expect(
      normalizeConfigResponse({
        remoteManagement: { diagnostics: { detailLevel: 'safe' } },
      }).remoteManagement?.diagnostics?.detailLevel
    ).toBe('safe');
  });
});

describe('normalizeConfigResponse Codex configuration', () => {
  it('reads session identity spoofing from YAML and camel-case keys', () => {
    expect(
      normalizeConfigResponse({
        codex: {
          'identity-confuse': true,
          'spoof-session-identity': true,
          'turn-state-policy': 'same-account-only',
        },
      }).codex
    ).toEqual({
      identityConfuse: true,
      spoofSessionIdentity: true,
      turnStatePolicy: 'same-account-only',
    });

    expect(
      normalizeConfigResponse({
        codex: {
          identityConfuse: false,
          spoofSessionIdentity: true,
          turnStatePolicy: 'strip',
        },
      }).codex
    ).toEqual({
      identityConfuse: false,
      spoofSessionIdentity: true,
      turnStatePolicy: 'strip',
    });
  });

  it('falls back to the safe default for missing or invalid turn-state policies', () => {
    expect(normalizeConfigResponse({ codex: {} }).codex?.turnStatePolicy).toBe(
      'guard-cross-account'
    );
    expect(
      normalizeConfigResponse({ codex: { 'turn-state-policy': 'unknown' } }).codex?.turnStatePolicy
    ).toBe('guard-cross-account');
  });
});
