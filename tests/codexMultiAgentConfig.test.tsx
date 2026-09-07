import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  CONFIG_SEARCH_DEFINITIONS,
  configPageHasDirtyFields,
} from '@/components/config/configCatalog';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Codex multi-agent v2 configuration data', () => {
  test.each(['request-retry: 2\n', 'request-retry: 2\ncodex:\n  future-field: retained\n'])(
    'defaults off and preserves unrelated YAML through both values',
    (original) => {
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(original));
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(false);
      act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: true }));
      expect(result.current.visualDirtyFields).toContain('codexOptimizeMultiAgentV2');
      const saved = result.current.applyVisualChangesToYaml(original);
      expect(parse(saved)).toMatchObject({
        'request-retry': 2,
        codex: { 'optimize-multi-agent-v2': true },
      });
      if (original.includes('future-field')) {
        expect(parse(saved).codex['future-field']).toBe('retained');
      }
      expect(result.current.visualDirty).toBe(true);
      act(() => result.current.loadVisualValuesFromYaml(saved));
      expect(result.current.visualDirty).toBe(false);
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
      act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: false }));
      const disabled = result.current.applyVisualChangesToYaml(saved);
      act(() => result.current.loadVisualValuesFromYaml(disabled));
      expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(false);
    }
  );

  test('normalizes API aliases and canonicalizes edited YAML', () => {
    for (const field of ['optimize-multi-agent-v2', 'optimizeMultiAgentV2']) {
      for (const value of [true, false]) {
        expect(
          normalizeConfigResponse({ codex: { [field]: value } }).codex?.optimizeMultiAgentV2
        ).toBe(value);
      }
    }
    const original = 'codex:\n  optimizeMultiAgentV2: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
    act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex['optimize-multi-agent-v2']).toBe(false);
    expect(saved.codex).not.toHaveProperty('optimizeMultiAgentV2');
    act(() => result.current.setVisualValues({ codexOptimizeMultiAgentV2: true }));
    expect(result.current.visualDirty).toBe(false);
  });

  test.each(['1', '[]', '{}', '"false"'])('rejects invalid YAML type %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() =>
      result.current.loadVisualValuesFromYaml('codex:\n  optimize-multi-agent-v2: ' + value + '\n')
    );
    expect(result.current.visualParseError).toContain('optimize-multi-agent-v2');
  });
});

describe('Codex multi-agent v2 configuration control', () => {
  test('connects the switch to page saving and searchable translated help', () => {
    const { result } = renderHook(() => useVisualConfig());
    const original = 'codex:\n  future-field: retained\n';
    act(() => result.current.loadVisualValuesFromYaml(original));
    render(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor
          values={result.current.visualValues}
          baselineValues={result.current.baselineValues}
          onChange={result.current.setVisualValues}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );
    const label = 'config_management.visual.sections.network.codex_optimize_multi_agent_v2';
    const toggle = screen.getByRole('checkbox', { name: label });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    expect(result.current.visualValues.codexOptimizeMultiAgentV2).toBe(true);
    const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-codex')!;
    expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved).codex).toMatchObject({
      'optimize-multi-agent-v2': true,
      'future-field': 'retained',
    });
    expect(result.current.visualDirty).toBe(true);
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-multi-agent');
    expect(entry?.yamlKeys).toContain('codex.optimize-multi-agent-v2');
    expect(document.getElementById(entry!.id)).not.toBeNull();
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(
        locale.config_management.visual.sections.network.codex_optimize_multi_agent_v2
      ).toBeTruthy();
      expect(
        locale.config_management.visual.sections.network.codex_optimize_multi_agent_v2_desc
      ).toBeTruthy();
    }
  });
});
