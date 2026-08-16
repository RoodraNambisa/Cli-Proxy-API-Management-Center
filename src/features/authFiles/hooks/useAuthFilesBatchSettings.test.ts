import { describe, expect, it } from 'vitest';
import type { AuthFileItem } from '@/types';
import { buildBatchSettingsRequests } from './useAuthFilesBatchSettings';

const authFile = (name: string, fields: Partial<AuthFileItem>): AuthFileItem => ({
  name,
  ...fields,
});

describe('buildBatchSettingsRequests', () => {
  it('sends fingerprint mode only to eligible Codex credentials', () => {
    const requests = buildBatchSettingsRequests(
      [
        authFile('oauth.json', { provider: 'codex', auth_mode: 'oauth' }),
        authFile('api-key.json', { provider: 'codex', auth_kind: 'api_key' }),
        authFile('gemini.json', { provider: 'gemini' }),
      ],
      { note: 'shared', codex_fingerprint_mode: 'session' }
    );

    expect(requests).toEqual([
      {
        names: ['oauth.json'],
        patch: { note: 'shared', codex_fingerprint_mode: 'session' },
      },
      {
        names: ['api-key.json', 'gemini.json'],
        patch: { note: 'shared' },
      },
    ]);
  });

  it('skips non-Codex credentials when only fingerprint mode changes', () => {
    const requests = buildBatchSettingsRequests(
      [
        authFile('oauth.json', { provider: 'codex', auth_mode: 'oauth' }),
        authFile('gemini.json', { provider: 'gemini' }),
      ],
      { codex_fingerprint_mode: 'full' }
    );

    expect(requests).toEqual([
      {
        names: ['oauth.json'],
        patch: { codex_fingerprint_mode: 'full' },
      },
    ]);
  });
});
