import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { expect, test } from 'vitest';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';

const families = [
  ['gemini-api-key', 'geminiApiKeys'],
  ['interactions-api-key', 'interactionsApiKeys'],
  ['codex-api-key', 'codexApiKeys'],
  ['claude-api-key', 'claudeApiKeys'],
  ['vertex-api-key', 'vertexApiKeys'],
] as const;

test.each(families)('%s compatibility survives anchored YAML saves and config reloads', (family, field) => {
  const yaml = `# keep comment\nmodel-source: &model { name: upstream, alias: local, is-compat: true, thinking: { levels: [] }, force-mapping: true, future: keep }\n${family}:\n  - api-key: fixture\n    models: [*model]\nrequest-retry: 1\nfuture-root: keep\n`;
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  expect(result.current.visualParseError).toBeNull();
  expect(result.current.visualDirty).toBe(false);
  act(() => result.current.setVisualValues({ requestRetry: '3' }));
  expect(result.current.visualDirty).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(yaml);
  expect(saved).toContain('# keep comment');
  expect(parse(saved)[family]).toEqual(parse(yaml)[family]);
  expect(parse(saved)['future-root']).toBe('keep');
  expect(normalizeConfigResponse(parse(saved))[field]?.[0].models?.[0].isCompat).toBe(true);
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
});

test('older models stay disabled without acquiring compatibility fields', () => {
  const yaml = 'codex-api-key: [{api-key: fixture, models: [{name: upstream}]}]\nrequest-retry: 1\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(yaml));
  act(() => result.current.setVisualValues({ requestRetry: '3' }));
  const saved = result.current.applyVisualChangesToYaml(yaml);
  expect(saved).not.toContain('is-compat');
  expect(normalizeConfigResponse(parse(saved)).codexApiKeys?.[0].models?.[0].isCompat).toBeUndefined();
});
