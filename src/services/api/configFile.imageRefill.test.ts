import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  connection: { apiBase: 'one', managementKey: 'test', timeout: 1000 },
}));
vi.mock('./client', () => ({
  apiClient: {
    captureConnection: () => ({ ...mocks.connection }),
    getAtConnection: mocks.get,
    putAtConnection: mocks.put,
    put: mocks.put,
  },
}));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
const source = 'images:\n  chatgpt-web:\n    n-aggregation-max-retries: 1\n';
describe('image refill source capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: ['image_n_refill_delivery_v1'] });
    mocks.connection.apiBase = 'one';
  });
  it('pins the save to the checked connection', async () => {
    await configFileApi.saveConfigYaml(source);
    expect(mocks.put.mock.calls[0][0]).toEqual(mocks.get.mock.calls[0][0]);
    expect(mocks.put.mock.calls[0][2]).toBe(source);
  });
  it('aborts a save if the connection changes during capability checks', async () => {
    mocks.get.mockImplementation(async () => {
      mocks.connection.apiBase = 'two';
      return { features: ['image_n_refill_delivery_v1'] };
    });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toThrow('connection_changed');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('rejects old backends and failed checks before any write', async () => {
    mocks.get.mockResolvedValue({ features: ['image_n_parallel_v2'] });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.get.mockRejectedValue({ status: 503 });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toBeTruthy();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('validates invalid and merged YAML before writing', async () => {
    for (const value of ['-1', '4', '1.5', 'true', 'null', '"3"']) {
      await expect(
        configFileApi.saveConfigYaml(source.replace(': 1', ': ' + value))
      ).rejects.toThrow();
    }
    mocks.get.mockResolvedValue({ features: [] });
    await expect(
      configFileApi.saveConfigYaml(
        'defaults: &p\n  n-aggregation-max-retries: 3\nimages:\n  chatgpt-web:\n    <<: *p\n'
      )
    ).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
