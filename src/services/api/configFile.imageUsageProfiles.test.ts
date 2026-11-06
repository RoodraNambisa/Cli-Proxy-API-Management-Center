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
const source =
  'chatgpt-web:\n  image-usage:\n    estimation-profile: gpt-image-2.5\n    model-profiles: {gpt-image-2: gpt-image-2.6}\n';
describe('usage profile source capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: ['image_usage_profiles_v1'] });
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
      return { features: ['image_usage_profiles_v1'] };
    });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toThrow('connection_changed');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('rejects old backends and failed checks before any write', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.get.mockRejectedValue({ status: 503 });
    await expect(configFileApi.saveConfigYaml(source)).rejects.toBeTruthy();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('validates merged YAML, duplicate normalized keys and unknown aliases', async () => {
    for (const content of [
      source.replace('gpt-image-2.5', 'invalid'),
      source.replace(
        'model-profiles: {gpt-image-2: gpt-image-2.6}',
        'model-profiles: {missing: gpt-image-2.6}'
      ),
      source.replace(
        'model-profiles: {gpt-image-2: gpt-image-2.6}',
        "model-profiles: {gpt-image-2: gpt-image-2.6, ' GPT-IMAGE-2 ': gpt-image-2}"
      ),
    ]) {
      await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow();
    }
    mocks.get.mockResolvedValue({ features: [] });
    await expect(
      configFileApi.saveConfigYaml(
        'defaults: &p\n  estimation-profile: by-model\nchatgpt-web:\n  image-usage:\n    <<: *p\n'
      )
    ).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
