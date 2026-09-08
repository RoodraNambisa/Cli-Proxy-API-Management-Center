import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parse } from 'yaml';
import { expect, test, vi } from 'vitest';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import { CONFIG_PAGE_DEFINITIONS, CONFIG_SEARCH_DEFINITIONS, configPageHasDirtyFields } from '@/components/config/configCatalog';
import { useVisualConfig } from '@/hooks/useVisualConfig';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

test('search opens OAuth error rules, editing enables save and reloading preserves the rule', () => {
  const source = 'oauth-request-scoped-errors: {}\nfuture-setting: kept\n';
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml(source));
  const editor = () => <MemoryRouter initialEntries={['/config?section=config-oauth-request-scoped-errors']}>
    <VisualConfigEditor values={result.current.visualValues} baselineValues={result.current.baselineValues}
      onChange={result.current.setVisualValues} renderRequestBodyPanels={() => null}
      validationErrors={result.current.visualValidationErrors} />
  </MemoryRouter>;
  const { rerender } = render(editor());
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.provider' }));
  expect(screen.getAllByRole('option')).toHaveLength(7);
  fireEvent.click(screen.getByRole('option', { name: 'Codex' }));
  rerender(editor());
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.add_rule' }));
  rerender(editor());
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.add_matchRegexr' }));
  rerender(editor());
  fireEvent.change(screen.getByRole('textbox', { name: 'request_scoped_errors.matchRegexr 1' }), { target: { value: '(?i)busy' } });
  expect(result.current.visualDirtyFields).toContain('oauthRequestScopedErrors');
  expect(configPageHasDirtyFields(CONFIG_PAGE_DEFINITIONS.find((page) => page.id === 'global-request')!, result.current.visualDirtyFields)).toBe(true);
  const saved = result.current.applyVisualChangesToYaml(source);
  expect(parse(saved)['oauth-request-scoped-errors']).toEqual({ codex: [{ status: 500, action: 'stop', match: [], 'match-regexr': ['(?i)busy'] }] });
  expect(parse(saved)['future-setting']).toBe('kept');
  act(() => result.current.loadVisualValuesFromYaml(saved));
  expect(result.current.visualDirty).toBe(false);
  expect(result.current.visualValues.oauthRequestScopedErrors.codex[0].matchRegexr).toEqual(['(?i)busy']);
  expect(CONFIG_SEARCH_DEFINITIONS.find((entry) => entry.id === 'config-oauth-request-scoped-errors')?.yamlKeys).toContain('request-scoped-errors');
});

test('unknown providers stay editable and removable without becoming new dropdown choices', () => {
  const { result } = renderHook(() => useVisualConfig());
  act(() => result.current.loadVisualValuesFromYaml('oauth-request-scoped-errors: {future: [{status: 500, match: [busy], action: stop}]}\n'));
  render(<MemoryRouter initialEntries={['/config?section=config-oauth-request-scoped-errors']}>
    <VisualConfigEditor values={result.current.visualValues} baselineValues={result.current.baselineValues} onChange={result.current.setVisualValues} renderRequestBodyPanels={() => null} />
  </MemoryRouter>);
  expect(screen.getByText('future')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_provider' }));
  expect(result.current.visualValues.oauthRequestScopedErrors).toEqual({});
});
