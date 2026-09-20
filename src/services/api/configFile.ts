/**
 * Configuration file API (/config.yaml).
 */

import { apiClient } from './client';
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
    const rules = parseDocument(content).toJS()?.codex?.['state-override']?.rules;
    if (
      Array.isArray(rules) &&
      rules.some(
        (rule) => Array.isArray(rule?.['model-overrides']) && rule['model-overrides'].length
      )
    ) {
      const options = await apiClient.get<{ features?: { rule_model_overrides?: boolean } }>(
        '/auth-files/codex/state/options'
      );
      if (options.features?.rule_model_overrides !== true)
        throw new Error(i18n.t('codex_state.model_special_upgrade'));
    }
    await apiClient.put('/config.yaml', content, {
      headers: {
        'Content-Type': 'application/yaml',
        Accept: 'application/json, text/plain, */*',
      },
    });
  },
};
