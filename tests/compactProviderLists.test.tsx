import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CodexCustomModelsEditor, PayloadRulesEditor, PayloadFilterRulesEditor } from '@/components/config/VisualConfigEditorBlocks';
import { CODEX_CUSTOM_MODEL_GROUPS } from '@/types/config';
import type { CodexCustomModelVisualEntry, PayloadRule, PayloadFilterRule } from '@/types/visualConfig';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }),
}));

test('model summaries keep the form compact and retain group membership when renamed', () => {
  function Fixture() {
    const [value, setValue] = useState<CodexCustomModelVisualEntry[]>([{ clientId: 'm1', id: 'custom-model', displayName: 'Custom', groups: [CODEX_CUSTOM_MODEL_GROUPS[0]] }]);
    return <><CodexCustomModelsEditor value={value} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
  }
  render(<Fixture />);
  expect(screen.getByText('custom-model')).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /common.edit:/ }));
  fireEvent.change(screen.getByLabelText('config_management.visual.codex_custom_models.display_name'), { target: { value: 'Updated name' } });
  fireEvent.click(screen.getByRole('button', { name: /common.edit:/ }));
  expect(JSON.parse(screen.getByTestId('value').textContent!)[0]).toMatchObject({ id: 'custom-model', displayName: 'Updated name', groups: [CODEX_CUSTOM_MODEL_GROUPS[0]] });
});

test.each([false, true])('payload filter=%s keeps existing params while editing model matches', (filter) => {
  function Fixture() {
    const [rule, setRule] = useState<PayloadRule>({ id: 'r1', models: [{ id: 'm1', name: 'gpt-test', protocol: 'codex' }], params: [{ id: 'p1', path: 'temperature', value: '1', valueType: 'number' }] });
    const [filtered, setFiltered] = useState<PayloadFilterRule>({ id: 'f1', models: rule.models, params: ['metadata.secret'] });
    return <>{filter
      ? <PayloadFilterRulesEditor value={[filtered]} onChange={(next) => setFiltered(next[0])} />
      : <PayloadRulesEditor value={[rule]} onChange={(next) => setRule(next[0])} />}
      <output data-testid="value">{JSON.stringify(filter ? filtered : rule)}</output>
    </>;
  }
  render(<Fixture />);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /common.edit:/ }));
  fireEvent.change(screen.getByLabelText('config_management.visual.payload_rules.model_name'), { target: { value: 'updated-model' } });
  fireEvent.click(screen.getByRole('button', { name: /common.edit:/ }));
  const saved = JSON.parse(screen.getByTestId('value').textContent!);
  expect(saved.models[0]).toMatchObject({ name: 'updated-model', protocol: 'codex' });
  expect(saved.params).toEqual(filter ? ['metadata.secret'] : [{ id: 'p1', path: 'temperature', value: '1', valueType: 'number' }]);
});
