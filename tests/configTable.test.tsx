import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ConfigTable, ConfigTableRow } from '@/components/config/ConfigTable';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { apiKeysApi } from '@/services/api/apiKeys';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

test('collapses rule editors without losing their input drafts or mounting untouched rows', () => {
  const renderTable = (order: string[]) => <ConfigTable label="Rules" columns={['Rule', 'Actions']}>
    {order.map((title) => <ConfigTableRow key={title} title={title} cells={[title]} labels={['Rule']}>
      <input aria-label={`Draft ${title}`} defaultValue="" />
    </ConfigTableRow>)}
  </ConfigTable>;
  const view = render(renderTable(['A', 'B']));
  const toggle = screen.getByRole('button', { name: /: A$/ });
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(toggle);
  fireEvent.change(screen.getByLabelText('Draft A'), { target: { value: 'unsaved value' } });
  fireEvent.click(toggle);
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(renderTable(['B', 'A']));
  fireEvent.click(screen.getByRole('button', { name: /: A$/ }));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('unsaved value');
  expect(screen.queryByLabelText('Draft B')).toBeNull();
});

test('API keys summarize access in rows and keep unfinished restriction drafts on collapse', async () => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: ['fixture-secret'], namesSupported: true,
    groups: [{ apiKey: 'fixture-secret', providers: ['codex'], allowedPriorities: [4], excludedPriorities: [1] }],
    availablePriorities: [0, 1, 4], lastUsed: { 'fixture-secret': '2026-09-12T08:00:00Z' } });
  const save = vi.spyOn(apiKeysApi, 'updatePriorities').mockResolvedValue({ status: 'ok' });
  const change = vi.fn();
  render(<ApiKeysCardEditor value="fixture-secret" names={{ 'fixture-secret': 'Work' }} onChange={change} />);
  const table = screen.getByRole('table');
  await within(table).findByText('Codex');
  expect(table.textContent).toContain('Work');
  expect(table.textContent).not.toContain('fixture-secret');
  expect(table.querySelector('time')?.dateTime).toBe('2026-09-12T08:00:00Z');
  expect(screen.queryByRole('checkbox')).toBeNull();
  const toggle = screen.getByRole('button', { name: /restrictions: Work/ });
  fireEvent.click(toggle);
  const group = screen.getByRole('group', { name: /priority_allowed$/ });
  fireEvent.change(within(group).getByRole('spinbutton'), { target: { value: '-3' } });
  fireEvent.click(toggle);
  expect(screen.queryByRole('spinbutton')).toBeNull();
  fireEvent.click(toggle);
  expect((within(group).getByRole('spinbutton') as HTMLInputElement).value).toBe('-3');
  fireEvent.click(within(group).getByRole('button'));
  await waitFor(() => expect(save).toHaveBeenCalledWith('fixture-secret', 'allowedPriorities', [4, -3]));
  expect(change).not.toHaveBeenCalled();
});
