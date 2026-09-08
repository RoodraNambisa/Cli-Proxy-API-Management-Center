import { expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import type { OAuthModelAliasEntry } from '@/types';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';

const mocks = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));

test('OAuth labels and model extensions survive GET and PATCH without leaking camelCase fields', async () => {
  const wire = { name: 'upstream', alias: 'local', fork: true, 'display-name': 'Before', 'force-mapping': true, future: { keep: true } };
  const original = JSON.stringify(wire);
  vi.spyOn(apiClient, 'get').mockResolvedValue({ 'oauth-model-alias': { codex: [wire] } });
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  const loaded = await authFilesApi.getOauthModelAlias();
  expect(loaded.codex[0]).toMatchObject({ name: 'upstream', alias: 'local', displayName: 'Before' });
  await authFilesApi.saveOauthModelAlias(' CODEX ', [{ ...loaded.codex[0], displayName: '  After  ' }]);
  expect(patch.mock.lastCall?.[1]).toEqual({ channel: 'codex', aliases: [{ ...wire, 'display-name': 'After' }] });
  await authFilesApi.saveOauthModelAlias('codex', [{ ...loaded.codex[0], displayName: '', fork: false }]);
  expect(patch.mock.lastCall?.[1]).toEqual({ channel: 'codex', aliases: [{ name: 'upstream', alias: 'local', 'force-mapping': true, future: { keep: true } }] });
  expect(JSON.stringify(wire)).toBe(original);
});

test('invalid OAuth labels reject before PATCH, while canonical null inherits the catalog', async () => {
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
  for (const displayName of [false, 1, {}, []]) {
    await expect(authFilesApi.saveOauthModelAlias('codex', [{ name: 'upstream', alias: 'alias', displayName } as unknown as OAuthModelAliasEntry])).rejects.toThrow('display-name');
  }
  expect(patch).not.toHaveBeenCalled();
  vi.spyOn(apiClient, 'get').mockResolvedValue({ codex: [{ name: 'upstream', alias: 'alias', 'display-name': null, displayName: 'ignored' }] });
  expect((await authFilesApi.getOauthModelAlias()).codex).toEqual([{ name: 'upstream', alias: 'alias' }]);
});

test('mapping diagram fork and rename operations preserve labels and local mapping fields', async () => {
  const base = { name: 'upstream', alias: 'local', 'display-name': 'Label', 'force-mapping': true, future: 'keep' };
  let saved: Array<Record<string, unknown>> = [{ ...base, fork: true }];
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ 'oauth-model-alias': { codex: saved } }));
  vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
    saved = (body as { aliases: Array<Record<string, unknown>> }).aliases;
    return {};
  });
  const { result } = renderHook(() => useAuthFilesOauth({ viewMode: 'list', files: [] }));
  await act(async () => { await result.current.loadModelAlias(); });
  await act(async () => { await result.current.handleToggleFork('codex', 'upstream', 'local', false); });
  expect(saved).toEqual([base]);
  await act(async () => { await result.current.handleRenameAlias('local', 'renamed'); });
  expect(saved).toEqual([{ ...base, alias: 'renamed' }]);
  await act(async () => { await result.current.handleMappingUpdate('codex', 'new-upstream', 'new-alias'); });
  expect(saved[0]).toEqual({ ...base, alias: 'renamed' });
  expect(saved[1]).toEqual({ name: 'new-upstream', alias: 'new-alias', fork: true });
});
