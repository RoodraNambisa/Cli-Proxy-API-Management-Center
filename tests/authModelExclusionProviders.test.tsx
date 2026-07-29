import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { getVisualConfigValidationErrors, useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from '@/types/visualConfig';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const cloneValues = (): VisualConfigValues =>
  JSON.parse(JSON.stringify(DEFAULT_VISUAL_VALUES)) as VisualConfigValues;

describe('auth model exclusion providers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('normalizes providers from the management config without filtering custom IDs', () => {
    const config = normalizeConfigResponse({
      'auth-model-exclusions': [
        {
          providers: [' Codex ', 'CHATGPT-WEB', 'codex', 'Custom.Runtime'],
          models: ['gpt-image-2'],
          priorities: [-1],
          'keyword-contains': ['trial'],
        },
      ],
    });

    expect(config.authModelExclusions?.[0]).toMatchObject({
      providers: ['codex', 'chatgpt-web', 'custom.runtime'],
      models: ['gpt-image-2'],
      priorities: [-1],
      keywordContains: ['trial'],
    });
  });

  test('reads, displays, saves, and reloads provider-only matchers', () => {
    const yaml = [
      'auth-model-exclusions:',
      '  - providers: [" Codex ", CHATGPT-WEB, codex, Custom.Runtime]',
      '    models: [gpt-image-2]',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      expect(result.current.loadVisualValuesFromYaml(yaml)).toEqual({ ok: true });
    });

    const rule = result.current.visualValues.authModelExclusions[0];
    expect(rule.providers).toEqual(['codex', 'chatgpt-web', 'custom.runtime']);
    expect(
      result.current.visualValidationErrors[`authModelExclusions.${rule.clientId}.match`]
    ).toBeUndefined();

    render(
      <MemoryRouter initialEntries={['/config?section=global-credentials']}>
        <VisualConfigEditor
          values={result.current.visualValues}
          baselineValues={result.current.visualValues}
          onChange={vi.fn()}
        />
      </MemoryRouter>
    );
    fireEvent.click(
      document.querySelector(
        '#config-auth-model-exclusions button[aria-expanded]'
      ) as HTMLButtonElement
    );
    expect(
      screen.getByText('config_management.visual.sections.auth.auth_model_exclusions_providers')
    ).not.toBeNull();
    expect(screen.getByText('chatgpt-web')).not.toBeNull();
    expect(screen.getByText('custom.runtime')).not.toBeNull();

    const savedYaml = result.current.applyVisualChangesToYaml(yaml);
    const saved = parseYaml(savedYaml) as {
      'auth-model-exclusions': Array<Record<string, unknown>>;
    };
    expect(saved['auth-model-exclusions'][0]).toEqual({
      providers: ['codex', 'chatgpt-web', 'custom.runtime'],
      models: ['gpt-image-2'],
    });

    act(() => {
      expect(result.current.loadVisualValuesFromYaml(savedYaml)).toEqual({ ok: true });
    });
    expect(result.current.visualValues.authModelExclusions[0].providers).toEqual([
      'codex',
      'chatgpt-web',
      'custom.runtime',
    ]);
  });

  test('requires one matcher category when providers, priorities, and keywords are empty', () => {
    const values = cloneValues();
    values.authModelExclusions = [
      {
        clientId: 'empty-matchers',
        providers: [],
        models: ['gpt-image-2'],
        priorities: [],
        keywordContains: [],
        disableImageGeneration: false,
      },
    ];

    expect(
      getVisualConfigValidationErrors(values)['authModelExclusions.empty-matchers.match']
    ).toBe('auth_model_exclusion_match_required');
  });

  test('includes providers in auth model exclusion dirty tracking', () => {
    const yaml = [
      'auth-model-exclusions:',
      '  - providers: [codex]',
      '    models: [gpt-image-2]',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    expect(result.current.visualDirtyFields).toEqual([]);

    act(() => {
      result.current.setVisualValues({
        authModelExclusions: result.current.visualValues.authModelExclusions.map((rule) => ({
          ...rule,
          providers: ['chatgpt-web'],
        })),
      });
    });
    expect(result.current.visualDirtyFields).toContain('authModelExclusions');

    act(() => {
      result.current.setVisualValues({
        authModelExclusions: result.current.visualValues.authModelExclusions.map((rule) => ({
          ...rule,
          providers: ['codex'],
        })),
      });
    });
    expect(result.current.visualDirtyFields).toEqual([]);
  });

  test('keeps legacy rules without providers unrestricted', () => {
    const yaml = [
      'auth-model-exclusions:',
      '  - models: [gpt-image-2]',
      '    priorities: [-1]',
      '',
    ].join('\n');
    const { result } = renderHook(() => useVisualConfig());
    const normalizedRule = normalizeConfigResponse({
      'auth-model-exclusions': [{ models: ['gpt-image-2'], priorities: [-1] }],
    }).authModelExclusions?.[0];

    expect(Object.prototype.hasOwnProperty.call(normalizedRule, 'providers')).toBe(false);

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    expect(result.current.visualValues.authModelExclusions[0].providers).toEqual([]);

    const saved = parseYaml(result.current.applyVisualChangesToYaml(yaml)) as {
      'auth-model-exclusions': Array<Record<string, unknown>>;
    };
    expect(
      Object.prototype.hasOwnProperty.call(saved['auth-model-exclusions'][0], 'providers')
    ).toBe(false);
    expect(saved['auth-model-exclusions'][0].priorities).toEqual([-1]);
  });
});
