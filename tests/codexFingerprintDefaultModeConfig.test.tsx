import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';
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

describe('Codex fingerprint upload default config', () => {
  beforeEach(() => localStorage.clear());

  test('reads camel alias and writes only the canonical default-mode key', () => {
    const initialYaml = `codex-fingerprint:
  ja3: false
  defaultMode: SESSION
`;
    const { result } = renderHook(() => useVisualConfig());

    act(() => result.current.loadVisualValuesFromYaml(initialYaml));
    expect(result.current.visualValues.codexFingerprintDefaultMode).toBe('session');

    act(() => result.current.setVisualValues({ codexFingerprintDefaultMode: 'full' }));
    expect(result.current.visualDirtyFields).toContain('codexFingerprintDefaultMode');

    const saved = parse(result.current.applyVisualChangesToYaml(initialYaml));
    expect(saved['codex-fingerprint']['default-mode']).toBe('full');
    expect(Object.keys(saved['codex-fingerprint'])).not.toContain('defaultMode');
  });

  test('normalizes API responses and preserves the device compatibility default', () => {
    expect(DEFAULT_VISUAL_VALUES.codexFingerprintDefaultMode).toBe('device');
    expect(
      normalizeConfigResponse({
        'codex-fingerprint': { 'default-mode': 'off' },
      }).codexFingerprint?.defaultMode
    ).toBe('off');
    expect(
      normalizeConfigResponse({
        codexFingerprint: { defaultMode: 'FULL' },
      }).codexFingerprint?.defaultMode
    ).toBe('full');
    expect(
      normalizeConfigResponse({
        'codex-fingerprint': {},
      }).codexFingerprint?.defaultMode
    ).toBe('device');
  });

  test('renders a fixed four-mode selector and indexes the YAML key', async () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor
          values={cloneValues()}
          baselineValues={cloneValues()}
          onChange={onChange}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );

    const selector = document.getElementById('config-codex-fingerprint-default-mode');
    expect(selector).not.toBeNull();
    fireEvent.click(selector!);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    fireEvent.click(
      screen.getByRole('option', { name: 'auth_files.codex_fingerprint_modes.session' })
    );
    expect(onChange).toHaveBeenCalledWith({ codexFingerprintDefaultMode: 'session' });

    const searchEntry = CONFIG_SEARCH_DEFINITIONS.find(
      (entry) => entry.id === 'config-codex-fingerprint'
    );
    expect(searchEntry?.yamlKeys).toContain('codex-fingerprint.default-mode');
  });

  test('defines upload-only guidance in every supported locale', () => {
    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      const labels = locale.config_management.visual.sections.network;
      expect(labels.codex_fingerprint_default_mode).toBeTruthy();
      expect(labels.codex_fingerprint_default_mode_desc).toBeTruthy();
    }
  });
});
