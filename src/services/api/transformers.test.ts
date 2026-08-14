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
