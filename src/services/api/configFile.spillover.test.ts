import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  captureConnection: () => ({ apiBase: 'fixture', managementKey: 'fixture', timeout: 1000 }),
}));
vi.mock('./client', () => ({
  apiClient: {
    ...mocks,
    getAtConnection: (_: unknown, path: string) => mocks.get(path),
    putAtConnection: (_: unknown, path: string, data: unknown) => mocks.put(path, data),
  },
}));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({});
});
it('requires support for explicit global or priority spillover values', async () => {
  for (const yaml of [
    'routing:\n  session-affinity-capacity-spillover: true\n',
    'routing:\n  priority-overrides:\n    - priority: 5\n      session-affinity-capacity-spillover: false\n',
  ]) {
    await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow();
    expect(mocks.put).not.toHaveBeenCalled();
  }
});
it('saves exact YAML on a supporting backend and keeps legacy configurations compatible', async () => {
  mocks.get.mockResolvedValue({ 'session-affinity-capacity-spillover-supported': true });
  const yaml = 'routing:\n  session-affinity-capacity-spillover: false # explicit\n';
  await configFileApi.saveConfigYaml(yaml);
  expect(mocks.put).toHaveBeenCalledWith('/config.yaml', yaml);
  vi.clearAllMocks();
  await configFileApi.saveConfigYaml('routing: {strategy: fill-first}\n');
  expect(mocks.get).not.toHaveBeenCalled();
});
