import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => {
  const get = vi.fn(),
    put = vi.fn();
  return {
    get,
    put,
    captureConnection: () => ({ apiBase: 'fixture', managementKey: 'fixture', timeout: 1000 }),
    getAtConnection: (_connection: unknown, path: string) => get(path),
    putAtConnection: (_connection: unknown, path: string, data: unknown, options: unknown) =>
      put(path, data, options),
  };
});
vi.mock('./client', () => ({ apiClient: mocks }));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
describe('response guard capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: {} });
  });
  it('prevents new policies and test-key options being silently lost on old backends', async () => {
    for (const content of [
      'codex:\n  response-guard:\n    enabled: true\n',
      'api-key-groups:\n  - api-key: fixture\n    credential-target-response-guard: true\n',
    ]) {
      await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow('response_guard.upgrade');
    }
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('saves supported policies without changing their contents', async () => {
    mocks.get.mockResolvedValue({ features: { response_guard: true } });
    const content = 'codex:\n  response-guard:\n    enabled: true\n    lengths: []\n';
    await configFileApi.saveConfigYaml(content);
    expect(mocks.put.mock.calls[0][1]).toBe(content);
  });
});
