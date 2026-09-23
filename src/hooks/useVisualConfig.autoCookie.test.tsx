import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { parse } from 'yaml';
import { describe, expect, it, vi } from 'vitest';
import { CodexAutoCookieEditor } from '@/components/config/CodexAutoCookieEditor';
import { readCodexState } from '@/utils/codexStateOverride';
import { autoCookieConflict } from '@/utils/codexAutoCookie';
import { useVisualConfig, getVisualConfigValidationErrors } from './useVisualConfig';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, options?: { rule?: string }) =>
      key + (options?.rule ? ` ${options.rule}` : ''),
  }),
}));

describe('automatic Cookie configuration', () => {
  it('keeps the parent off and child override on by default and preserves explicit false/unknown fields', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    expect(result.current.visualValues.codexAutoCookie).toBe(false);
    expect(result.current.visualValues.codexAutoCookieOverride).toBe(true);
    expect(
      parse(result.current.applyVisualChangesToYaml('port: 8317\n')).codex?.['auto-cookie']
    ).toBeUndefined();
    const source = 'codex:\n  auto-cookie: true\n  auto-cookie-override: false\n  future: keep\n';
    act(() => result.current.loadVisualValuesFromYaml(source));
    expect(result.current.visualValues.codexAutoCookieOverride).toBe(false);
    act(() => result.current.setVisualValues({ codexAutoCookie: false }));
    expect(result.current.visualDirtyFields).toContain('codexAutoCookie');
    const output = result.current.applyVisualChangesToYaml(source);
    expect(parse(output).codex).toMatchObject({
      'auto-cookie': false,
      'auto-cookie-override': false,
      future: 'keep',
    });
    act(() => result.current.loadVisualValuesFromYaml(output));
    act(() =>
      result.current.setVisualValues({ codexAutoCookie: true, codexAutoCookieOverride: true })
    );
    expect(parse(result.current.applyVisualChangesToYaml(output)).codex).toMatchObject({
      'auto-cookie': true,
      'auto-cookie-override': true,
    });
  });
  it('identifies inherited Cookie-only conflicts while allowing State, disabled and skip rules', () => {
    for (const raw of [
      { enabled: false, strategy: 'cookie-only' },
      { enabled: true, strategy: 'state' },
      {
        enabled: true,
        strategy: 'cookie-only',
        rules: [
          { id: 'skip', action: 'skip' },
          { id: 'off', enabled: false },
        ],
      },
      {
        enabled: true,
        strategy: 'cookie-only',
        rules: [{ id: 'state', settings: { strategy: 'state' } }],
      },
    ])
      expect(autoCookieConflict(readCodexState(raw))).toBeUndefined();
    expect(autoCookieConflict(readCodexState({ enabled: true, strategy: 'cookie-only' }))).toBe(
      'strategy'
    );
    const state = readCodexState({
      enabled: true,
      strategy: 'state',
      rules: [
        {
          id: 'scoped',
          'model-overrides': [
            { id: 'cookie', models: ['sol'], settings: { strategy: 'cookie-only' } },
          ],
        },
      ],
    });
    expect(autoCookieConflict(state)).toContain('scoped');
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.setVisualValues({ codexAutoCookie: true, codexStateOverride: state }));
    expect(getVisualConfigValidationErrors(result.current.visualValues).codexAutoCookie).toBe(
      'codex_auto_cookie_conflict'
    );
  });
  it('shows the child only when enabled and retains its setting through parent toggles', () => {
    function Fixture() {
      const [value, setValue] = useState({ codexAutoCookie: false, codexAutoCookieOverride: true });
      return (
        <CodexAutoCookieEditor
          enabled={value.codexAutoCookie}
          override={value.codexAutoCookieOverride}
          state={readCodexState({})}
          onChange={(patch) => setValue({ ...value, ...patch })}
          focusTarget="config-codex-auto-cookie"
        />
      );
    }
    render(<Fixture />);
    expect(screen.queryByRole('checkbox', { name: 'codex_auto_cookie.override' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_auto_cookie.title' }));
    expect(
      (screen.getByRole('checkbox', { name: 'codex_auto_cookie.override' }) as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_auto_cookie.override' }));
    expect(screen.getByText('codex_auto_cookie.explicit_hint')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_auto_cookie.title' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'codex_auto_cookie.title' }));
    expect(
      (screen.getByRole('checkbox', { name: 'codex_auto_cookie.override' }) as HTMLInputElement)
        .checked
    ).toBe(false);
  });
});
