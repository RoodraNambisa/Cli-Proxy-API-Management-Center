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
    await requireRoutingCredentialSupport(root?.routing?.['priority-overrides']);
    const state = root?.codex?.['state-override'];
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
    if (modelOverrides || retryRounds) {
      const options = await apiClient.get<{
        features?: { rule_model_overrides?: boolean; state_retry_rounds?: boolean };
      }>('/auth-files/codex/state/options');
      if (modelOverrides && options.features?.rule_model_overrides !== true)
        throw new Error(i18n.t('codex_state.model_special_upgrade'));
      if (retryRounds && options.features?.state_retry_rounds !== true)
        throw new Error(i18n.t('codex_state.retry_round_upgrade'));
    }
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  },
};
