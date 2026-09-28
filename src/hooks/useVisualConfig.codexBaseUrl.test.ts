import { act, renderHook } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { normalizeCodexBaseUrl } from '@/utils/codexUpstream';
import { getVisualConfigValidationErrors, useVisualConfig } from './useVisualConfig';

describe('Codex OAuth base URL', () => {
  it('defaults to official inheritance without changing unrelated YAML', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.codexBaseUrl).toBe('');
    act(() => result.current.setVisualValues({ port: '8318' }));
    expect(parse(result.current.applyVisualChangesToYaml('port: 8317\n'))).not.toHaveProperty(
      'codex'
    );
  });

  it.each(['base-url', 'baseUrl'])(
    'saves and clears %s, updates dirty state and reloads',
    (key) => {
      let yaml = `# keep\ncodex:\n  ${key}: https://old.test/codex\n  future-field: keep\n`;
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      expect(result.current.visualValues.codexBaseUrl).toBe('https://old.test/codex');
      expect(normalizeConfigResponse(parse(yaml)).codex?.baseUrl).toBe('https://old.test/codex');
      for (const value of ['  https://new.test/proxy/codex/  ', '']) {
        act(() => result.current.setVisualValues({ codexBaseUrl: value }));
        expect(result.current.visualDirty).toBe(true);
        expect(result.current.visualDirtyFields).toContain('codexBaseUrl');
        yaml = result.current.applyVisualChangesToYaml(yaml);
        const saved = parse(yaml).codex;
        expect(saved['base-url']).toBe(normalizeCodexBaseUrl(value));
        expect(saved).not.toHaveProperty('baseUrl');
        expect(saved['future-field']).toBe('keep');
        expect(yaml).toContain('# keep');
        act(() => result.current.loadVisualValuesFromYaml(yaml));
        expect(result.current.visualDirty).toBe(false);
      }
    }
  );

  it.each([
    'defaults: &defaults {base-url: https://inherited.test/codex}\ncodex: {<<: *defaults}\n',
    'defaults: &defaults {base-url: https://inherited.test/codex}\ncodex: *defaults\n',
  ])('clears inherited URLs without editing the shared anchor', (yaml) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    act(() => result.current.setVisualValues({ codexBaseUrl: '' }));
    const saved = parse(result.current.applyVisualChangesToYaml(yaml));
    expect(saved.codex['base-url']).toBe('');
    expect(saved.defaults['base-url']).toBe('https://inherited.test/codex');
  });

  it.each([
    'file:///tmp/socket',
    '/codex',
    'https://user:secret@example.test',
    'https://example.test?token=secret',
    'https://example.test#fragment',
  ])('rejects %s', (value) => {
    expect(
      getVisualConfigValidationErrors({ ...DEFAULT_VISUAL_VALUES, codexBaseUrl: value })
        .codexBaseUrl
    ).toBe('codex_base_url');
  });
});
