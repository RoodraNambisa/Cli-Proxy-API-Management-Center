import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), list: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (s: string) => s }) }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'fixture' }), postAtConnection: mocks.post },
}));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { listPaged: mocks.list } }));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
import { FillOrderModal } from './FillOrderModal';
const file = {
  name: 'account-c.json',
  priority: 5,
  fill_order: { record_id: 'record-c', joined_sequence: '9007199254740993', position: '3' },
  fill_order_revision: '7',
};
beforeEach(() => vi.clearAllMocks());
it('previews full-priority neighbors before committing with the original revision', async () => {
  const saved = vi.fn(),
    close = vi.fn();
  mocks.post.mockResolvedValue({
    record: { name: file.name },
    before: null,
    after: { name: 'account-a.json' },
    revision: '7',
  });
  render(<FillOrderModal file={file} onSaved={saved} onClose={close} />);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
  fireEvent.click(screen.getByText('fill_order.preview'));
  await screen.findByText('→ account-a.json');
  expect(saved).not.toHaveBeenCalled();
  expect(mocks.post.mock.calls[0][2]).toMatchObject({
    record_id: 'record-c',
    revision: '7',
    direction: 'up',
    steps: 2,
  });
  fireEvent.click(screen.getByText('fill_order.apply'));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.post.mock.calls[1][1]).toBe('/auth-files/fill-order/move');
});
it('reports a revision conflict and cancels an unmounted request', async () => {
  mocks.post.mockRejectedValue({ status: 409 });
  const view = render(<FillOrderModal file={file} onSaved={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByText('fill_order.preview'));
  await screen.findByText('fill_order.conflict');
  let resolve!: (v: unknown) => void;
  mocks.post.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  fireEvent.click(screen.getByText('fill_order.preview'));
  const signal = mocks.post.mock.calls[1][3].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({}));
});
