import { describe, expect, test } from 'vitest';
import { CONFIG_SEARCH_DEFINITIONS, type ConfigSearchDefinition } from '@/components/config/configCatalog';
import { matchConfigSearch, normalizeConfigSearchQuery } from '@/components/config/configSearch';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';

const definition: ConfigSearchDefinition = {
  id: 'routing',
  pageId: 'global-network',
  labelKey: 'routing',
  yamlKeys: ['routing', 'routing.strategy', 'routing.priority-overrides[].strategy'],
  aliases: ['round robin'],
};

describe('configuration field search', () => {
  test('ranks exact paths, field names, partial keys and parent sections before descriptions', () => {
    const match = (query: string) => matchConfigSearch(definition, query, ['Network configuration']);
    const exact = match('routing.strategy');
    const field = match('strategy');
    const partial = match('strateg');
    const parent = match('routing.priority-overrides.strategy.future');
    const description = match('configuration');
    expect(exact?.yamlKey).toBe('routing.strategy');
    expect(field?.yamlKey).toBe('routing.strategy');
    expect(parent?.yamlKey).toBe('routing.priority-overrides[].strategy');
    expect(exact!.rank).toBeLessThan(field!.rank);
    expect(field!.rank).toBeLessThan(partial!.rank);
    expect(partial!.rank).toBeLessThan(parent!.rank);
    expect(parent!.rank).toBeLessThan(description!.rank);
    expect(match('round robin')).toBeDefined();
  });

  test('preserves indexed paths for display while accepting YAML colons, case and omitted indexes', () => {
    for (const query of [
      ' ROUTING.PRIORITY-OVERRIDES[12].STRATEGY: ',
      'routing.priority-overrides[].strategy',
      'priority-overrides.strategy',
    ]) {
      expect(matchConfigSearch(definition, normalizeConfigSearchQuery(query), [])?.yamlKey).toBe(
        'routing.priority-overrides[].strategy'
      );
    }
  });

  test('keeps protocol aliases searchable without presenting them as YAML settings', () => {
    for (const [query, yamlKey] of [
      ['prompt_cache_key', 'codex.passthrough-prompt-cache-key'],
      ['message_start', 'codex.estimate-claude-input-tokens'],
      ['input_tokens', 'codex.estimate-claude-input-tokens'],
      ['codex.rate_limits', 'codex.observe-quota'],
    ]) {
      const matches = CONFIG_SEARCH_DEFINITIONS.flatMap((item) => {
        const match = matchConfigSearch(item, query, []);
        return match ? [match.yamlKey] : [];
      });
      expect(matches).toContain(yamlKey);
      expect(matches).not.toContain(query);
    }
  });

  test.each([enLocale, ruLocale, zhCNLocale, zhTWLocale])('preserves translated label search and documents field names', (locale) => {
    const item = CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-routing-priority-overrides')!;
    const label = locale.config_management.visual.sections.network.priority_overrides;
    expect(matchConfigSearch(item, normalizeConfigSearchQuery(label), [label])?.yamlKey).toBe(
      'routing.priority-overrides'
    );
    expect(locale.config_management.settings_center.search_placeholder).toContain('priority-overrides');
  });

  test.each(['', '  ', ':', 'unrecognized-field', '.*'])('does not invent results for %j', (query) => {
    expect(matchConfigSearch(definition, normalizeConfigSearchQuery(query), [])).toBeUndefined();
  });
});
