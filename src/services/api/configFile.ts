import { autoCookieConflict } from '@/utils/codexAutoCookie';
import { readCodexState } from '@/utils/codexStateOverride';
import { STATE_STRATEGY_KEYS } from '@/utils/codexStateStrategy';
/**
 * Configuration file API (/config.yaml).
 */

import { apiClient, type ApiClientConnectionSnapshot } from './client';
import { readTLSTrustAnchors, supportsTLSTrustAnchors, TLS_TRUST_ANCHORS_KEY } from '@/features/chatgptWeb/tlsTrustAnchors';
import { requireRoutingCredentialSupport } from './routingCredentials';
import { parseDocument } from 'yaml';
import i18n from '@/i18n';

export const configFileApi = {
  async fetchConfigYaml(connection?: ApiClientConnectionSnapshot, signal?: AbortSignal): Promise<string> {
    const request = { responseType: 'text' as const, headers: { Accept: 'application/yaml, text/yaml, text/plain' }, signal };
    const data: unknown = connection
      ? await apiClient.getAtConnection(connection, '/config.yaml', request)
      : (await apiClient.getRaw('/config.yaml', request)).data;
    if (typeof data === 'string') return data;
    if (data === undefined || data === null) return '';
    return String(data);
  },

  async saveConfigYaml(content: string, options: {
    previousContent?: string;
    connection?: ApiClientConnectionSnapshot;
    signal?: AbortSignal;
  } = {}): Promise<void> {
    const root = parseDocument(content).toJS();
    const tlsValue = root?.['chatgpt-web']?.[TLS_TRUST_ANCHORS_KEY];
    const previousTLSValue = options.previousContent === undefined ? undefined
      : parseDocument(options.previousContent).toJS()?.['chatgpt-web']?.[TLS_TRUST_ANCHORS_KEY];
    const needsTLS = options.previousContent === undefined
      ? tlsValue !== undefined
      : tlsValue !== previousTLSValue;
    readTLSTrustAnchors(tlsValue);
    const tlsConnection = needsTLS ? options.connection ?? apiClient.captureConnection() : undefined;
    if (tlsConnection) {
      let supported = false;
      try { supported = await supportsTLSTrustAnchors(tlsConnection, options.signal); }
      catch (error) {
        if (![404, 405, 501].includes((error as { status?: number }).status ?? 0)) throw error;
      }
      if (!supported) throw new Error(i18n.t('chatgpt_web.tls_trust_anchors.unsupported'));
    }
    const needsManualRegion = Boolean(
      root?.['proxy-region'] ||
      root?.['proxy-pools']?.some?.(
        (p: { region?: unknown; entries?: { region?: unknown }[] }) =>
          p.region || p.entries?.some((e) => e.region)
      ) ||
      root?.['codex-api-key']?.some?.((k: Record<string, unknown>) => k['proxy-region'])
    );
    const needsRegion = Boolean(
      needsManualRegion || root?.['proxy-ip'] || root?.codex?.['time-context']?.enabled === true
    );
    const saveConnection = options.connection ?? tlsConnection ?? (needsRegion ? apiClient.captureConnection() : undefined);
    if (needsRegion) {
      const caps = await apiClient.getAtConnection<{ capabilities?: Record<string, boolean> }>(
        saveConnection!,
        '/proxy-ip', {signal:options.signal}
      );
      if (
        !caps.capabilities?.proxy_ip ||
        !caps.capabilities?.codex_time_context ||
        (needsManualRegion && !caps.capabilities?.proxy_region) ||
        (root?.['proxy-ip'] && !caps.capabilities?.region_lifecycle)
      )
        throw new Error(i18n.t('proxy_ip.upgrade'));

    }
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
    const connection =
      saveConnection ?? (needsGrok || needsGuard ? apiClient.captureConnection() : undefined);
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
    if (tlsConnection) {
      const current = apiClient.captureConnection();
      if (current.apiBase !== tlsConnection.apiBase || current.managementKey !== tlsConnection.managementKey)
        throw new Error(i18n.t('chatgpt_web.tls_trust_anchors.connection_changed'));
    }
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (connection) {
      await apiClient.putAtConnection(connection, '/config.yaml', content, {
        signal: options.signal,
        headers: {
          'Content-Type': 'application/yaml',
          Accept: 'application/json, text/plain, */*',
        },
      });
      return;
    }
    await apiClient.put('/config.yaml', content, {
      signal: options.signal,
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  },
};
