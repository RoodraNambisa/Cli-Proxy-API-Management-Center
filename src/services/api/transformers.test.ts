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
          'enforce-software-identity': false,
        },
      }).codex
    ).toEqual({
      identityConfuse: true,
      spoofSessionIdentity: true,
      turnStatePolicy: 'same-account-only',
      enforceSoftwareIdentity: false,
    });

    expect(
      normalizeConfigResponse({
        codex: {
          identityConfuse: false,
          spoofSessionIdentity: true,
          turnStatePolicy: 'strip',
          enforceSoftwareIdentity: true,
        },
      }).codex
    ).toEqual({
      identityConfuse: false,
      spoofSessionIdentity: true,
      turnStatePolicy: 'strip',
      enforceSoftwareIdentity: true,
    });
  });

  it('falls back to the safe default for missing or invalid turn-state policies', () => {
    expect(normalizeConfigResponse({ codex: {} }).codex?.turnStatePolicy).toBe(
      'guard-cross-account'
    );
    expect(
      normalizeConfigResponse({ codex: { 'turn-state-policy': 'unknown' } }).codex?.turnStatePolicy
    ).toBe('guard-cross-account');
    expect(normalizeConfigResponse({ codex: {} }).codex?.enforceSoftwareIdentity).toBe(true);
  });

  it('normalizes the Codex session identity pool size', () => {
    expect(
      normalizeConfigResponse({
        'codex-fingerprint': { 'session-identity-pool-size': 4 },
      }).codexFingerprint?.sessionIdentityPoolSize
    ).toBe(4);
    expect(
      normalizeConfigResponse({
        codexFingerprint: { sessionIdentityPoolSize: '8' },
      }).codexFingerprint?.sessionIdentityPoolSize
    ).toBe(8);
    expect(
      normalizeConfigResponse({
        'codex-fingerprint': { 'session-identity-pool-size': 0 },
      }).codexFingerprint?.sessionIdentityPoolSize
    ).toBe(1);
  });
});

describe('normalizeConfigResponse ChatGPT Web image configuration', () => {
  it('normalizes poll stall breaker settings from YAML and camel-case keys', () => {
    expect(
      normalizeConfigResponse({
        images: {
          'chatgpt-web': {
            'sanitize-error-responses': true,
            'normalize-mismatched-image-mime': true,
            'normalize-remote-image-mime': false,
            'poll-stall-breaker-enabled': false,
            'poll-stall-seconds': 300,
          },
        },
      }).images?.chatgptWeb
    ).toEqual({
      sanitizeErrorResponses: true,
      normalizeMismatchedImageMime: true,
      normalizeRemoteImageMime: false,
      pollStallBreakerEnabled: false,
      pollStallSeconds: 300,
    });

    expect(
      normalizeConfigResponse({
        images: {
          chatgptWeb: {
            sanitizeErrorResponses: false,
            normalizeMismatchedImageMime: false,
            normalizeRemoteImageMime: true,
            pollStallBreakerEnabled: true,
            pollStallSeconds: '120',
          },
        },
      }).images?.chatgptWeb
    ).toEqual({
      sanitizeErrorResponses: false,
      normalizeMismatchedImageMime: false,
      normalizeRemoteImageMime: true,
      pollStallBreakerEnabled: true,
      pollStallSeconds: 120,
    });
  });
});
