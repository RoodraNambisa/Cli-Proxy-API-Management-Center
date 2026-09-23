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
  it('checks passive cookies and rejects Cookie-only conflicts before writing YAML', async () => {
    await expect(configFileApi.saveConfigYaml('codex: {auto-cookie: true}')).rejects.toThrow(
      'codex_auto_cookie.upgrade'
    );
    mocks.get.mockResolvedValue({ features: { auto_cookie: true } });
    await configFileApi.saveConfigYaml('codex: {auto-cookie: true, auto-cookie-override: false}');
    expect(mocks.put).toHaveBeenCalledTimes(1);
    await expect(
      configFileApi.saveConfigYaml(
        'codex: {auto-cookie: true, state-override: {enabled: true, strategy: cookie-only}}'
      )
    ).rejects.toThrow('codex_auto_cookie.conflict');
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  it('explains the required upgrade when an older backend has no capability endpoint', async () => {
    mocks.get.mockRejectedValueOnce({ status: 404 });
    await expect(configFileApi.saveConfigYaml('codex: {auto-cookie: true}')).rejects.toThrow(
      'codex_auto_cookie.upgrade'
    );
    expect(mocks.put).not.toHaveBeenCalled();
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
  it('requires the standby capability for a positive target at every layer', async () => {
    mocks.get.mockResolvedValue({
      features: { cookie_only: true, state_seconds: true, rule_model_overrides: true },
    });
    for (const suffix of [
      '    cookie-backup-count: 2\n',
      '    rules:\n      - id: rule\n        settings:\n          cookie-backup-count: 2\n',
      '    model-overrides:\n      - model: text\n        cookie-backup-count: 2\n',
      '    rules:\n      - id: rule\n        model-overrides:\n          - id: model\n            models: [text]\n            settings:\n              cookie-backup-count: 2\n',
    ]) {
      await expect(
        configFileApi.saveConfigYaml('codex:\n  state-override:\n' + suffix)
      ).rejects.toThrow('cookie_backup_upgrade');
    }
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue({
      features: { cookie_only: true, state_seconds: true, cookie_backup_pool: true },
    });
    await configFileApi.saveConfigYaml('codex:\n  state-override:\n    cookie-backup-count: 2\n');
    expect(mocks.put).toHaveBeenCalledTimes(1);
  });
  it('requires model-rule support before saving independent sources or sharing groups', async () => {
    mocks.get.mockResolvedValue({ features: { cookie_only: true, state_seconds: true } });
    for (const value of [
      'cookie-acquisition-model: base',
      'cookie-pool-mode: auto',
      'cookie-pool-group: common',
    ]) {
      await expect(
        configFileApi.saveConfigYaml('codex:\n  state-override:\n    ' + value + '\n')
      ).rejects.toThrow('cookie_model_rules_upgrade');
    }
    mocks.get.mockResolvedValue({
      features: { cookie_only: true, state_seconds: true, cookie_model_rules: true },
    });
    await configFileApi.saveConfigYaml('codex:\n  state-override:\n    cookie-pool-mode: auto\n');
    expect(mocks.put).toHaveBeenCalledTimes(1);
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
