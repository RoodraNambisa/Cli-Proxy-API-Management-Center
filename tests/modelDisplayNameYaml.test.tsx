import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

test.each(['gemini-api-key', 'interactions-api-key', 'codex-api-key', 'claude-api-key', 'vertex-api-key', 'openai-compatibility', 'oauth-model-alias'])('%s model labels survive unrelated visual YAML saves and reloads', (family) => {
  const alias = 'name: upstream, alias: local, display-name: "Readable label", force-mapping: true, future: { keep: yes }';
  const models = family === 'oauth-model-alias'
    ? `${family}:\n  codex: [*model]\n`
    : `${family}:\n  - api-key: fixture\n    name: compat\n    base-url: https://example.invalid\n    models: [*model]\n`;
  const yaml = `# keep comment\nmodel-source: &model { ${alias} }\n${models}request-retry: 1\nfuture-root: keep\n`;
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  expect(result.current.visualParseError).toBeNull();
  expect(result.current.visualDirty).toBe(false);
  act(() => result.current.setVisualValues({ requestRetry: '3' }));
  const saved = result.current.applyVisualChangesToYaml(yaml);
  expect(saved).toContain('# keep comment');
  expect(saved).toContain('display-name');
  expect(parse(saved)[family]).toEqual(parse(yaml)[family]);
  expect(parse(saved)['future-root']).toBe('keep');
  expect(parse(saved)['request-retry']).toBe(3);
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
  if (family === 'codex-api-key') expect(normalizeConfigResponse(parse(saved)).codexApiKeys?.[0].models?.[0].displayName).toBe('Readable label');
});

test('old YAML does not acquire model labels or a display-name enable flag', () => {
  const { result } = renderHook(() => useVisualConfig());
  const yaml = 'codex-api-key: [{api-key: fixture, models: [{name: upstream}]}]\nrequest-retry: 1\n';
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  act(() => result.current.setVisualValues({ requestRetry: '3' }));
  expect(result.current.applyVisualChangesToYaml(yaml)).not.toContain('display-name');
});

test.each([en, ru, zhCN, zhTW])('display-name controls include translated labels and searchable field documentation', (locale) => {
  expect(locale.common.model_display_name_label.length).toBeGreaterThan(0);
  expect(locale.common.model_display_name_placeholder.length).toBeGreaterThan(0);
  expect(locale.common.model_display_name_hint).toContain('display-name');
  expect(locale.common.model_context_length_hint).toContain('max-context-length');
  expect(locale.common.model_context_length_invalid).toContain('2147483647');
});
