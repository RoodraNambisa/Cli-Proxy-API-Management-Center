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
  'images:\n  chatgpt-web:\n    gif-allow-aspect-ratio-mismatch: false\n    gif-aspect-ratio-max-error-percent: 5\n';
describe('GIF ratio capability guarded YAML save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.apiBase = 'first';
  });
  it.each([true, false])('checks capability for explicit %s in source YAML', async (value) => {
    mocks.get.mockResolvedValue({ features: [] });
    await expect(
      configFileApi.saveConfigYaml(content.replace('false', String(value)))
    ).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('checks merged YAML and tolerance-only changes on unsupported servers', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    const merged = `preset: &gif\n  gif-aspect-ratio-max-error-percent: 5\nimages:\n  chatgpt-web:\n    <<: *gif\n`;
    await expect(configFileApi.saveConfigYaml(merged)).rejects.toThrow('unsupported');
    await expect(
      configFileApi.saveConfigYaml(content.replace(': 5', ': 3'), { previousContent: content })
    ).rejects.toThrow('unsupported');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('preserves false with the same captured connection', async () => {
    mocks.get.mockResolvedValue({ features: ['gif_aspect_ratio_exception_v1'] });
    await configFileApi.saveConfigYaml(content);
    expect(mocks.put.mock.calls[0][0]).toEqual(mocks.get.mock.calls[0][0]);
    expect(mocks.put.mock.calls[0][2]).toBe(content);
  });
  it('checks deletion of an explicit setting and allows unrelated preserved YAML', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    await expect(
      configFileApi.saveConfigYaml('port: 8317\n', { previousContent: content })
    ).rejects.toThrow('unsupported');
    mocks.get.mockClear();
    await configFileApi.saveConfigYaml(content + 'port: 8318\n', {
      previousContent: content + 'port: 8317\n',
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it('prevents writes after connection changes during capability lookup', async () => {
    mocks.get.mockImplementation(async () => {
      mocks.connection.apiBase = 'second';
      return { features: ['gif_aspect_ratio_exception_v1'] };
    });
    await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow('connection_changed');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('does not write after cancellation or a failed capability read', async () => {
    mocks.get.mockRejectedValue({ status: 500 });
    await expect(configFileApi.saveConfigYaml(content)).rejects.toMatchObject({ status: 500 });
    const controller = new AbortController();
    controller.abort();
    mocks.get.mockResolvedValue({ features: ['gif_aspect_ratio_exception_v1'] });
    await expect(
      configFileApi.saveConfigYaml(content, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
