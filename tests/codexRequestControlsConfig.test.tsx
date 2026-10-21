import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  CONFIG_SEARCH_DEFINITIONS,
  configPageHasDirtyFields,
  resolveConfigSection,
} from '@/components/config/configCatalog';
import { matchConfigSearch } from '@/components/config/configSearch';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => localStorage.clear());

const titlePrefix = 'config_management.visual.sections.network.';
const controls = [
  {
    id: 'config-codex-service-tier',
    title: 'codex_allow_client_service_tier',
    field: 'codexAllowClientServiceTier',
    yaml: 'allow-client-service-tier',
    alias: 'allowClientServiceTier',
    enabled: true,
    disabled: false,
    search: 'service_tier',
  },
  {
    id: 'config-codex-request-compression',
    title: 'codex_upstream_request_compression',
    field: 'codexUpstreamRequestCompression',
    yaml: 'upstream-request-compression',
    alias: 'upstreamRequestCompression',
    enabled: 'zstd',
    disabled: 'off',
    search: 'zstd',
  },
] as const;

describe('Codex client tiers and outbound compression', () => {
  test.each(['port: 8317\n', 'codex:\n  base-url: https://example.test/codex\n'])(
    'defaults off without adding fields on unrelated saves',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexAllowClientServiceTier).toBe(false);
      expect(result.current.visualValues.codexUpstreamRequestCompression).toBe('off');
      act(() => result.current.setVisualValues({ debug: true }));
      const saved = parse(result.current.applyVisualChangesToYaml(original));
      expect(saved.codex ?? {}).not.toHaveProperty('allow-client-service-tier');
      expect(saved.codex ?? {}).not.toHaveProperty('upstream-request-compression');
    }
  );

  test.each(controls)('saves and reloads $yaml independently with dirty state', (control) => {
    let yaml =
      '# keep header\ncodex:\n  future-field: keep\n  base-url: https://example.test/codex\nunknown-root: keep\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    for (const value of [control.enabled, control.disabled]) {
      act(() => result.current.setVisualValues({ [control.field]: value }));
      expect(result.current.visualDirtyFields).toContain(control.field);
      const page = CONFIG_PAGE_DEFINITIONS.find((p) => p.id === 'provider-codex')!;
      expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
      yaml = result.current.applyVisualChangesToYaml(yaml);
      const saved = parse(yaml);
      expect(saved.codex[control.yaml]).toBe(value);
      expect(saved.codex['future-field']).toBe('keep');
      expect(saved.codex['base-url']).toBe('https://example.test/codex');
      expect(saved['unknown-root']).toBe('keep');
      expect(yaml).toContain('# keep header');
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      expect(result.current.visualValues[control.field]).toBe(value);
      expect(result.current.visualDirty).toBe(false);
      expect(normalizeConfigResponse(saved).codex?.[control.alias]).toBe(value);
    }
  });

  test.each(controls)(
    'reads aliases and preserves explicit null precedence for $yaml',
    (control) => {
      const original = `codex:\n  ${control.yaml}: null # explicit default\n  ${control.alias}: ${control.enabled}\n`;
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues[control.field]).toBe(control.disabled);
      expect(normalizeConfigResponse(parse(original)).codex?.[control.alias]).toBe(
        control.disabled
      );
      expect(
        normalizeConfigResponse({ codex: { [control.alias]: control.enabled } }).codex?.[
          control.alias
        ]
      ).toBe(control.enabled);
      act(() => result.current.setVisualValues({ [control.field]: control.enabled }));
      const output = result.current.applyVisualChangesToYaml(original);
      expect(parse(output).codex[control.yaml]).toBe(control.enabled);
      expect(parse(output).codex).not.toHaveProperty(control.alias);
      expect(output).toContain('# explicit default');
    }
  );

  test.each(['codex: *defaults', 'codex: {<<: *defaults}'])(
    'disables inherited settings without changing shared anchors: %s',
    (mapping) => {
      const original = `defaults: &defaults\n  allow-client-service-tier: true\n  upstream-request-compression: zstd\n  future: keep\n${mapping}\n`;
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexAllowClientServiceTier).toBe(true);
      expect(result.current.visualValues.codexUpstreamRequestCompression).toBe('zstd');
      act(() =>
        result.current.setVisualValues({
          codexAllowClientServiceTier: false,
          codexUpstreamRequestCompression: 'off',
        })
      );
      const saved = parse(result.current.applyVisualChangesToYaml(original));
      expect(saved.defaults).toMatchObject({
        'allow-client-service-tier': true,
        'upstream-request-compression': 'zstd',
      });
      expect(saved.codex).toMatchObject({
        'allow-client-service-tier': false,
        'upstream-request-compression': 'off',
        future: 'keep',
      });
    }
  );

  test.each(controls)(
    'rejects invalid $yaml values instead of silently changing policy',
    (control) => {
      for (const value of [[], {}, 1, 'true', 'invalid']) {
        expect(() => normalizeConfigResponse({ codex: { [control.yaml]: value } })).toThrow(
          control.yaml
        );
        const { result } = renderHook(() => useVisualConfig());
        act(() =>
          result.current.loadVisualValuesFromYaml(
            `codex:\n  ${control.yaml}: ${JSON.stringify(value)}\n`
          )
        );
        expect(result.current.visualParseError).toContain(control.yaml);
      }
    }
  );

  test.each(['', 'off', ' OFF ', ' ZSTD '])(
    'normalizes compression %j without rewriting untouched YAML',
    (value) => {
      const original = `codex:\n  upstream-request-compression: ${JSON.stringify(value)} # preserve\n`;
      const expected = value.trim().toLowerCase() === 'zstd' ? 'zstd' : 'off';
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexUpstreamRequestCompression).toBe(expected);
      act(() => result.current.setVisualValues({ debug: true }));
      expect(
        parse(result.current.applyVisualChangesToYaml(original)).codex[
          'upstream-request-compression'
        ]
      ).toBe(value);
    }
  );

  test.each(controls)(
    'renders, changes and disables the $yaml switch via its search target',
    (control) => {
      const onChange = vi.fn();
      const view = (enabled: boolean, disabled = false) => (
        <MemoryRouter initialEntries={['/config?section=' + control.id]}>
          <VisualConfigEditor
            values={{
              ...DEFAULT_VISUAL_VALUES,
              [control.field]: enabled ? control.enabled : control.disabled,
            }}
            baselineValues={DEFAULT_VISUAL_VALUES}
            disabled={disabled}
            onChange={onChange}
          />
        </MemoryRouter>
      );
      const { rerender } = render(view(false));
      let toggle = screen.getByRole('checkbox', {
        name: titlePrefix + control.title,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      expect(
        document
          .querySelector('#config-codex-request-policies button')
          ?.getAttribute('aria-expanded')
      ).toBe('true');
      fireEvent.click(toggle);
      expect(onChange).toHaveBeenLastCalledWith({ [control.field]: control.enabled });
      rerender(view(true));
      toggle = screen.getByRole('checkbox', {
        name: titlePrefix + control.title,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
      fireEvent.click(toggle);
      expect(onChange).toHaveBeenLastCalledWith({ [control.field]: control.disabled });
      rerender(view(true, true));
      expect(
        (screen.getByRole('checkbox', { name: titlePrefix + control.title }) as HTMLInputElement)
          .disabled
      ).toBe(true);
      const definition = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === control.id)!;
      expect(matchConfigSearch(definition, control.search, [])?.yamlKey).toBe(
        'codex.' + control.yaml
      );
      expect(resolveConfigSection(control.id)).toEqual({
        pageId: 'provider-codex',
        targetId: control.id,
      });
      for (const locale of [en, ru, zhCN, zhTW]) {
        expect(locale.config_management.visual.sections.network[control.title]).toBeTruthy();
        expect(locale.config_management.visual.sections.network[`${control.title}_desc`]).toContain(
          control.search
        );
      }
    }
  );
});
