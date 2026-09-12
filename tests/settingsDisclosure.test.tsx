import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { SettingsDisclosure } from '@/components/config/SettingsDisclosure';
import { ConfigFocusContext } from '@/components/config/configFocus';

beforeEach(() => localStorage.clear());

test('manual collapse works for dirty or focused sections, preserves drafts and repeated search reopens', () => {
  const content = (request: number) => <ConfigFocusContext.Provider value={request}>
    <SettingsDisclosure id="rules" title="Rules" dirty focusTarget="rule-code" targetIds={['rule-code']}>
      <input aria-label="Draft" defaultValue="" />
    </SettingsDisclosure>
  </ConfigFocusContext.Provider>;
  const view = render(content(1));
  const toggle = screen.getByRole('button', { name: /Rules/ });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsaved' } });
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(content(1));
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(content(2));
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('unsaved');
});

test('unopened sections stay unmounted and a new validation error opens them', () => {
  const content = (errorCount: number) => <SettingsDisclosure id="rules" title="Rules" errorCount={errorCount}><input aria-label="Draft" /></SettingsDisclosure>;
  const view = render(content(0));
  expect(screen.queryByLabelText('Draft')).toBeNull();
  view.rerender(content(1));
  expect(screen.getByRole('textbox')).toBeTruthy();
  const toggle = screen.getByRole('button', { name: /Rules/ });
  fireEvent.click(toggle);
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(content(2));
  expect(screen.getByRole('textbox')).toBeTruthy();
});

test('searching another section does not reopen a manually collapsed dirty section', () => {
  const content = (request: number, focusTarget: string) => <ConfigFocusContext.Provider value={request}>
    <SettingsDisclosure id="rules" title="Rules" dirty focusTarget={focusTarget}><input aria-label="Draft" /></SettingsDisclosure>
  </ConfigFocusContext.Provider>;
  const view = render(content(1, 'rules'));
  fireEvent.click(screen.getByRole('button', { name: /Rules/ }));
  view.rerender(content(2, 'another-section'));
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(content(3, 'rules'));
  expect(screen.getByRole('textbox')).toBeTruthy();
});
