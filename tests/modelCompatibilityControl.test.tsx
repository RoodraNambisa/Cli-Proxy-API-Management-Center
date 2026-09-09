import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

test('compatibility switch defaults off and edits only the selected model', () => {
  const original: ModelEntry[] = [{ name: 'first', alias: '', thinking: { levels: [] }, future: { keep: true } }, { name: 'second', alias: 'alias', isCompat: true }];
  const changes = vi.fn();
  function Fixture() {
    const [entries, setEntries] = useState(original);
    return <ModelInputList entries={entries} showCompatibility onChange={(next) => { changes(next); setEntries(next); }} />;
  }
  render(<Fixture />);
  const first = screen.getByRole('checkbox', { name: 'model_compatibility.label 1' }) as HTMLInputElement;
  const second = screen.getByRole('checkbox', { name: 'model_compatibility.label 2' }) as HTMLInputElement;
  expect(first.checked).toBe(false);
  expect(second.checked).toBe(true);
  fireEvent.click(first);
  expect(changes.mock.lastCall?.[0]).toEqual([{ ...original[0], isCompat: true }, original[1]]);
  fireEvent.click(first);
  expect(changes.mock.lastCall?.[0]).toEqual([{ ...original[0], isCompat: false }, original[1]]);
  expect(original[0]).not.toHaveProperty('isCompat');
});

test('unused and readonly compatibility controls do not change model declarations', () => {
  const onChange = vi.fn();
  const view = render(<ModelInputList entries={[{ name: 'model', alias: '' }]} onChange={onChange} />);
  expect(screen.queryByRole('checkbox')).toBeNull();
  view.rerender(<ModelInputList entries={[{ name: 'model', alias: '', isCompat: true }]} disabled showCompatibility onChange={onChange} />);
  expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

test.each([en, ru, zhCN, zhTW])('compatibility labels explain the field and defaults in every locale', (locale) => {
  expect(locale.model_compatibility.label.trim()).not.toBe('');
  expect(locale.model_compatibility.hint).toContain('is-compat');
});
