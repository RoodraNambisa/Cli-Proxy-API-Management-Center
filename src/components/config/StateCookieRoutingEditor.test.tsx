import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StateCookieRoutingEditor } from './StateCookieRoutingEditor';
import {
  copyCookieRulePools,
  hasCookieRulePool,
  shareCookieRule,
} from '@/utils/codexCookieSharing';
import { readCodexState } from '@/utils/codexStateOverride';
import { inheritedStateSettings } from '@/utils/codexStateModelRules';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Fixture({
  initial,
  inherit = true,
}: {
  initial: Record<string, unknown>;
  inherit?: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  return (
    <>
      <StateCookieRoutingEditor
        settings={settings}
        onChange={setSettings}
        inherit={inherit}
        poolMode="auto"
      />
      <output data-testid="routing">{JSON.stringify(settings)}</output>
    </>
  );
}
const draft = () => JSON.parse(screen.getByTestId('routing').textContent!);
const sharing = (kind: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'codex_state.cookie_sharing' }));
  fireEvent.click(screen.getByRole('option', { name: `codex_state.cookie_sharing_${kind}` }));
};

it('keeps one pool when setting, changing or clearing the common acquisition model', () => {
  const initial = shareCookieRule({
    'cookie-acquisition-model': '',
    'cookie-backup-count': 2,
    extension: 'keep',
  });
  render(<Fixture initial={initial} />);
  const source = screen.getByRole('textbox', { name: 'codex_state.cookie_unified_model' });
  expect(screen.queryByRole('textbox', { name: 'codex_state.cookie-pool-group' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'codex_state.cookie-pool-mode' })).toBeNull();
  for (const model of ['luna', 'other-source', '']) {
    fireEvent.change(source, { target: { value: model } });
    expect(draft()).toEqual({ ...initial, 'cookie-acquisition-model': model });
  }
  expect(hasCookieRulePool(draft())).toBe(true);
});

it('preserves legacy pool identity until the user explicitly chooses rule sharing', () => {
  const initial = {
    'cookie-pool-mode': 'auto',
    'cookie-pool-group': 'existing',
    'cookie-acquisition-model': 'luna',
    lengths: [292],
    extension: 1,
  };
  render(<Fixture initial={initial} />);
  expect(draft()).toEqual(initial);
  expect(screen.getByRole('button', { name: 'codex_state.cookie_sharing' }).textContent).toContain(
    'codex_state.cookie_sharing_legacy'
  );
  fireEvent.click(screen.getByText('codex_state.cookie_legacy_routing', { selector: 'summary' }));
  expect(
    (screen.getByRole('textbox', { name: 'codex_state.cookie-pool-group' }) as HTMLInputElement)
      .value
  ).toBe('existing');
  sharing('rule');
  const pool = draft()['cookie-pool-group'];
  expect(hasCookieRulePool(draft())).toBe(true);
  expect(draft()).toEqual({ ...initial, 'cookie-pool-mode': 'shared', 'cookie-pool-group': pool });
  sharing('rule');
  expect(draft()['cookie-pool-group']).toBe(pool);
  sharing('model');
  expect(draft()).toEqual({ ...initial, 'cookie-pool-mode': 'model', 'cookie-pool-group': '' });
  sharing('inherit');
  expect(draft()).toEqual({ 'cookie-acquisition-model': 'luna', lengths: [292], extension: 1 });
});

it('inherits public sharing rules independently of an explicitly empty acquisition model', () => {
  const shared = shareCookieRule({ 'cookie-acquisition-model': 'luna' });
  const defaults = readCodexState({
    strategy: 'cookie-only',
    'model-overrides': [{ model: 'astra', ...shared }],
  });
  render(<Fixture initial={{}} />);
  expect(draft()).toEqual({});
  expect(inheritedStateSettings(defaults, draft(), 'astra')).toMatchObject(shared);
  const field = screen
    .getByRole('textbox', { name: 'codex_state.cookie_unified_model' })
    .closest('.form-group')!.parentElement!;
  fireEvent.click(within(field).getByRole('button', { name: 'codex_state.cookie_source_self' }));
  expect(inheritedStateSettings(defaults, draft(), 'astra')).toMatchObject({
    ...shared,
    'cookie-acquisition-model': '',
  });
  fireEvent.click(within(field).getByRole('button', { name: 'codex_state.rule_inherit' }));
  expect(draft()).toEqual({});
});

it('keeps global compatibility settings collapsed and unchanged', () => {
  const initial = { 'cookie-pool-mode': 'credential', 'cookie-acquisition-model': 'old' };
  render(<Fixture inherit={false} initial={initial} />);
  expect(screen.queryByRole('button', { name: 'codex_state.cookie_sharing' })).toBeNull();
  expect(
    screen
      .getByText('codex_state.cookie_legacy_defaults', { selector: 'summary' })
      .parentElement?.hasAttribute('open')
  ).toBe(false);
  fireEvent.click(screen.getByText('codex_state.cookie_legacy_defaults', { selector: 'summary' }));
  expect(
    (
      screen.getByRole('textbox', {
        name: 'codex_state.cookie-acquisition-model_default',
      }) as HTMLInputElement
    ).value
  ).toBe('old');
  expect(draft()).toEqual(initial);
});

it('gives copied rules their own pool while preserving relationships inside the copy and named legacy pools', () => {
  const settings = shareCookieRule({ 'cookie-acquisition-model': 'luna' });
  const legacy = { 'cookie-pool-mode': 'shared', 'cookie-pool-group': 'custom' };
  const original: {
    settings: Record<string, unknown>;
    'model-overrides': Array<{ settings: Record<string, unknown> }>;
  } = {
    settings,
    'model-overrides': [{ settings: { ...settings, lengths: [312] } }, { settings: legacy }],
  };
  const copy = copyCookieRulePools(original);
  expect(copy.settings['cookie-pool-group']).not.toBe(settings['cookie-pool-group']);
  expect(copy['model-overrides'][0].settings['cookie-pool-group']).toBe(
    copy.settings['cookie-pool-group']
  );
  expect(copy['model-overrides'][0].settings.lengths).toEqual([312]);
  expect(copy['model-overrides'][1].settings).toEqual(legacy);
  expect(original.settings).toBe(settings);
  expect(hasCookieRulePool(copy.settings)).toBe(true);
});
