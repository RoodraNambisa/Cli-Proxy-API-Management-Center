import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  captureConnection: vi.fn(),
  getAtConnection: vi.fn(),
  put: vi.fn(),
}));
vi.mock('./client', () => ({ apiClient: api }));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
describe('Grok capability declarations', () => {
  const yaml =
    'xai-api-key: [{api-key: fixture, models: [{name: grok-imagine-image-2.0, image-capabilities: {max-edit-images: 2, file-id-inputs: false, quality-values: []}}]}]';
  beforeEach(() => vi.resetAllMocks());
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
    expect(api.put).toHaveBeenCalledWith('/config.yaml', yaml, expect.anything());
  });
});
