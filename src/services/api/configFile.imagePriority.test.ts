import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { AUTH_IMAGE_PRIORITY_CAPABILITY } from '@/utils/authModelExclusions';

const source =
  'auth-model-exclusions:\n  - priorities: [3, 5]\n    disable-image-generation: true\n    disable-image-generation-priorities: [5]\n';

describe('image priority backend compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({});
  });
  it('blocks scoped saves to old backends, including unchanged and inherited scopes', async () => {
    for (const yaml of [
      source,
      'defaults: &defaults\n  ' + source.split('\n').join('\n  ') + '\n<<: *defaults\n',
    ]) {
      await expect(configFileApi.saveConfigYaml(yaml, { previousContent: yaml })).rejects.toThrow(
        'auth_image_priority.upgrade'
      );
    }
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('keeps legacy all-matched rules compatible without a capability request', async () => {
    const legacy = source.replace('    disable-image-generation-priorities: [5]\n', '');
    await configFileApi.saveConfigYaml(legacy);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put.mock.calls[0][1]).toBe(legacy);
  });
  it('saves the exact scoped YAML once support has been confirmed', async () => {
    mocks.get.mockResolvedValue({ [AUTH_IMAGE_PRIORITY_CAPABILITY]: true });
    await configFileApi.saveConfigYaml(source);
    expect(mocks.get).toHaveBeenCalledWith('/auth-model-exclusions');
    expect(mocks.put).toHaveBeenCalledWith('/config.yaml', source);
  });
});
