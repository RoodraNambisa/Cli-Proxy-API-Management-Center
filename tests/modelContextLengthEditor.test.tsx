import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { MAX_MODEL_CONTEXT_LENGTH } from '@/utils/modelContextLength';

const mocks = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));

test('context input enforces numeric bounds and keeps invalid values available for correction', () => {
  let current: ModelEntry[] = [];
  function Form() {
    const [entries, setEntries] = useState<ModelEntry[]>([{ name: 'upstream', alias: 'local', displayName: 'Label', future: 'keep' }]);
    return <ModelInputList showContextLength entries={entries} onChange={(next) => { current = next; setEntries(next); }} />;
  }
  render(<Form />);
  const input = screen.getByRole('spinbutton', { name: 'common.model_context_length_label 1' }) as HTMLInputElement;
  expect(input.min).toBe('0'); expect(input.max).toBe(String(MAX_MODEL_CONTEXT_LENGTH)); expect(input.step).toBe('1');
  for (const value of ['-1', '1.5', String(MAX_MODEL_CONTEXT_LENGTH + 1)]) {
    fireEvent.change(input, { target: { value } });
    expect(current[0].maxContextLength).toBe(Number(value));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('common.model_context_length_invalid')).toBeTruthy();
  }
  fireEvent.change(input, { target: { value: '1048576' } });
  expect(current[0]).toMatchObject({ name: 'upstream', alias: 'local', displayName: 'Label', future: 'keep', maxContextLength: 1048576 });
  expect(screen.queryByText('common.model_context_length_invalid')).toBeNull();
  fireEvent.change(input, { target: { value: '' } });
  expect(current[0].maxContextLength).toBeUndefined();
});

test('the control is shown only by integrated forms and follows their disabled state', () => {
  const props = { entries: [{ name: 'upstream', alias: 'local' }], onChange: vi.fn() };
  const view = render(<ModelInputList {...props} />);
  expect(screen.queryByRole('spinbutton')).toBeNull();
  view.rerender(<ModelInputList {...props} showContextLength disabled />);
  expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
});

test('each display name keeps its description beside the field when context controls are also visible', () => {
  render(<ModelInputList showDisplayName showContextLength entries={[
    { name: 'first', alias: 'first-alias' },
    { name: 'second', alias: 'second-alias' },
  ]} onChange={vi.fn()} />);
  const fields = screen.getAllByRole('textbox', { name: /common.model_display_name_label/ });
  const descriptions = fields.map((field) => {
    const description = document.getElementById(field.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('common.model_display_name_hint');
    expect(field.closest('.form-group')?.contains(description)).toBe(true);
    return description;
  });
  expect(descriptions[0]).not.toBe(descriptions[1]);
});
