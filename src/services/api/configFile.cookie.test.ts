import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./client', () => ({ apiClient: mocks }));
vi.mock('./routingCredentials', () => ({ requireRoutingCredentialSupport: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { configFileApi } from './configFile';
describe('Cookie backend capability guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: {} });
  });
  it('blocks new strategies and explicit seconds on an old backend', async () => {
    for (const field of [
      'strategy: cookie-only',
      'refresh-before-seconds: 0',
      'cookie-max-age-seconds: 20',
    ]) {
      await expect(
        configFileApi.saveConfigYaml(`codex:\n  state-override:\n    ${field}\n`)
      ).rejects.toThrow('cookie_upgrade');
    }
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('keeps defaults compatible and saves after advertised support', async () => {
    await configFileApi.saveConfigYaml(
      'codex:\n  state-override:\n    strategy: state\n    cookie-max-age-seconds: 0\n'
    );
    expect(mocks.put).toHaveBeenCalledTimes(1);
    mocks.get.mockResolvedValue({ features: { cookie_only: true, state_seconds: true } });
    await configFileApi.saveConfigYaml('codex:\n  state-override:\n    strategy: cookie-only\n');
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
});
