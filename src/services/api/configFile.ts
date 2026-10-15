import { autoCookieConflict } from '@/utils/codexAutoCookie';
import { readCodexState } from '@/utils/codexStateOverride';
import { STATE_STRATEGY_KEYS } from '@/utils/codexStateStrategy';
/**
 * Configuration file API (/config.yaml).
 */

import { apiClient } from './client';
import { requireRoutingCredentialSupport } from './routingCredentials';
import { parseDocument } from 'yaml';
import i18n from '@/i18n';

export const configFileApi = {
  async fetchConfigYaml(): Promise<string> {
    const response = await apiClient.getRaw('/config.yaml', {
      responseType: 'text',
      headers: { Accept: 'application/yaml, text/yaml, text/plain' },
    });
    const data: unknown = response.data;
    if (typeof data === 'string') return data;
    if (data === undefined || data === null) return '';
    return String(data);
  },

  async saveConfigYaml(content: string): Promise<void> {
    const root = parseDocument(content).toJS();
    const imageDeclarations =
      Array.isArray(root?.['xai-api-key']) &&
      root['xai-api-key'].some(
        (key: { models?: Array<Record<string, unknown>> }) =>
          Array.isArray(key?.models) &&
          key.models.some((model) => model?.['image-capabilities'] !== undefined)
      );
    const officialBuild = root?.xai?.['header-defaults']?.['official-build'] === true;
    const compression = root?.xai?.['request-compression'] === 'auto';
    const needsGrok = imageDeclarations || officialBuild || compression;
    const needsGuard =
      root?.codex?.['response-guard'] !== undefined ||
      root?.['api-key-groups']?.some?.(
        (g: Record<string, unknown>) => g?.['credential-target-response-guard'] === true
      );
    const connection = needsGrok || needsGuard ? apiClient.captureConnection() : undefined;
    if (needsGrok) {
      let supported = false;
      try {
        const options = await apiClient.getAtConnection<{
          capabilities?: {
            image_capability_declarations?: boolean;
            official_build_headers?: boolean;
            request_compression_diagnostics?: boolean;
          };
        }>(connection!, '/auth-files/xai/options');
        supported =
          (!imageDeclarations || options.capabilities?.image_capability_declarations === true) &&
          (!officialBuild || options.capabilities?.official_build_headers === true) &&
          (!compression || options.capabilities?.request_compression_diagnostics === true);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status !== 404 && status !== 405) throw error;
      }
      if (!supported) throw new Error(i18n.t('grok_diagnostics.upgrade'));
    }
    if (connection)
      await requireRoutingCredentialSupport(root?.routing?.['priority-overrides'], connection);
    else await requireRoutingCredentialSupport(root?.routing?.['priority-overrides']);
    if (needsGuard) {
      let supported = false;
      try {
        const options = await apiClient.getAtConnection<{
          features?: { response_guard?: boolean };
        }>(connection!, '/auth-files/codex/response-guard/options');
        supported = options.features?.response_guard === true;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status !== 404 && status !== 405) throw error;
      }
      if (!supported) throw new Error(i18n.t('response_guard.upgrade'));
    }
    const state = root?.codex?.['state-override'];
    const autoCookie = root?.codex?.['auto-cookie'] === true;
    const quotaCredits =
      root?.codex?.['quota-auto-disable']?.rules?.some?.(
        (rule: { credits?: { enabled?: boolean } }) => rule?.credits?.enabled === true
      ) === true;
    const conflict = autoCookie && autoCookieConflict(readCodexState(state));
    if (conflict) throw new Error(i18n.t('codex_auto_cookie.conflict', { rule: conflict }));
    const rules: Array<Record<string, unknown>> = Array.isArray(state?.rules) ? state.rules : [];
    const modelOverrides = rules.some(
      (rule) => Array.isArray(rule?.['model-overrides']) && rule['model-overrides'].length
    );
    const retryRounds = [
      state,
      ...rules.flatMap((rule) => [
        rule?.settings,
        ...(Array.isArray(rule?.['model-overrides'])
          ? rule['model-overrides'].map((item: { settings?: unknown }) => item?.settings)
          : []),
      ]),
    ].some((settings) => Number(settings?.['max-retry-rounds']) > 0);
    const strategySettings = [
      state,
      ...(Array.isArray(state?.['model-overrides']) ? state['model-overrides'] : []),
      ...rules.flatMap((rule) => [
        rule.settings,
        ...(Array.isArray(rule['model-overrides'])
          ? rule['model-overrides'].map((item: { settings?: unknown }) => item.settings)
          : []),
      ]),
    ];
    const cookieModelRules = strategySettings.some(
      (s) =>
        s &&
        (Boolean(s['cookie-acquisition-model']) ||
          (s['cookie-pool-mode'] !== undefined && s['cookie-pool-mode'] !== 'credential') ||
          Boolean(s['cookie-pool-group']))
    );
    const cookieBackups = strategySettings.some((s) => Number(s?.['cookie-backup-count']) > 0);
    const cookieFeatures = strategySettings.some(
      (s) =>
        s &&
        STATE_STRATEGY_KEYS.some(
          (key) =>
            s[key] !== undefined &&
            (key !== 'strategy' || s[key] !== 'state') &&
            (key !== 'missing-returned-state' || s[key] !== 'ignore') &&
            (key !== 'cookie-verify-after-acquire' || s[key] !== false) &&
            (key !== 'cookie-pool-mode' || s[key] !== 'credential') &&
            ((key !== 'cookie-acquisition-model' && key !== 'cookie-pool-group') ||
              s[key] !== '') &&
            (!key.startsWith('cookie-') || s[key] !== 0)
        )
    );
    if (quotaCredits || autoCookie || modelOverrides || retryRounds || cookieFeatures) {
      type StateOptions = {
        features?: {
          auto_cookie?: boolean;
          quota_auto_disable_credits?: boolean;
          rule_model_overrides?: boolean;
          state_retry_rounds?: boolean;
          cookie_model_rules?: boolean;
          cookie_backup_pool?: boolean;
          cookie_only?: boolean;
          state_seconds?: boolean;
        };
      };
      const options = await (
        connection
          ? apiClient.getAtConnection<StateOptions>(connection, '/auth-files/codex/state/options')
          : apiClient.get<StateOptions>('/auth-files/codex/state/options')
      ).catch((error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (quotaCredits && (status === 404 || status === 405))
          throw new Error(i18n.t('codex_quota_auto_disable.credits_upgrade'));
        if (autoCookie && (status === 404 || status === 405))
          throw new Error(i18n.t('codex_auto_cookie.upgrade'));
        throw error;
      });
      if (quotaCredits && options.features?.quota_auto_disable_credits !== true)
        throw new Error(i18n.t('codex_quota_auto_disable.credits_upgrade'));
      if (
        cookieFeatures &&
        (options.features?.cookie_only !== true || options.features?.state_seconds !== true)
      )
        throw new Error(i18n.t('codex_state.cookie_upgrade'));
      if (autoCookie && options.features?.auto_cookie !== true)
        throw new Error(i18n.t('codex_auto_cookie.upgrade'));
      if (cookieModelRules && options.features?.cookie_model_rules !== true)
        throw new Error(i18n.t('codex_state.cookie_model_rules_upgrade'));
      if (cookieBackups && options.features?.cookie_backup_pool !== true)
        throw new Error(i18n.t('codex_state.cookie_backup_upgrade'));
      if (modelOverrides && options.features?.rule_model_overrides !== true)
        throw new Error(i18n.t('codex_state.model_special_upgrade'));
      if (retryRounds && options.features?.state_retry_rounds !== true)
        throw new Error(i18n.t('codex_state.retry_round_upgrade'));
    }
    if (connection) {
      await apiClient.putAtConnection(connection, '/config.yaml', content, {
        headers: {
          'Content-Type': 'application/yaml',
          Accept: 'application/json, text/plain, */*',
        },
      });
      return;
    }
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  },
};
