import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  connection: { apiBase: 'first', managementKey: 'test', timeout: 1000 },
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
const content =
  'images:\n  chatgpt-web:\n    model-output-formats:\n      gpt-image-2.6: [png, gif]\n';
const capability = {
  features: ['image_model_output_formats_v1'],
  image_model_output_formats: {
    supported_formats: ['png', 'jpeg', 'webp', 'gif'],
    default_formats: ['png', 'jpeg', 'webp'],
    default_overrides: {},
    default_aliases: ['gpt-image-2.6'],
    aliases: [],
  },
};
describe('alias format YAML save capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(capability);
    mocks.connection.apiBase = 'first';
  });
  it('uses a captured connection for supported source edits', async () => {
    await configFileApi.saveConfigYaml(content);
    expect(mocks.put.mock.calls[0][0]).toEqual(mocks.get.mock.calls[0][0]);
    expect(mocks.put.mock.calls[0][2]).toBe(content);
  });
  it('checks format settings inherited through YAML merges', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    const merged =
      'defaults: &web\n  model-output-formats:\n    gpt-image-2.6: [gif]\nimages:\n  chatgpt-web:\n    <<: *web\n';
    await expect(configFileApi.saveConfigYaml(merged)).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('blocks source additions and deletions against old servers but preserves unchanged settings', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow('unsupported');
    await expect(
      configFileApi.saveConfigYaml('port: 8317\n', { previousContent: content })
    ).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.get.mockClear();
    await configFileApi.saveConfigYaml(content + 'port: 8318\n', { previousContent: content });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it.each(['[]', '[svg]', '[true]'])('rejects invalid format values %s', async (raw) => {
    await expect(configFileApi.saveConfigYaml(content.replace('[png, gif]', raw))).rejects.toThrow(
      'image_output_formats'
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('prevents writing to a different connection or after cancellation', async () => {
    mocks.get.mockImplementation(async () => {
      mocks.connection.apiBase = 'second';
      return capability;
    });
    await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow('connection_changed');
    mocks.get.mockResolvedValue(capability);
    const controller = new AbortController();
    controller.abort();
    await expect(
      configFileApi.saveConfigYaml(content, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
