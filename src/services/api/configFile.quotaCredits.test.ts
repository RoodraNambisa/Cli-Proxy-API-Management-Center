import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./client', () => ({ apiClient: api }));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';

describe('quota credit capability guard', () => {
  const yaml =
    'codex: {quota-auto-disable: {enabled: true, rules: [{weekly-remaining-percent: 3, credits: {enabled: true, minimum-balance: 1000}}]}}';
  beforeEach(() => vi.resetAllMocks());
  it('blocks older backends before saving a credit exemption they would ignore', async () => {
    api.get.mockResolvedValue({ features: {} });
    await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow('credits_upgrade');
    api.get.mockRejectedValueOnce({ status: 404 });
    await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow('credits_upgrade');
    expect(api.put).not.toHaveBeenCalled();
  });
  it('saves after advertised support and keeps disabled credit rules compatible', async () => {
    api.get.mockResolvedValue({ features: { quota_auto_disable_credits: true } });
    await configFileApi.saveConfigYaml(yaml);
    expect(api.put).toHaveBeenCalledWith('/config.yaml', yaml, expect.anything());
    api.get.mockClear();
    await configFileApi.saveConfigYaml(
      yaml.replace('credits: {enabled: true', 'credits: {enabled: false')
    );
    expect(api.get).not.toHaveBeenCalled();
  });
});
