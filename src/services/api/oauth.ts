/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider = 'codex' | 'anthropic' | 'antigravity' | 'kimi' | 'xai';

export interface OAuthStartResponse {
  status?: 'ok';
  url: string;
  state?: string;
  flow?: 'device' | string;
  user_code?: string;
  expires_in?: number;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface OAuthCancelResponse {
  status: 'ok';
  cancelled: boolean;
}

const WEBUI_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity'];

export const oauthApi = {
  startAuth: (provider: OAuthProvider) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined,
    });
  },

  getAuthStatus: (state: string) =>
    apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state },
    }),

  cancelAuth: (state: string) =>
    apiClient.delete<OAuthCancelResponse>('/oauth-session', {
      params: { state },
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider,
      redirect_url: redirectUrl,
    });
  },
};
