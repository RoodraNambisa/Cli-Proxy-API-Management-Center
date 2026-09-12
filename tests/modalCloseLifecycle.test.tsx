import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Modal } from '@/components/ui/Modal';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.useRealTimers());

test('an immediate close survives the pending opening microtask', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  render(<Modal open onClose={close} title="Details">Content</Modal>);
  fireEvent.keyDown(document, { key: 'Escape' });
  await act(async () => { await Promise.resolve(); vi.runAllTimers(); });
  expect(close).toHaveBeenCalledTimes(1);
});

test('parent updates do not cancel closing and the latest callback is used', async () => {
  vi.useFakeTimers();
  const first = vi.fn();
  const next = vi.fn();
  const view = render(<Modal open onClose={first} title="Details">Content</Modal>);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
  view.rerender(<Modal open onClose={next} title="Details">Updated content</Modal>);
  await act(async () => { vi.runAllTimers(); });
  expect(first).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
});

test('reopening cancels an old controlled close', async () => {
  vi.useFakeTimers();
  const close = vi.fn();
  const view = render(<Modal open onClose={close} title="Details">Content</Modal>);
  await act(async () => { await Promise.resolve(); });
  view.rerender(<Modal open={false} onClose={close} title="Details">Content</Modal>);
  await act(async () => { await Promise.resolve(); });
  view.rerender(<Modal open onClose={close} title="Details">Content</Modal>);
  await act(async () => { await Promise.resolve(); vi.runAllTimers(); });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('collapsed rule inputs do not let keyboard focus escape the dialog', async () => {
  render(<Modal open onClose={vi.fn()} title="Details">
    <button>Last visible action</button>
    <div hidden><input aria-label="Collapsed rule" /></div>
    <fieldset disabled><input aria-label="Disabled rule" /></fieldset>
  </Modal>);
  await act(async () => { await Promise.resolve(); });
  const last = screen.getByRole('button', { name: 'Last visible action' });
  last.focus();
  expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'common.close' }));
});
