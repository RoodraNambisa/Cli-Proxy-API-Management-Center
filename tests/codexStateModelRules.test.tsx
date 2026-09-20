import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { CodexStateRulesEditor } from '@/components/config/CodexStateRulesEditor';
import { mergeStateRules } from '@/utils/codexStateModelRules';
import {
  codexStateError,
  readCodexState,
  writeCodexState,
  serializeCodexState,
} from '@/utils/codexStateOverride';
import { configFileApi } from '@/services/api/configFile';
import { apiClient } from '@/services/api/client';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
const raw = {
  enabled: true,
  lengths: [292, 332],
  rules: [
    {
      id: 'sol',
      name: 'Sol',
      priorities: [3],
      models: ['sol'],
      settings: { 'match-model': false, 'invalidate-on-model-mismatch': false },
    },
    {
      id: 'all',
      name: 'Priority 3',
      priorities: [3],
      models: ['astra', 'sol', 'terra'],
      settings: {},
    },
  ],
};
const choices = {
  priorities: [],
  credentials: [],
  models: ['astra', 'sol', 'terra'].map((value) => ({ value, label: value })),
  plans: [],
  lengths: [{ value: '292', label: '292' }],
};
function Fixture({
  initial = raw,
  supported = true,
}: {
  initial?: Record<string, unknown>;
  supported?: boolean;
}) {
  const [value, setValue] = useState(readCodexState(initial));
  return (
    <>
      <CodexStateRulesEditor
        value={value}
        onChange={setValue}
        choices={choices}
        load={() => {}}
        loading={false}
        modelOverridesSupported={supported}
      />
      <output data-testid="draft">{JSON.stringify(serializeCodexState(value))}</output>
    </>
  );
}
const draft = () => JSON.parse(screen.getByTestId('draft').textContent!);

describe('State model overrides', () => {
  it('merges the actual two-switch exception and preserves first match and inheritance', () => {
    const rules = readCodexState(structuredClone(raw)).rules!;
    const result = mergeStateRules(rules[0], rules[1])!;
    expect(result.rule.settings).toEqual({});
    expect(result.rule.models).toEqual(['sol', 'astra', 'terra']);
    expect(result.rule['model-overrides']).toEqual([
      expect.objectContaining({
        models: ['sol'],
        settings: { 'match-model': false, 'invalidate-on-model-mismatch': false },
      }),
    ]);
    const value = { ...readCodexState(structuredClone(raw)), rules: [result.rule] };
    expect(codexStateError(value)).toBe(false);
    const doc = parseDocument('codex: {state-override: {future: keep}}');
    writeCodexState(doc, value);
    expect(readCodexState(doc.toJS().codex['state-override']).rules).toEqual(value.rules);
    expect(doc.toJS().codex['state-override'].future).toBe('keep');
  });
  it('does not turn an explicit equal value into inheritance during merge', () => {
    const rules = readCodexState(structuredClone(raw)).rules!;
    rules[0].settings.lengths = [292, 332];
    const result = mergeStateRules(rules[0], rules[1])!;
    expect(result.rule['model-overrides']![0].settings.lengths).toEqual([292, 332]);
    rules[1].priorities = [4];
    expect(mergeStateRules(rules[0], rules[1])).toBeUndefined();
    rules[1].priorities = [3];
    rules[1].models = [];
    expect(mergeStateRules(rules[0], rules[1])).toBeUndefined();
  });
  it('validates full inherited parameters and rejects overlaps without losing false or empty', () => {
    const value = readCodexState({
      rules: [
        {
          id: 'a',
          settings: { 'ttl-minutes': 90 },
          'model-overrides': [
            {
              id: 'sol',
              models: ['sol'],
              settings: {
                'match-model': false,
                lengths: [],
                'response-contains': '',
                'refresh-before-minutes': 80,
              },
            },
          ],
        },
      ],
    });
    expect(codexStateError(value)).toBe(false);
    value.rules![0]['model-overrides']!.push({ id: 'again', models: ['sol'], settings: {} });
    expect(codexStateError(value)).toBe(true);
    value.rules![0]['model-overrides']![1].enabled = false;
    expect(codexStateError(value)).toBe(false);
    value.rules![0]['model-overrides']![0].settings['refresh-before-minutes'] = 100;
    expect(codexStateError(value)).toBe(true);
  });
  it('previews before applying and only edits the unsaved draft', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.model_merge_next' }));
    expect(draft().rules).toHaveLength(2);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('codex_state.model_merge_before')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'codex_state.model_merge_apply' }));
    expect(draft().rules).toHaveLength(1);
    expect(draft().rules[0]['model-overrides'][0].settings['match-model']).toBe(false);
  });
  it('allows explicitly restoring equal lengths to inheritance in merge preview', () => {
    const initial = structuredClone(raw);
    Object.assign(initial.rules[0].settings, { lengths: [292, 332] });
    render(<Fixture initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.model_merge_next' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'codex_state.model_merge_inherit_lengths' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.model_merge_apply' }));
    expect(draft().rules[0]['model-overrides'][0].settings.lengths).toBeUndefined();
  });
  it('edits the two switches independently and restores inheritance', () => {
    const rules = readCodexState(structuredClone(raw)).rules!;
    const rule = mergeStateRules(rules[0], rules[1])!.rule;
    render(<Fixture initial={{ ...raw, rules: [rule] }} />);
    fireEvent.click(screen.getByRole('button', { name: /1\. Sol/ }));
    fireEvent.click(screen.getByRole('button', { name: /^solcodex_state/ }));
    const controls = screen.getAllByRole('button', {
      name: 'codex_state.invalidate-on-model-mismatch',
    });
    fireEvent.click(controls[controls.length - 1]);
    fireEvent.click(screen.getByRole('option', { name: 'codex_state.rule_bool_true' }));
    expect(draft().rules[0]['model-overrides'][0].settings).toEqual({
      'match-model': false,
      'invalidate-on-model-mismatch': true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.model_restore' }));
    expect(draft().rules[0]['model-overrides'][0].settings).toEqual({});
  });
  it('blocks creation and saving on backends without the capability', async () => {
    render(<Fixture supported={false} />);
    expect(
      screen.getByRole('button', { name: 'codex_state.model_merge_next' }).hasAttribute('disabled')
    ).toBe(true);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ features: {} }),
      put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const yaml =
      'codex: {state-override: {rules: [{id: a, model-overrides: [{id: sol, models: [sol], settings: {match-model: false}}]}]}}';
    await expect(configFileApi.saveConfigYaml(yaml)).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
    get.mockResolvedValue({ features: { rule_model_overrides: true } });
    await configFileApi.saveConfigYaml(yaml);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
