import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CodexServiceTiersEditor } from '@/components/config/CodexServiceTiersEditor';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  CONFIG_PAGE_DEFINITIONS,
  CONFIG_SEARCH_DEFINITIONS,
  configPageHasDirtyFields,
  resolveConfigSection,
} from '@/components/config/configCatalog';
import { useVisualConfig, getVisualConfigValidationErrors } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import {
  readCodexServiceTiers,
  codexServiceTiersError,
  type CodexServiceTierRule,
} from '@/utils/codexServiceTiers';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => localStorage.clear());
const rule = (): CodexServiceTierRule => ({
  id: 'rule',
  models: ['gpt-6-astra'],
  tiers: ['priority', 'ultrafast'],
  defaultTier: 'default',
});

describe('Codex model service tier rules', () => {
  test('defaults to inheritance and does not write rules during unrelated edits', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'codex:\n  allow-client-service-tier: false\n';
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.codexServiceTierRules).toEqual([]);
    act(() => result.current.setVisualValues({ debug: true }));
    expect(parse(result.current.applyVisualChangesToYaml(yaml)).codex).not.toHaveProperty(
      'service-tier-rules'
    );
  });
  test('saves model choices/defaults, preserves unknown fields and clears to inheritance', () => {
    let yaml =
      '# header\ncodex:\n  service-tier-rules:\n    - models: [gpt-6-astra]\n      tiers: [fast]\n      default: fast\n      future: keep\n  future: keep\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.codexServiceTierRules[0].tiers).toEqual(['priority']);
    expect(result.current.visualValues.codexServiceTierRules[0].defaultTier).toBe('priority');
    act(() =>
      result.current.setVisualValues({
        codexServiceTierRules: [
          {
            ...result.current.visualValues.codexServiceTierRules[0],
            tiers: ['ultrafast', 'flex'],
            defaultTier: 'ultrafast',
          },
        ],
      })
    );
    expect(result.current.visualDirtyFields).toContain('codexServiceTierRules');
    expect(
      configPageHasDirtyFields(
        CONFIG_PAGE_DEFINITIONS.find((p) => p.id === 'provider-codex')!,
        result.current.visualDirtyFields
      )
    ).toBe(true);
    yaml = result.current.applyVisualChangesToYaml(yaml);
    expect(yaml).toContain('# header');
    expect(parse(yaml).codex['service-tier-rules'][0]).toEqual({
      models: ['gpt-6-astra'],
      tiers: ['ultrafast', 'flex'],
      default: 'ultrafast',
      future: 'keep',
    });
    expect(normalizeConfigResponse(parse(yaml)).codex?.serviceTierRules?.[0].default).toBe(
      'ultrafast'
    );
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualDirty).toBe(false);
    act(() => result.current.setVisualValues({ codexServiceTierRules: [] }));
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(parse(saved).codex['service-tier-rules']).toEqual([]);
    expect(parse(saved).codex.future).toBe('keep');
  });
  test.each(['codex: *defaults', 'codex: {<<: *defaults}'])(
    'edits inherited rules without altering anchors: %s',
    (mapping) => {
      const yaml = `defaults: &defaults\n  service-tier-rules:\n    - models: [alias]\n      tiers: [priority]\n      future: keep\n${mapping}\n`;
      const { result } = renderHook(() => useVisualConfig());
      act(() => result.current.loadVisualValuesFromYaml(yaml));
      act(() =>
        result.current.setVisualValues({
          codexServiceTierRules: [
            {
              ...result.current.visualValues.codexServiceTierRules[0],
              tiers: [],
              defaultTier: 'default',
            },
          ],
        })
      );
      const saved = parse(result.current.applyVisualChangesToYaml(yaml));
      expect(saved.defaults['service-tier-rules'][0].tiers).toEqual(['priority']);
      expect(saved.codex['service-tier-rules'][0]).toMatchObject({
        tiers: [],
        default: 'default',
        future: 'keep',
      });
    }
  );
  test('validates supported tiers, duplicate scopes and explicit defaults', () => {
    for (const rules of [
      [{ ...rule(), models: [] }],
      [{ ...rule(), models: ['gpt-*'] }],
      [rule(), { ...rule(), id: 'duplicate' }],
      [{ ...rule(), tiers: ['auto'] }],
      [{ ...rule(), tiers: ['priority', 'priority'] }],
      [{ ...rule(), tiers: [], defaultTier: 'ultrafast' }],
    ]) {
      expect(codexServiceTiersError(rules)).toBe(true);
      expect(
        getVisualConfigValidationErrors({ ...DEFAULT_VISUAL_VALUES, codexServiceTierRules: rules })
          .codexServiceTierRules
      ).toBe('codex_service_tiers');
    }
    expect(codexServiceTiersError([{ ...rule(), models: ['*'], tiers: [] }])).toBe(false);
    expect(() => readCodexServiceTiers({})).toThrow('service-tier-rules');
    expect(() => readCodexServiceTiers([{ models: [1], tiers: [] }])).toThrow('service-tier-rules');
  });
  test('offers Standard plus selected extras, resets a removed default and supports deletion', () => {
    function Fixture() {
      const [rules, setRules] = useState([{ ...rule(), defaultTier: 'priority' }]);
      return (
        <>
          <CodexServiceTiersEditor
            rules={rules}
            enabled
            onChange={setRules}
            focusTarget="config-codex-service-tier-rules"
          />
          <output>{JSON.stringify(rules)}</output>
        </>
      );
    }
    render(<Fixture />);
    const standard = screen.getByRole('checkbox', {
      name: 'codex_service_tiers.default',
    }) as HTMLInputElement;
    expect(standard.checked).toBe(true);
    expect(standard.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_service_tiers.priority' }));
    expect(JSON.parse(screen.getByRole('status').textContent!)[0]).toMatchObject({
      tiers: ['ultrafast'],
      defaultTier: 'default',
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_service_tiers.flex' }));
    expect(JSON.parse(screen.getByRole('status').textContent!)[0].tiers).toEqual([
      'ultrafast',
      'flex',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'codex_service_tiers.remove' }));
    expect(screen.getByRole('status').textContent).toBe('[]');
  });
  test('search opens both parent and editor, disabled state and locales are complete', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=config-codex-service-tier-rules']}>
        <VisualConfigEditor
          values={{ ...DEFAULT_VISUAL_VALUES, codexServiceTierRules: [rule()] }}
          baselineValues={DEFAULT_VISUAL_VALUES}
          disabled
          onChange={onChange}
        />
      </MemoryRouter>
    );
    expect(
      document.querySelector('#config-codex-request-policies button')?.getAttribute('aria-expanded')
    ).toBe('true');
    expect(
      document
        .querySelector('#config-codex-service-tier-rules button')
        ?.getAttribute('aria-expanded')
    ).toBe('true');
    expect(screen.getByText('codex_service_tiers.requires_enabled')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: 'codex_service_tiers.ultrafast' }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(resolveConfigSection('config-codex-service-tier-rules')?.pageId).toBe('provider-codex');
    expect(
      CONFIG_SEARCH_DEFINITIONS.find((d) => d.id === 'config-codex-service-tier-rules')?.yamlKeys
    ).toContain('codex.service-tier-rules');
    for (const locale of [en, ru, zhCN, zhTW])
      expect(locale.codex_service_tiers.availability).toContain('Flex');
  });
});
