import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGptWebImageAggregation } from './ChatGptWebImageAggregation';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'test' }), getAtConnection: mocks.get },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const props = { value: '3', onChange: vi.fn(), connectionKey: 'a', active: true, enabled: true };
describe('Web aggregation control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ features: ['image_n_parallel_v1'] });
  });
  afterEach(cleanup);
  it('enables supported controls and propagates edits', async () => {
    render(<ChatGptWebImageAggregation {...props} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await waitFor(() => expect(input.disabled).toBe(false));
    fireEvent.change(input, { target: { value: '5' } });
    expect(props.onChange).toHaveBeenCalledWith('5');
  });
  it('disables unsupported and failed capability checks', async () => {
    mocks.get.mockResolvedValue({ features: [] });
    const view = render(<ChatGptWebImageAggregation {...props} />);
    await screen.findByText('chatgpt_web.n_aggregation.unsupported');
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
    mocks.get.mockRejectedValue({ status: 503 });
    view.rerender(<ChatGptWebImageAggregation {...props} connectionKey="b" />);
    await screen.findByText('chatgpt_web.n_aggregation.error');
  });
  it('aborts reads and ignores late replies after connection change', async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const view = render(<ChatGptWebImageAggregation {...props} />);
    const signal = mocks.get.mock.calls[0][2].signal as AbortSignal;
    mocks.get.mockResolvedValue({ features: [] });
    view.rerender(<ChatGptWebImageAggregation {...props} connectionKey="b" />);
    expect(signal.aborted).toBe(true);
    await screen.findByText('chatgpt_web.n_aggregation.unsupported');
    await act(async () => resolve({ features: ['image_n_parallel_v1'] }));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).disabled).toBe(true);
  });
});
