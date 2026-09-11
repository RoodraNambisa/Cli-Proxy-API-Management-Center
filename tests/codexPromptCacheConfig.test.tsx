import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { describe, expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Codex prompt cache passthrough configuration', () => {
  test('defaults off and round trips independently of identity settings', () => {
    const original = 'codex:\n  identity-confuse: true\n  future-field: retained\nunknown-root: retained\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(false);
    act(() => result.current.setVisualValues({ codexPassthroughPromptCacheKey: true }));
    expect(result.current.visualDirty).toBe(true);
    expect(result.current.visualDirtyFields).toContain('codexPassthroughPromptCacheKey');
    const page = CONFIG_PAGE_DEFINITIONS.find((entry) => entry.id === 'provider-codex')!;
    expect(configPageHasDirtyFields(page, result.current.visualDirtyFields)).toBe(true);
    const saved = result.current.applyVisualChangesToYaml(original);
    expect(parse(saved).codex).toMatchObject({
      'identity-confuse': true,
      'passthrough-prompt-cache-key': true,
      'future-field': 'retained',
    });
    expect(parse(saved)['unknown-root']).toBe('retained');
    // Generating YAML does not acknowledge a server save or clear unsaved changes.
    expect(result.current.visualDirty).toBe(true);
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualDirty).toBe(false);
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(true);
    act(() => result.current.setVisualValues({ codexPassthroughPromptCacheKey: false }));
    const disabled = result.current.applyVisualChangesToYaml(saved);
    expect(parse(disabled).codex['passthrough-prompt-cache-key']).toBe(false);
    act(() => result.current.loadVisualValuesFromYaml(disabled));
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(false);
  });

  test('normalizes API aliases and canonicalizes saved YAML', () => {
    for (const name of ['passthrough-prompt-cache-key', 'passthroughPromptCacheKey']) {
      expect(normalizeConfigResponse({ codex: { [name]: true } }).codex?.passthroughPromptCacheKey).toBe(true);
      expect(normalizeConfigResponse({ codex: { [name]: false } }).codex?.passthroughPromptCacheKey).toBe(false);
    }
    const original = 'codex:\n  passthroughPromptCacheKey: true\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(original));
    expect(result.current.visualValues.codexPassthroughPromptCacheKey).toBe(true);
    act(() => result.current.setVisualValues({ codexPassthroughPromptCacheKey: false }));
    const saved = parse(result.current.applyVisualChangesToYaml(original));
    expect(saved.codex['passthrough-prompt-cache-key']).toBe(false);
    expect(saved.codex).not.toHaveProperty('passthroughPromptCacheKey');
  });

  test.each(['1', '[]', '"false"'])('rejects invalid YAML type %s', (value) => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(`codex:\n  passthrough-prompt-cache-key: ${value}\n`));
    expect(result.current.visualParseError).toContain('passthrough-prompt-cache-key');
  });

  test('renders a switch and supports search and all four locales', () => {
    const onChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/config?section=provider-codex']}>
        <VisualConfigEditor
          values={DEFAULT_VISUAL_VALUES}
          baselineValues={DEFAULT_VISUAL_VALUES}
          onChange={onChange}
          renderRequestBodyPanels={() => null}
        />
      </MemoryRouter>
    );
    const title = 'config_management.visual.sections.network.codex_passthrough_prompt_cache_key';
    fireEvent.click(screen.getByRole('checkbox', { name: title }));
    expect(onChange).toHaveBeenCalledWith({ codexPassthroughPromptCacheKey: true });
    const entry = CONFIG_SEARCH_DEFINITIONS.find((item) => item.id === 'config-codex-prompt-cache');
    expect(entry?.yamlKeys).toContain('codex.passthrough-prompt-cache-key');
    expect(entry?.aliases).toEqual(expect.arrayContaining(['session_id', 'Session-Id']));
    expect(document.getElementById(entry!.id)).not.toBeNull();
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.config_management.visual.sections.network.codex_passthrough_prompt_cache_key).toContain('Session ID');
      const description = locale.config_management.visual.sections.network.codex_passthrough_prompt_cache_key_desc;
      expect(description).toContain('UUID');
      expect(description).toContain('HTTP 500 / invalid_prompt_cache_key');
    }
  });
});
