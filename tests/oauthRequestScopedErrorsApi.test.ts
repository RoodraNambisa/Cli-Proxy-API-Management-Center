import { describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { configApi } from '@/services/api/config';
import { requestScopedErrorsApi } from '@/services/api/requestScopedErrors';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useConfigStore } from '@/stores/useConfigStore';

const rules = [{ status: 500, matchRegexr: ['(?i)busy'], action: 'continue' }];
const wire = [{ status: 500, 'match-regexr': ['(?i)busy'], action: 'continue' }];

describe('OAuth provider error rules', () => {
  test('CRUD preserves provider spelling, order and encoded query parameters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ 'oauth-request-scoped-errors': { ' Codex ': wire, future: [] } });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({});
    const value = await requestScopedErrorsApi.getOAuthRules();
    expect(value).toEqual({ ' Codex ': rules, future: [] });
    await requestScopedErrorsApi.saveOAuthRules(value);
    expect(put.mock.lastCall).toEqual(['/oauth-request-scoped-errors', { ' Codex ': wire, future: [] }]);
    await requestScopedErrorsApi.updateOAuthRules(' Codex ', rules);
    expect(patch.mock.lastCall).toEqual(['/oauth-request-scoped-errors', { channel: ' Codex ', rules: wire }]);
    await requestScopedErrorsApi.updateOAuthRules('codex', []);
    expect(patch.mock.lastCall?.[1]).toEqual({ channel: 'codex', rules: [] });
    await requestScopedErrorsApi.deleteOAuthRules('future&channel=x');
    expect(remove.mock.lastCall?.[0]).toBe('/oauth-request-scoped-errors?channel=future%26channel%3Dx');
    await requestScopedErrorsApi.saveOAuthRules({});
    expect(put.mock.lastCall?.[1]).toEqual({});
    get.mockResolvedValue({ 'oauth-request-scoped-errors': null });
    expect(await requestScopedErrorsApi.getOAuthRules()).toEqual({});
  });

  test('normalization honors explicit canonical null and retains legacy aliases', () => {
    expect(normalizeConfigResponse({ 'oauth-request-scoped-errors': null, oauthRequestScopedErrors: { codex: rules } }).oauthRequestScopedErrors).toBeUndefined();
    expect(normalizeConfigResponse({ oauthRequestScopedErrors: { codex: rules } }).oauthRequestScopedErrors).toEqual({ codex: rules });
    expect(normalizeConfigResponse({}).oauthRequestScopedErrors).toBeUndefined();
  });

  test('invalid updates never call the management API and server failures propagate', async () => {
    const put = vi.spyOn(apiClient, 'put').mockRejectedValue(new Error('server regex rejection'));
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});
    expect(() => requestScopedErrorsApi.saveOAuthRules({ Codex: [], codex: [] })).toThrow();
    expect(() => requestScopedErrorsApi.updateOAuthRules(' ', rules)).toThrow();
    expect(() => requestScopedErrorsApi.updateOAuthRules('codex', [{ status: 500, action: 'stop' }])).toThrow();
    expect(put).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    await expect(requestScopedErrorsApi.saveOAuthRules({ codex: rules })).rejects.toThrow('server regex rejection');
  });

  test('full and section caches expose the same rules after fetching and editing', async () => {
    const previous = useConfigStore.getState();
    const config = normalizeConfigResponse({ 'oauth-request-scoped-errors': { codex: wire } });
    const get = vi.spyOn(configApi, 'getConfig').mockResolvedValue(config);
    try {
      useConfigStore.getState().clearCache();
      expect(await useConfigStore.getState().fetchConfig('oauth-request-scoped-errors', true)).toEqual({ codex: rules });
      expect(await useConfigStore.getState().fetchConfig('oauth-request-scoped-errors')).toEqual({ codex: rules });
      expect(get).toHaveBeenCalledTimes(1);
      useConfigStore.getState().updateConfigValue('oauth-request-scoped-errors', {});
      expect(useConfigStore.getState().config?.oauthRequestScopedErrors).toEqual({});
      expect(useConfigStore.getState().isCacheValid('oauth-request-scoped-errors')).toBe(false);
      expect(useConfigStore.getState().isCacheValid()).toBe(false);
      get.mockResolvedValue(normalizeConfigResponse({ 'oauth-request-scoped-errors': {} }));
      expect(await useConfigStore.getState().fetchConfig('oauth-request-scoped-errors')).toEqual({});
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      useConfigStore.getState().clearCache();
      useConfigStore.setState(previous, true);
    }
  });
});
