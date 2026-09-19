import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { CodexStateEditor } from '@/components/config/CodexStateEditor';
import { authFilesApi } from '@/services/api/authFiles';
import {
  codexStateError,
  migrateCodexStateRules,
  readCodexState,
  serializeCodexState,
  writeCodexState,
} from '@/utils/codexStateOverride';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
function Fixture({ raw = {} }: { raw?: Record<string, unknown> }) {
  const [value, setValue] = useState(readCodexState(raw));
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
const draft = () => JSON.parse(screen.getByTestId('draft').textContent!);
describe('independent State rules', () => {
  it('converts legacy OR matching without changing defaults or explicit no-limit lengths', () => {
    const old = readCodexState({
      enabled: true,
      priorities: [4],
      'included-credentials': ['special'],
      'excluded-credentials': ['excluded'],
      models: ['astra'],
      lengths: [],
      'model-overrides': [{ model: 'astra', prompt: 'custom' }],
    });
    const converted = migrateCodexStateRules(old);
    expect(converted.rules).toHaveLength(2);
    expect(converted.rules![0]).toMatchObject({
      priorities: [4],
      credentials: [],
      models: ['astra'],
      'excluded-credentials': ['excluded'],
    });
    expect(converted.rules![1]).toMatchObject({
      priorities: [],
      credentials: ['special'],
      models: ['astra'],
    });
    expect(converted.rules![0].id).not.toBe(converted.rules![1].id);
    expect(codexStateError(converted)).toBe(false);
    const doc = parseDocument('codex: {state-override: {unknown: keep}}');
    writeCodexState(doc, converted);
    const reread = readCodexState(doc.toJS().codex['state-override']);
    expect(reread.rules).toEqual(converted.rules);
    expect(reread.lengths).toBe('');
    expect(reread['model-overrides']).toBe(converted['model-overrides']);
    expect(doc.toJS().codex['state-override'].unknown).toBe('keep');
    const empty = { ...converted, rules: [] };
    writeCodexState(doc, empty);
    expect(readCodexState(doc.toJS().codex['state-override']).rules).toEqual([]);
  });
  it('edits, copies, reorders and removes independent rules with inherit/false/empty preserved', () => {
    render(<Fixture raw={{ enabled: true, rules: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_add' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'codex_state.rule_name' }), {
      target: { value: 'Priority 4' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'codex_state.priorities' }), {
      target: { value: '4' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'codex_state.priorities' }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_lengths' }));
    fireEvent.click(screen.getByRole('option', { name: 'codex_state.rule_lengths_any' }));
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.match-model' }));
    fireEvent.click(screen.getByRole('option', { name: 'codex_state.rule_bool_false' }));
    expect(draft().rules[0]).toMatchObject({
      priorities: [4],
      settings: { lengths: [], 'match-model': false },
    });
    const first = draft().rules[0].id;
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_copy' }));
    expect(draft().rules).toHaveLength(2);
    expect(draft().rules[1].id).not.toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_up 2' }));
    expect(draft().rules[1].id).toBe(first);
    fireEvent.click(screen.getAllByRole('button', { name: 'codex_state.plan_remove' })[0]);
    expect(draft().rules).toHaveLength(1);
  });
  it('previews the unsaved draft without saving configuration', async () => {
    vi.spyOn(authFilesApi, 'getCodexStateOptions').mockResolvedValue({
      credentials: [
        { id: 'short', name: 'account.json', priority: 4, plan: 'pro', disabled: false },
      ],
      models: [{ id: 'alias', upstream_id: 'model' }],
      priorities: [4],
      plans: ['pro'],
    });
    const preview = vi
      .spyOn(authFilesApi, 'previewCodexState')
      .mockResolvedValue({
        managed: true,
        registered: true,
        upstream_model: 'model',
        match: {
          rule_id: 'rule',
          rule_name: 'Special',
          rule_index: 0,
          action: 'manage',
          sources: { lengths: 'rule' },
        },
        policy: { lengths: [332], 'retry-seconds': 60 },
      });
    render(
      <Fixture
        raw={{
          enabled: true,
          rules: [{ id: 'rule', name: 'Special', settings: { lengths: [332] } }],
        }}
      />
    );
    fireEvent.click(screen.getByText('codex_state.rule_preview', { selector: 'summary' }));
    await waitFor(() => expect(authFilesApi.getCodexStateOptions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_preview_credential' }));
    fireEvent.click(await screen.findByRole('option', { name: 'account.json' }));
    fireEvent.change(screen.getByLabelText('codex_state.rule_preview_model'), { target: { value: 'alias' } });
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.rule_preview_run' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(preview.mock.calls[0].slice(0, 3)).toEqual(['short', 'alias', draft()]);
    expect(await screen.findByText('codex_state.rule_matched: Special')).toBeTruthy();
  });
});
