import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ModelThinkingEditor } from '@/components/ui/ModelThinkingEditor';
import type { ModelThinking } from '@/types/modelThinking';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const renderEditor = (initial?: ModelThinking, disabled = false) => {
  const changes = vi.fn();
  function Fixture() {
    const [value, setValue] = useState(initial);
    return <ModelThinkingEditor value={value} index={0} disabled={disabled} onChange={(next) => { changes(next); setValue(next); }} />;
  }
  render(<Fixture />);
  return changes;
};

test('reasoning editor uses multiselect levels, constrained budgets and inherited defaults', () => {
  const changes = renderEditor();
  expect(screen.getByText('model_thinking.inherit')).toBeTruthy();
  fireEvent.click(screen.getByText('model_thinking.title 1'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: high' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: none' }));
  expect(changes.mock.lastCall?.[0]).toEqual({ levels: ['none', 'high'] });
  const zero = screen.getByRole('checkbox', { name: 'model_thinking.zero 1' }) as HTMLInputElement;
  expect(zero.checked).toBe(true);
  expect(zero.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: auto' }));
  const dynamic = screen.getByRole('checkbox', { name: 'model_thinking.dynamic 1' }) as HTMLInputElement;
  expect(dynamic.checked).toBe(true);
  expect(dynamic.disabled).toBe(true);
  const minimum = screen.getByRole('spinbutton', { name: 'model_thinking.min 1' }) as HTMLInputElement;
  const maximum = screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }) as HTMLInputElement;
  expect(minimum.min).toBe('0');
  expect(maximum.max).toBe('2147483647');
  expect(maximum.step).toBe('1');
  fireEvent.change(minimum, { target: { value: '100' } });
  expect(screen.getByRole('alert').textContent).toBe('model_thinking.invalid');
  fireEvent.change(maximum, { target: { value: '200' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(changes.mock.lastCall?.[0]).toMatchObject({ min: 100, max: 200 });
  fireEvent.click(screen.getByRole('button', { name: 'model_thinking.reset' }));
  expect(changes.mock.lastCall?.[0]).toBeUndefined();
  expect(screen.getByText('model_thinking.inherit')).toBeTruthy();
});

test('reasoning edits preserve unknown fields and raw source', () => {
  const source = { min: 10, max: 100, levels: [' HIGH ', 'auto'], future: { retain: true } };
  const before = JSON.stringify(source);
  const changes = renderEditor(source);
  const high = screen.getByRole('checkbox', { name: 'model_thinking.levels 1: high' }) as HTMLInputElement;
  expect(high.checked).toBe(true);
  fireEvent.click(high);
  expect(changes.mock.lastCall?.[0]).toMatchObject({ levels: ['auto'], future: { retain: true } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }), { target: { value: '50000' } });
  expect(JSON.stringify(source)).toBe(before);
});

test('readonly reasoning controls cannot alter declarations', () => {
  const changes = renderEditor({ levels: ['high'] }, true);
  for (const input of screen.getAllByRole('checkbox')) expect((input as HTMLInputElement).disabled).toBe(true);
  for (const input of screen.getAllByRole('spinbutton')) expect((input as HTMLInputElement).disabled).toBe(true);
  const reset = screen.getByRole('button', { name: 'model_thinking.reset' }) as HTMLButtonElement;
  expect(reset.disabled).toBe(true);
  fireEvent.click(reset);
  expect(changes).not.toHaveBeenCalled();
});

test('all four locales contain complete reasoning capability controls and explanations', () => {
  for (const locale of [en, ru, zhCN, zhTW]) {
    expect(Object.keys(locale.model_thinking)).toEqual(Object.keys(en.model_thinking));
    for (const value of Object.values(locale.model_thinking)) expect(value.trim()).not.toBe('');
  }
});
