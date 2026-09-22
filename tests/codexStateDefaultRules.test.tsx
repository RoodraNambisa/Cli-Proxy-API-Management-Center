import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { CodexStateEditor } from '@/components/config/CodexStateEditor';
import { StateModelOverridesEditor } from '@/components/config/StateModelOverridesEditor';
import { inheritedStateSettings } from '@/utils/codexStateModelRules';
import {
  codexStateError,
  readCodexState,
  serializeCodexState,
  writeCodexState,
} from '@/utils/codexStateOverride';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const modern = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra'];
const scope = [
  {
    id: 'priority-3',
    priorities: [3],
    credentials: ['one'],
    'excluded-credentials': ['two'],
    settings: {},
  },
];
function Fixture({ raw = {} }: { raw?: Record<string, unknown> }) {
  const [value, setValue] = useState(
    readCodexState({ enabled: true, strategy: 'cookie-only', rules: scope, ...raw })
  );
  return (
    <>
      <CodexStateEditor
        value={value}
        onChange={setValue}
        defaultsOnly
        strip={false}
        focusTarget="config-codex-state-defaults"
      />
      <output data-testid="draft">{JSON.stringify(serializeCodexState(value))}</output>
      <output data-testid="invalid">{String(codexStateError(value))}</output>
    </>
  );
}
const draft = () => JSON.parse(screen.getByTestId('draft').textContent!);
const addModels = (models: string[]) => {
  const input = screen.getByRole('textbox', { name: 'codex_state.default_rule_models' });
  fireEvent.change(input, { target: { value: models.join(', ') } });
  fireEvent.keyDown(input, { key: 'Enter' });
};
const edit = (index: number) =>
  fireEvent.click(
    screen.getByRole('button', {
      name: `config_management.visual.common.edit: codex_state.override_rule ${index}`,
    })
  );
const clearSetting = (key: string, button: string) => {
  const field = screen
    .getByRole('textbox', { name: `codex_state.${key}` })
    .closest('.form-group')!.parentElement!;
  fireEvent.click(within(field).getByRole('button', { name: `codex_state.${button}` }));
};

describe('shared model default rules', () => {
  it('edits two multi-model defaults inside shared defaults without changing credential scope or fallback values', () => {
    render(
      <Fixture
        raw={{ 'cookie-acquisition-model': 'fallback', 'cookie-pool-group': 'fallback-group' }}
      />
    );
    const before = draft();
    const region = screen.getByRole('region', { name: 'codex_state.model_overrides' });
    expect(
      region.compareDocumentPosition(
        screen.getByRole('button', { name: 'codex_state.acquisition' })
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.override_add' }));
    expect(screen.getByTestId('invalid').textContent).toBe('true');
    addModels(modern);
    const source = screen.getByLabelText('codex_state.cookie-acquisition-model');
    source.focus();
    fireEvent.change(source, { target: { value: 'gpt-5.6-luna' } });
    expect(document.activeElement).toBe(source);
    clearSetting('cookie-pool-group', 'cookie_group_none');
    edit(1);
    expect(within(region).queryByText('codex_state.rule_custom')).toBeNull();
    expect(
      within(region).getByText('codex_state.cookie-acquisition-model: gpt-5.6-luna')
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'codex_state.override_add' }));
    addModels(['gpt-5.5']);
    clearSetting('cookie-acquisition-model', 'cookie_source_self');
    clearSetting('cookie-pool-group', 'cookie_group_none');
    expect(draft()['model-overrides']).toEqual([
      ...modern.map((model) => ({
        model,
        'cookie-acquisition-model': 'gpt-5.6-luna',
        'cookie-pool-group': '',
      })),
      { model: 'gpt-5.5', 'cookie-acquisition-model': '', 'cookie-pool-group': '' },
    ]);
    expect(draft().rules).toEqual(before.rules);
    expect(draft()['cookie-acquisition-model']).toBe('fallback');
    expect(draft()['cookie-pool-group']).toBe('fallback-group');
    expect(screen.getByTestId('invalid').textContent).toBe('false');
    const value = readCodexState(draft());
    expect(inheritedStateSettings(value, {}, 'gpt-6-astra')['cookie-acquisition-model']).toBe(
      'gpt-5.6-luna'
    );
    expect(
      inheritedStateSettings(value, { 'cookie-acquisition-model': 'special' }, 'gpt-6-astra')[
        'cookie-acquisition-model'
      ]
    ).toBe('special');
    expect(inheritedStateSettings(value, {}, 'gpt-5.5')['cookie-acquisition-model']).toBe('');
    expect(inheritedStateSettings(value, {}, 'another')['cookie-acquisition-model']).toBe(
      'fallback'
    );
  });

  it('preserves per-model criteria and unknown fields when grouping, editing, removing and round-tripping YAML', () => {
    const fields = {
      'cookie-acquisition-model': 'luna',
      lengths: [],
      'match-model': false,
      'cookie-backup-count': 0,
      extension: { keep: true },
    };
    const other = { model: 'different', ...fields, lengths: [312] };
    render(
      <Fixture
        raw={{ 'model-overrides': [...modern.map((model) => ({ model, ...fields })), other] }}
      />
    );
    expect(
      screen.getAllByRole('button', {
        name: /config_management.visual.common.edit: codex_state.override_rule/,
      })
    ).toHaveLength(2);
    edit(1);
    fireEvent.change(screen.getByLabelText('codex_state.cookie-pool-group'), {
      target: { value: 'modern' },
    });
    clearSetting('cookie-acquisition-model', 'rule_inherit');
    const expected = modern.map((model) => ({
      model,
      lengths: [],
      'match-model': false,
      'cookie-backup-count': 0,
      extension: { keep: true },
      'cookie-pool-group': 'modern',
    }));
    expect(draft()['model-overrides']).toEqual([...expected, other]);
    const doc = parseDocument('codex: {state-override: {future: keep}}');
    writeCodexState(doc, readCodexState(draft()));
    expect(doc.toJS().codex['state-override']).toMatchObject({
      future: 'keep',
      'model-overrides': [...expected, other],
    });
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.plan_remove 1' }));
    expect(draft()['model-overrides']).toEqual([other]);
  });

  it('rejects overlapping models and adds models only to the selected default group', () => {
    render(
      <Fixture
        raw={{
          'model-overrides': [
            { model: 'one', 'cookie-pool-group': 'first' },
            { model: 'two', 'cookie-pool-group': 'second' },
          ],
        }}
      />
    );
    edit(1);
    addModels(['two']);
    expect(screen.getByRole('alert').textContent).toContain('codex_state.override_duplicate');
    expect(draft()['model-overrides']).toHaveLength(2);
    addModels(['three']);
    expect(draft()['model-overrides']).toEqual([
      { model: 'one', 'cookie-pool-group': 'first' },
      { model: 'three', 'cookie-pool-group': 'first' },
      { model: 'two', 'cookie-pool-group': 'second' },
    ]);
  });

  it('reloads external defaults and retains invalid raw input without silently normalizing it', () => {
    const onChange = vi.fn();
    const props = { onChange, models: [], lengths: [], loadModels: vi.fn(), loading: false };
    const view = render(
      <StateModelOverridesEditor
        {...props}
        value={readCodexState({ 'model-overrides': [{ model: 'old' }] })}
      />
    );
    view.rerender(
      <StateModelOverridesEditor
        {...props}
        value={readCodexState({
          'model-overrides': [{ model: 'new', 'cookie-pool-group': 'group' }],
        })}
      />
    );
    expect(screen.queryByText('old')).toBeNull();
    expect(screen.getByText('new')).toBeTruthy();
    view.rerender(
      <StateModelOverridesEditor
        {...props}
        value={{ ...readCodexState({}), 'model-overrides': '{broken' }}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('codex_state.override_parse_error');
    expect(onChange).not.toHaveBeenCalled();
  });
});
