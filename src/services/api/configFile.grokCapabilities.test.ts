import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  captureConnection: vi.fn(),
  getAtConnection: vi.fn(),
  put: vi.fn(),
  putAtConnection: vi.fn(),
}));
vi.mock('./client', () => ({ apiClient: api }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
describe('Grok capability declarations', () => {
  const yaml =
    'xai-api-key: [{api-key: fixture, models: [{name: grok-imagine-image-2.0, image-capabilities: {max-edit-images: 2, file-id-inputs: false, quality-values: []}}]}]';
  const connection = { apiBase: 'https://first.example', managementKey: 'fixture', timeout: 1000 };
  beforeEach(() => {
    vi.resetAllMocks();
    api.captureConnection.mockReturnValue(connection);
  });
  it('blocks an unsupported backend before saving declarations it would ignore', async () => {
    api.getAtConnection.mockRejectedValue({ status: 404 });
    await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow('grok_diagnostics.upgrade');
    expect(api.put).not.toHaveBeenCalled();
  });
  it('retains explicit denials and empty values when support is advertised', async () => {
    api.getAtConnection.mockResolvedValue({
      capabilities: { image_capability_declarations: true },
    });
    await configFileApi.saveConfigYaml(yaml);
    expect(api.putAtConnection).toHaveBeenCalledWith(
      connection,
      '/config.yaml',
      yaml,
      expect.anything()
    );
    expect(api.put).not.toHaveBeenCalled();
  });
  it('keeps the capability check and save on the original connection', async () => {
    api.getAtConnection.mockImplementation(async () => {
      api.captureConnection.mockReturnValue({ ...connection, apiBase: 'https://second.example' });
      return { capabilities: { image_capability_declarations: true } };
    });
    await configFileApi.saveConfigYaml(yaml);
    expect(api.putAtConnection).toHaveBeenCalledWith(
      connection,
      '/config.yaml',
      yaml,
      expect.anything()
    );
    expect(api.put).not.toHaveBeenCalled();
  });
  it('keeps mixed routing and Cookie capability checks on that same connection', async () => {
    api.getAtConnection.mockImplementation(async (_connection, url) => {
      api.captureConnection.mockReturnValue({ ...connection, apiBase: 'https://second.example' });
      if (url === '/auth-files/xai/options')
        return { capabilities: { image_capability_declarations: true } };
      return { features: { auto_cookie: true, credential_request_limits: true } };
    });
    const content = `${yaml}\ncodex: {auto-cookie: true}\nrouting: {priority-overrides: [{subscription-overrides: [{credentials: [fixture]}]}]}`;
    await configFileApi.saveConfigYaml(content);
    expect(api.getAtConnection).toHaveBeenCalledTimes(3);
    expect(api.getAtConnection.mock.calls.every(([snapshot]) => snapshot === connection)).toBe(
      true
    );
    expect(api.putAtConnection).toHaveBeenCalledWith(
      connection,
      '/config.yaml',
      content,
      expect.anything()
    );
    expect(api.put).not.toHaveBeenCalled();
  });
  it.each(['xai: {header-defaults: {official-build: true}}', 'xai: {request-compression: auto}'])(
    'blocks unsupported Grok features: %s',
    async (content) => {
      api.getAtConnection.mockResolvedValue({ capabilities: {} });
      await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow(
        'grok_diagnostics.upgrade'
      );
      expect(api.put).not.toHaveBeenCalled();
      expect(api.putAtConnection).not.toHaveBeenCalled();
    }
  );
});
