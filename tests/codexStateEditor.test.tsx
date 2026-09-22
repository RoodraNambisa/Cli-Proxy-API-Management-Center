import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { CodexStateEditor } from '@/components/config/CodexStateEditor';
import { StateValuePicker } from '@/components/config/StateValuePicker';
import { StateProxyCheck } from '@/components/config/StateProxyCheck';
import {
  readCodexState,
  writeCodexState,
  stateListItemError,
  type CodexStateOverride,
} from '@/utils/codexStateOverride';
import {
  authFilesApi,
  type CodexStateOptions,
  type CodexStateProxyResult,
} from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, options?: { value?: string }) =>
      options?.value ? `${key} ${options.value}` : key,
  }),
}));

const options: CodexStateOptions = {
  credentials: [
    {
      id: 'short-id',
      name: 'codex-demo.json',
      alias: 'test',
      priority: 3,
      plan: 'pro',
      disabled: false,
    },
  ],
  models: [
    { id: 'friendly-astra', upstream_id: 'gpt-6-astra' },
    { id: 'gpt-5.5', upstream_id: 'gpt-5.5' },
  ],
  priorities: [0, 3],
  plans: ['pro'],
};
function Editor({
  initial = {},
  change = () => {},
}: {
  initial?: Record<string, unknown>;
  change?: (v: CodexStateOverride) => void;
}) {
  const [value, setValue] = useState(readCodexState(initial));
  return (
    <CodexStateEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        change(next);
      }}
      strip={false}
      focusTarget="config-codex-state"
    />
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ apiBase: 'http://fixture', connectionGeneration: 1 });
});

describe('State selection and visual model rules', () => {
  it('validates explicit additions, accepts pasted lists and removes chips without CSV formatting', () => {
    const change = vi.fn();
    function Fixture() {
      const [value, setValue] = useState(['3']);
      return (
        <StateValuePicker
          label="priority"
          value={value}
          choices={[]}
          emptyLabel="empty"
          maxItems={128}
          validate={(v) => stateListItemError(v, 'priority')}
          onChange={(next) => {
            setValue(next);
            change(next);
          }}
        />
      );
    }
    render(<Fixture />);
    const input = screen.getByRole('textbox', { name: 'priority' });
    fireEvent.change(input, { target: { value: '3.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toContain('picker_invalid_priority');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '3，0, -1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith(['3', '0', '-1']);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.picker_remove 0' }));
    expect(change).toHaveBeenLastCalledWith(['3', '-1']);
  });

  it('loads current models on demand, shows aliases, preserves custom selections and stores short credential IDs', async () => {
    const fetch = vi.spyOn(authFilesApi, 'getCodexStateOptions').mockResolvedValue(options);
    const change = vi.fn();
    render(<Editor initial={{ models: ['custom-model'] }} change={change} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'codex_state.picker_choose: codex_state.models' })
    );
    const dialog = within(screen.getByRole('dialog'));
    const model = await dialog.findByRole('checkbox', { name: 'friendly-astra (friendly-astra)' });
    expect(dialog.getByText('codex_state.picker_upstream: gpt-6-astra')).toBeTruthy();
    fireEvent.change(dialog.getByRole('searchbox'), { target: { value: 'astra' } });
    fireEvent.click(model);
    fireEvent.click(dialog.getByRole('button', { name: 'common.confirm' }));
    expect(change.mock.lastCall?.[0].models).toBe('custom-model, friendly-astra');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'codex_state.picker_choose: codex_state.included-credentials',
      })
    );
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'test · codex-demo.json (short-id)' })
    );
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'codex_state.included-credentials' })).getByRole(
        'button',
        { name: 'common.confirm' }
      )
    );
    expect(change.mock.lastCall?.[0]['included-credentials']).toBe('short-id');
    const doc = parseDocument('{}');
    writeCodexState(doc, change.mock.lastCall![0]);
    expect(doc.toJS().codex['state-override'].models).toEqual(['custom-model', 'friendly-astra']);
    expect(doc.toJS().codex['state-override']['included-credentials']).toEqual(['short-id']);
  });

  it('edits model criteria visually while preserving empty overrides, inheritance and extension fields', () => {
    const change = vi.fn();
    render(
      <Editor
        initial={{
          'model-overrides': [
            {
              model: 'gpt-5.5',
              lengths: [],
              'match-model': false,
              'response-contains': '',
              prompt: 'custom prompt',
              extension: 'keep',
            },
          ],
        }}
        change={change}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'config_management.visual.common.edit: codex_state.override_rule 1',
      })
    );
    const controls = screen.getByRole('table', { name: 'codex_state.model_overrides' });
    fireEvent.change(within(controls).getByRole('textbox', { name: 'codex_state.prompt' }), {
      target: { value: 'new prompt' },
    });
    let rule = JSON.parse(change.mock.lastCall![0]['model-overrides'])[0];
    expect(rule).toMatchObject({
      lengths: [],
      'match-model': false,
      'response-contains': '',
      prompt: 'new prompt',
      extension: 'keep',
    });
    fireEvent.click(within(controls).getByLabelText('codex_state.match-model'));
    fireEvent.click(screen.getByRole('option', { name: 'codex_state.override_inherit' }));
    rule = JSON.parse(change.mock.lastCall![0]['model-overrides'])[0];
    expect(rule).not.toHaveProperty('match-model');
    expect(rule['response-contains']).toBe('');
    const doc = parseDocument('{}');
    writeCodexState(doc, change.mock.lastCall![0]);
    expect(doc.toJS().codex['state-override']['model-overrides'][0]).toEqual(rule);
  });

  it('does not discard malformed JSON and provides an optional raw editor', () => {
    const change = vi.fn();
    render(
      <CodexStateEditor
        value={{ ...readCodexState({}), 'model-overrides': '{broken' }}
        onChange={change}
        strip={false}
        focusTarget="config-codex-state"
      />
    );
    expect(screen.getByText('codex_state.override_parse_error')).toBeTruthy();
    fireEvent.click(screen.getByText('codex_state.override_json', { selector: 'summary' }));
    expect(
      (screen.getByRole('textbox', { name: 'codex_state.override_json' }) as HTMLTextAreaElement)
        .value
    ).toBe('{broken');
    expect(change).not.toHaveBeenCalled();
  });

  it('cancels stale option discovery when switching management connections', async () => {
    let resolve!: (v: CodexStateOptions) => void;
    const fetch = vi.spyOn(authFilesApi, 'getCodexStateOptions').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    render(<Editor />);
    fireEvent.click(
      screen.getByRole('button', { name: 'codex_state.picker_choose: codex_state.models' })
    );
    const signal = fetch.mock.calls[0][1];
    act(() => useAuthStore.setState({ connectionGeneration: 2 }));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(options);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('friendly-astra')).toBeNull();
  });
});

describe('State proxy test', () => {
  it('tests the unsaved template and reports exit metadata without touching config', async () => {
    const test = vi
      .spyOn(authFilesApi, 'checkCodexStateProxy')
      .mockResolvedValue({ ok: true, ip: '203.0.113.8', loc: 'TH', elapsed_ms: 123 });
    render(<StateProxyCheck proxyUrl="http://user-{12}:fixture@proxy.test:80" />);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.proxy_test' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('203.0.113.8'));
    expect(test.mock.calls[0][0]).toBe('http://user-{12}:fixture@proxy.test:80');
    expect(screen.getByRole('status').textContent).toContain('123 ms');
  });
  it('aborts and hides stale proxy results after the URL changes', async () => {
    let resolve!: (v: CodexStateProxyResult) => void;
    const test = vi.spyOn(authFilesApi, 'checkCodexStateProxy').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const view = render(<StateProxyCheck proxyUrl="http://old.test:80" />);
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.proxy_test' }));
    const signal = test.mock.calls[0][2];
    view.rerender(<StateProxyCheck proxyUrl="http://new.test:80" />);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve({ ok: true, ip: '203.0.113.8' });
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
