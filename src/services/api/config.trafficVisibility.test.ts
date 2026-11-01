import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { configApi } from './config';
import { useConfigStore } from '@/stores/useConfigStore';

beforeEach(() => useConfigStore.getState().clearCache());
afterEach(() => { useConfigStore.getState().clearCache(); vi.restoreAllMocks(); });

describe('shared traffic visibility configuration', () => {
  it('uses structured preferences when supplied by the server', async () => {
    const get = vi.spyOn(apiClient, 'getAtConnection').mockResolvedValue({
      'management-ui': { 'api-key-traffic': false, 'credential-traffic': true },
    });
    const data = await configApi.getConfig();
    expect(data.raw?.['management-ui']).toEqual({ 'api-key-traffic': false, 'credential-traffic': true });
    expect(get.mock.calls.map(call => call[1])).toEqual(['/config']);
  });

  it('shares and caches a YAML read, and refreshes preferences after saving', async () => {
    let yaml = 'management-ui:\n  api-key-traffic: false\n  credential-traffic: true\n';
    const get = vi.spyOn(apiClient, 'getAtConnection').mockImplementation(async (_connection, path) =>
      (path === '/config' ? { debug: false } : yaml) as never);
    const [a, b] = await Promise.all([
      useConfigStore.getState().fetchConfig(),
      useConfigStore.getState().fetchConfig(),
    ]);
    expect(a).toBe(b);
    expect(a.raw?.['management-ui']).toEqual({ 'api-key-traffic': false, 'credential-traffic': true });
    await useConfigStore.getState().fetchConfig();
    expect(get.mock.calls.map(call => call[1])).toEqual(['/config', '/config.yaml']);
    yaml = 'management-ui: {api-key-traffic: true, credential-traffic: false}\n';
    const updated = await useConfigStore.getState().fetchConfig(undefined, true);
    expect(updated.raw?.['management-ui']).toEqual({ 'api-key-traffic': true, 'credential-traffic': false });
  });

  it('reads YAML merge defaults without retaining the raw configuration text', async () => {
    vi.spyOn(apiClient, 'getAtConnection').mockImplementation(async (_connection, path) =>
      (path === '/config' ? {} : 'defaults: &ui {api-key-traffic: false}\nmanagement-ui: {<<: *ui}\nsecret-material: fixture\n') as never);
    const data = await configApi.getConfig();
    expect(data.raw).toEqual({ 'management-ui': { 'api-key-traffic': false, 'credential-traffic': true } });
    expect(JSON.stringify(data)).not.toContain('fixture');
  });

  it('defaults both panels to visible when YAML omits display preferences', async () => {
    vi.spyOn(apiClient, 'getAtConnection').mockImplementation(async (_connection, path) =>
      (path === '/config' ? {} : 'port: 8317\n') as never);
    expect((await configApi.getConfig()).raw?.['management-ui']).toEqual({
      'api-key-traffic': true, 'credential-traffic': true,
    });
  });

  it.each(['<html>not a configuration</html>', 'management-ui: {api-key-traffic: invalid}', 'management-ui: [false]', 'invalid: ['])(
    'reports unreadable preferences without losing other configuration: %s', async (yaml) => {
      vi.spyOn(apiClient, 'getAtConnection').mockImplementation(async (_connection, path) =>
        (path === '/config' ? { debug: true } : yaml) as never);
      const data = await configApi.getConfig();
      expect(data.debug).toBe(true);
      expect(data.managementUIReadFailed).toBe(true);
      expect(data.raw?.['management-ui']).toBeUndefined();
    }
  );

  it('keeps both reads scoped to the original connection and ignores a signed-out result', async () => {
    const connection = { apiBase: 'http://old.invalid/v0/management', managementKey: 'fixture', timeout: 1000 };
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue(connection);
    let finish!: (value: unknown) => void;
    const get = vi.spyOn(apiClient, 'getAtConnection').mockImplementation(async (_connection, path) =>
      path === '/config' ? new Promise(resolve => { finish = resolve; }) as never
        : 'management-ui: {credential-traffic: false}\n' as never);
    const pending = useConfigStore.getState().fetchConfig();
    useConfigStore.getState().clearCache();
    finish({});
    await pending;
    expect(get.mock.calls.every(call => call[0] === connection)).toBe(true);
    expect(useConfigStore.getState().config).toBeNull();
  });
});
