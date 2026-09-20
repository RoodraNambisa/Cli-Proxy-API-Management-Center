import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { CodexStateEditor } from '@/components/config/CodexStateEditor';
import { StateRuleSettingsEditor } from '@/components/config/StateRuleSettingsEditor';
import {
  codexStateError,
  readCodexState,
  serializeCodexState,
  writeCodexState,
} from '@/utils/codexStateOverride';
import { apiClient } from '@/services/api/client';
import { configFileApi } from '@/services/api/configFile';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('State retry rounds configuration', () => {
  it('keeps zero as an explicit disable and round-trips nested inheritance', () => {
    const value = readCodexState({
      'max-retry-rounds': 2,
      'retry-round-interval-minutes': 30,
      rules: [
        {
          id: 'p3',
          settings: { 'retry-round-interval-minutes': 60 },
          'model-overrides': [{ id: 'sol', models: ['sol'], settings: { 'max-retry-rounds': 0 } }],
        },
      ],
    });
    expect(codexStateError(value)).toBe(false);
    const doc = parseDocument('codex: {state-override: {}}');
    writeCodexState(doc, value);
    const read = readCodexState(doc.toJS().codex['state-override']);
    expect(serializeCodexState(read)).toEqual(serializeCodexState(value));
    read.rules![0]['model-overrides']![0].settings['max-retry-rounds'] = -1;
    expect(codexStateError(read)).toBe(true);
    expect(readCodexState({})['max-retry-rounds']).toBe('0');
  });
  it.each([
    ['max-retry-rounds', '11'],
    ['retry-round-interval-minutes', '1441'],
    ['retry-round-interval-minutes', '-1'],
  ])('rejects invalid %s', (field, input) => {
    const value = { ...readCodexState({}), [field]: input };
    expect(codexStateError(value)).toBe(true);
  });
  it('edits global delay and extra rounds without enabling the feature by default', () => {
    function Fixture() {
      const [value, setValue] = useState(readCodexState({}));
      return (
        <>
          <CodexStateEditor
            value={value}
            onChange={setValue}
            strip={false}
            focusTarget="config-codex-state"
          />
          <output data-testid="draft">{JSON.stringify(serializeCodexState(value))}</output>
        </>
      );
    }
    render(<Fixture />);
    expect(
      screen.getByRole('spinbutton', { name: 'codex_state.max-retry-rounds' }).getAttribute('min')
    ).toBe('0');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'codex_state.max-retry-rounds' }), {
      target: { value: '2' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'codex_state.retry-round-interval-minutes' }),
      { target: { value: '60' } }
    );
    expect(JSON.parse(screen.getByTestId('draft').textContent!)).toMatchObject({
      'max-retry-rounds': 2,
      'retry-round-interval-minutes': 60,
    });
  });
  it('restores per-rule inheritance separately from zero', () => {
    function Fixture() {
      const [settings, setSettings] = useState<Record<string, unknown>>({ 'max-retry-rounds': 0 });
      return (
        <>
          <StateRuleSettingsEditor
            settings={settings}
            inherited={readCodexState({ 'max-retry-rounds': 2 })}
            onChange={setSettings}
            lengths={[]}
          />
          <output data-testid="settings">{JSON.stringify(settings)}</output>
        </>
      );
    }
    render(<Fixture />);
    fireEvent.click(screen.getByText('codex_state.rule_advanced', { selector: 'summary' }));
    const input = screen.getByRole('spinbutton', { name: 'codex_state.max-retry-rounds' });
    expect((input as HTMLInputElement).value).toBe('0');
    fireEvent.change(input, { target: { value: '' } });
    expect(JSON.parse(screen.getByTestId('settings').textContent!)).toEqual({});
  });
  it('requires backend round support only when enabling retries, including nested overrides', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ features: { rule_model_overrides: true } });
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    await configFileApi.saveConfigYaml('codex: {state-override: {max-retry-rounds: 0}}');
    expect(get).not.toHaveBeenCalled();
    const content =
      'codex: {state-override: {rules: [{id: p3, model-overrides: [{id: sol, models: [sol], settings: {max-retry-rounds: 2}}]}]}}';
    await expect(configFileApi.saveConfigYaml(content)).rejects.toThrow();
    expect(put).toHaveBeenCalledTimes(1);
    get.mockResolvedValue({ features: { rule_model_overrides: true, state_retry_rounds: true } });
    await configFileApi.saveConfigYaml(content);
    expect(put).toHaveBeenCalledTimes(2);
  });
});
