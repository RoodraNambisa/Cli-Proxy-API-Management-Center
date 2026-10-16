import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyIPPanel } from './ProxyIPPanel';
import { proxyIPDefaults } from './settings';
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  status: vi.fn(),
  preview: vi.fn(),
  generation: 1,
}));
const t = vi.hoisted(() => (key: string) => key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
vi.mock('@/stores', () => ({
  useAuthStore: (select: (v: unknown) => unknown) =>
    select({
      connectionStatus: 'connected',
      apiBase: 'https://test',
      connectionGeneration: mock.generation,
    }),
}));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ generation: mock.generation }) },
}));
vi.mock('@/services/api/proxyIp', () => ({ proxyIPApi: mock }));
const ready = () =>
  waitFor(() =>
    expect(
      (screen.getByLabelText('proxy_ip.refresh-mode') as HTMLSelectElement).closest('fieldset')
        ?.disabled
    ).toBe(false)
  );
describe('Proxy IP shared settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.generation = 1;
    mock.get.mockResolvedValue({
      config: proxyIPDefaults,
      capabilities: { proxy_ip: true, region_lifecycle: true },
    });
    mock.save.mockResolvedValue({});
    mock.status.mockResolvedValue({ entries: [], route_count: 0, ip_count: 0 });
  });
  it('saves only chosen metadata policy without changing pool intervals', async () => {
    render(<ProxyIPPanel />);
    await ready();
    fireEvent.change(screen.getByLabelText('proxy_ip.refresh-mode'), {
      target: { value: 'scheduled' },
    });
    fireEvent.change(screen.getByLabelText('proxy_ip.cold-cache-mode'), {
      target: { value: 'wait' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith(
        expect.anything(),
        { 'refresh-mode': 'scheduled', 'cold-cache-mode': 'wait' },
        expect.any(AbortSignal)
      )
    );
    expect(mock.preview).not.toHaveBeenCalled();
  });
  it('groups the two initial-cache policies under lazy refresh', async () => {
    render(<ProxyIPPanel />);
    await ready();
    expect(screen.getByLabelText('proxy_ip.lazy_initial')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'proxy_ip.lazy_wait' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('proxy_ip.lazy_initial'), { target: { value: 'wait' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(mock.save).toHaveBeenCalledWith(
        expect.anything(),
        { 'cold-cache-mode': 'wait' },
        expect.any(AbortSignal)
      )
    );
    fireEvent.change(screen.getByLabelText('proxy_ip.refresh-mode'), {
      target: { value: 'scheduled' },
    });
    expect(screen.queryByLabelText('proxy_ip.lazy_initial')).toBeNull();
    expect(screen.getByLabelText('proxy_ip.cold-cache-mode')).toBeTruthy();
  });
  it('ignores stale connection responses', async () => {
    let finish!: (v: unknown) => void;
    mock.get.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        })
    );
    const view = render(<ProxyIPPanel />);
    await waitFor(() => expect(mock.get).toHaveBeenCalledTimes(1));
    const signal = mock.get.mock.calls[0][1] as AbortSignal;
    mock.generation = 2;
    view.rerender(<ProxyIPPanel />);
    await ready();
    await act(async () =>
      finish({
        config: { ...proxyIPDefaults, 'ip-cache-size': 1 },
        capabilities: { proxy_ip: true, region_lifecycle: true },
      })
    );
    expect(signal.aborted).toBe(true);
    expect((screen.getByLabelText('proxy_ip.ip-cache-size') as HTMLInputElement).value).toBe(
      '100000'
    );
  });
  it('blocks unsupported backends', async () => {
    mock.get.mockRejectedValue({ status: 404 });
    render(<ProxyIPPanel />);
    await screen.findByRole('alert');
    expect(
      (screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
  it('does not mislabel temporary failures as missing backend support', async () => {
    mock.get.mockRejectedValue({ status: 503 });
    render(<ProxyIPPanel />);
    await screen.findByText('proxy_ip.failed');
    expect(screen.queryByText('proxy_ip.upgrade')).toBeNull();
  });
});
