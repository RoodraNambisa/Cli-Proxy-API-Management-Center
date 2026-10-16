import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  connection: { apiBase: 'first', managementKey: 'test', timeout: 1000 },
}));
vi.mock('@/services/api/client', () => ({
  apiClient: {
    captureConnection: () => ({ ...mocks.connection }),
    getAtConnection: mocks.get,
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { ChatGptWebTLSSwitch } from './ChatGptWebTLSSwitch';

describe('ChatGPT Web TLS switch capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.apiBase = 'first';
  });
  afterEach(cleanup);
  const props = { enabled: true, connectionKey: 'first', active: true, onChange: vi.fn() };
  it('is disabled until verified and reports the selected mode', async () => {
    let resolve!: (data: unknown) => void;
    mocks.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const onChange = vi.fn();
    const view = render(<ChatGptWebTLSSwitch {...props} onChange={onChange} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    await act(async () => resolve({ features: ['tls_trust_anchors_v1'] }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(false);
    view.rerender(<ChatGptWebTLSSwitch {...props} enabled={false} />);
    expect(screen.getByRole('status').textContent).toContain('disabled_description');
  });
  it.each([{}, { features: [] }])('keeps unsupported backends disabled', async (data) => {
    mocks.get.mockResolvedValue(data);
    render(<ChatGptWebTLSSwitch {...props} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unsupported'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });
  it('reports loading failures without allowing edits', async () => {
    mocks.get.mockRejectedValue({ status: 500 });
    render(<ChatGptWebTLSSwitch {...props} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('.error'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });
  it('aborts old reads and ignores results from the previous connection', async () => {
    let first!: (data: unknown) => void, second!: (data: unknown) => void;
    mocks.get
      .mockReturnValueOnce(
        new Promise((r) => {
          first = r;
        })
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          second = r;
        })
      );
    const view = render(<ChatGptWebTLSSwitch {...props} />);
    const firstSignal = mocks.get.mock.calls[0][2].signal as AbortSignal;
    mocks.connection.apiBase = 'second';
    view.rerender(<ChatGptWebTLSSwitch {...props} connectionKey="second" />);
    expect(firstSignal.aborted).toBe(true);
    await act(async () => first({ features: ['tls_trust_anchors_v1'] }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    await act(async () => second({ features: [] }));
    expect(screen.getByRole('status').textContent).toContain('unsupported');
    const secondSignal = mocks.get.mock.calls[1][2].signal as AbortSignal;
    view.unmount();
    expect(secondSignal.aborted).toBe(true);
  });
});
