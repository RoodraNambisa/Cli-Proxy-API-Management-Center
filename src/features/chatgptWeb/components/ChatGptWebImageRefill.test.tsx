import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptWebImageRefill } from './ChatGptWebImageRefill';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'test' }), getAtConnection: mocks.get },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const props = {
  retries: '1',
  partial: false,
  onRetriesChange: vi.fn(),
  onPartialChange: vi.fn(),
  active: true,
  connectionKey: 'one',
};
describe('Web image refill settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: ['image_n_refill_delivery_v1'] });
  });
  it('enables edits only after support is confirmed', async () => {
    render(<ChatGptWebImageRefill {...props} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { value: '0' } });
    expect(props.onRetriesChange).toHaveBeenCalledWith('0');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(props.onPartialChange).toHaveBeenCalledWith(true);
  });
  it('rejects older capabilities and failed reads', async () => {
    mocks.get.mockResolvedValue({ features: ['image_n_parallel_v2'] });
    const view = render(<ChatGptWebImageRefill {...props} />);
    await screen.findByText('chatgpt_web.image_refill.unsupported');
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    mocks.get.mockRejectedValue({ status: 503 });
    view.rerender(<ChatGptWebImageRefill {...props} connectionKey="two" />);
    await screen.findByText('chatgpt_web.image_refill.error');
  });
  it('cancels old connection reads and ignores stale capability results', async () => {
    let resolve!: (v: unknown) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const view = render(<ChatGptWebImageRefill {...props} />);
    const signal = mocks.get.mock.calls[0][2].signal as AbortSignal;
    mocks.get.mockResolvedValue({ features: [] });
    view.rerender(<ChatGptWebImageRefill {...props} connectionKey="two" />);
    expect(signal.aborted).toBe(true);
    await screen.findByText('chatgpt_web.image_refill.unsupported');
    await act(async () => resolve({ features: ['image_n_refill_delivery_v1'] }));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
  });
});
