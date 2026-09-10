import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { CONFIG_SEARCH_DEFINITIONS } from '@/components/config/configCatalog';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));

test('selects known modalities, distinguishes text-only, and clears back to inheritance', () => {
  let current: ModelEntry[] = [];
  function Form() {
    const [entries, setEntries] = useState<ModelEntry[]>([{ name: 'upstream', alias: 'local', future: 'kept' }]);
    return <ModelInputList showInputModalities entries={entries} onChange={(next) => { current = next; setEntries(next); }} />;
  }
  render(<Form />);
  expect(screen.getByText('model_input_modalities.inherit')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.text' }));
  expect(current[0]).toMatchObject({ inputModalities: ['text'], future: 'kept' });
  expect(screen.getByText('model_input_modalities.text_only')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.image' }));
  expect(current[0].inputModalities).toEqual(['text', 'image']);
  expect(screen.getByText('model_input_modalities.declared')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'model_input_modalities.reset' }));
  expect(current[0].inputModalities).toBeUndefined();
  expect(screen.getByText('model_input_modalities.inherit')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.audio' }));
  expect(current[0].inputModalities).toEqual(['audio']);
  expect(screen.queryByText('model_input_modalities.text_only')).toBeNull();
});

test('only opted-in forms show the control, and disabled forms cannot edit it', () => {
  const props = { entries: [{ name: 'upstream', alias: '' }], onChange: vi.fn() };
  const { rerender } = render(<ModelInputList {...props} />);
  expect(screen.queryByRole('checkbox')).toBeNull();
  rerender(<ModelInputList {...props} showInputModalities disabled />);
  const choices = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(choices).toHaveLength(4);
  expect(choices.every((choice) => choice.disabled)).toBe(true);
});

test('supports configuration search and four complete explanations', () => {
  expect(CONFIG_SEARCH_DEFINITIONS.some((entry) => entry.yamlKeys?.includes('openai-compatibility[].models[].input-modalities'))).toBe(true);
  for (const locale of [en, ru, zhCN, zhTW]) {
    expect(Object.keys(locale.model_input_modalities).sort()).toEqual(Object.keys(en.model_input_modalities).sort());
    expect(locale.model_input_modalities.hint).toContain('input-modalities');
    expect(Object.values(locale.model_input_modalities).every(Boolean)).toBe(true);
  }
});
