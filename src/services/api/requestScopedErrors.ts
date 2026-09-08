import { apiClient } from './client';
import type { OAuthRequestScopedErrors, RequestScopedErrorRule } from '@/types/requestScopedErrors';
import {
  normalizeOAuthRequestScopedErrors,
  serializeOAuthRequestScopedErrors,
  serializeRequestScopedErrors,
} from '@/utils/requestScopedErrors';

const path = '/oauth-request-scoped-errors';

const validateChannel = (channel: string) => {
  if (!channel.trim()) throw new Error('OAuth error rules require a provider');
  return channel;
};

export const requestScopedErrorsApi = {
  async getOAuthRules(): Promise<OAuthRequestScopedErrors> {
    const response = await apiClient.get<Record<string, unknown>>(path);
    const value = Object.prototype.hasOwnProperty.call(response, 'oauth-request-scoped-errors')
      ? response['oauth-request-scoped-errors']
      : response;
    return normalizeOAuthRequestScopedErrors(value) ?? {};
  },

  saveOAuthRules: (rules: OAuthRequestScopedErrors) =>
    apiClient.put(path, serializeOAuthRequestScopedErrors(rules) ?? {}),

  updateOAuthRules: (channel: string, rules: RequestScopedErrorRule[]) =>
    apiClient.patch(path, { channel: validateChannel(channel), rules: serializeRequestScopedErrors(rules) ?? [] }),

  deleteOAuthRules: (channel: string) =>
    apiClient.delete(`${path}?${new URLSearchParams({ channel: validateChannel(channel) })}`),
};
