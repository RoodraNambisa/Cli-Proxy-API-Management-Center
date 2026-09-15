import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { GrokConfigEditor } from '@/components/config/GrokConfigEditor';
import { ConfigFocusContext } from '@/components/config/configFocus';
import { DEFAULT_GROK_CONFIG, type GrokVisualConfig } from '@/types/grok';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => localStorage.clear());

function Harness() {
  const [value, setValue] = useState<GrokVisualConfig>(DEFAULT_GROK_CONFIG);
  return <GrokConfigEditor value={value} baselineValue={DEFAULT_GROK_CONFIG} onChange={setValue} />;
}

test('keeps configuration drafts across collapsing and remembers the section preference', () => {
  const view = render(<Harness />);
  const label = 'config_management.grok.headers';
  const inputLabel = 'config_management.grok.userAgent';
  const toggle = screen.getByRole('button', { name: new RegExp(label) });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('textbox', { name: inputLabel })).toBeNull();
  fireEvent.click(toggle);
  fireEvent.change(screen.getByRole('textbox', { name: inputLabel }), {
    target: { value: 'client-draft/1' },
  });
  fireEvent.click(toggle);
  expect(screen.queryByRole('textbox', { name: inputLabel })).toBeNull();
  expect(localStorage.getItem('config-management:config-grok-headers-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect((screen.getByRole('textbox', { name: inputLabel }) as HTMLInputElement).value).toBe(
    'client-draft/1'
  );
  view.unmount();
  render(<Harness />);
  expect(
    screen.getByRole('button', { name: new RegExp(label) }).getAttribute('aria-expanded')
  ).toBe('true');
});

test('opens search targets again after a manual collapse without opening unrelated groups', () => {
  const content = (request: number, focusTarget: string) => (
    <ConfigFocusContext.Provider value={request}>
      <GrokConfigEditor
        value={DEFAULT_GROK_CONFIG}
        baselineValue={DEFAULT_GROK_CONFIG}
        onChange={vi.fn()}
        focusTarget={focusTarget}
      />
    </ConfigFocusContext.Provider>
  );
  const view = render(content(1, 'config-grok-convergence'));
  const toggle = screen.getByRole('button', { name: 'config_management.grok.identity' });
  expect(screen.getByRole('checkbox', { name: 'config_management.grok.convergence' })).toBeTruthy();
  fireEvent.click(toggle);
  view.rerender(content(2, 'config-grok-parameters'));
  expect(screen.queryByRole('checkbox', { name: 'config_management.grok.convergence' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'max_output_tokens' })).toBeTruthy();
  view.rerender(content(3, 'config-grok-convergence'));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
});

test('reveals validation errors even if the invalid group was saved collapsed', () => {
  localStorage.setItem('config-management:config-grok-identity-expanded', 'false');
  const value = { ...DEFAULT_GROK_CONFIG, convergence: true, poolSize: '65' };
  render(<GrokConfigEditor value={value} baselineValue={value} onChange={vi.fn()} />);
  expect(
    screen
      .getByRole('button', { name: /config_management.grok.identity/ })
      .getAttribute('aria-expanded')
  ).toBe('true');
  expect(screen.getByRole('spinbutton', { name: 'config_management.grok.poolSize' })).toBeTruthy();
  expect(screen.getByText('config_management.visual.validation.integer_range_1_64')).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: /config_management.grok.headers/ })
      .getAttribute('aria-expanded')
  ).toBe('false');
});

test('changes Chat protocol without resetting optional defaults or opening them automatically', () => {
  render(<Harness />);
  const defaults = screen.getByRole('button', { name: /config_management.grok.parameters/ });
  expect(defaults.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: /grok_upstream.title/ }));
  const protocol = screen.getByRole('button', { name: 'config_management.grok.chat_mode' });
  expect(protocol.textContent).toContain('config_management.grok.chat_mode_responses');
  fireEvent.click(protocol);
  fireEvent.click(screen.getByRole('option', { name: 'config_management.grok.chat_mode_direct' }));
  expect(protocol.textContent).toContain('config_management.grok.chat_mode_direct');
  expect(defaults.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(defaults);
  expect((screen.getByRole('textbox', { name: 'reasoning.effort' }) as HTMLInputElement).value).toBe('');
  expect(screen.getByText('config_management.grok.direct_search_hint')).toBeTruthy();
});
