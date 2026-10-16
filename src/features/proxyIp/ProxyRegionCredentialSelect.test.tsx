import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyRegionCredentialSelect } from './ProxyRegionCredentialSelect';
import type { ApiClientConnectionSnapshot } from '@/services/api/client';
const lookup = vi.hoisted(() => vi.fn());
const t = vi.hoisted(() => (key: string) => key);
vi.mock('@/services/api/proxyIp', () => ({ proxyIPApi: { credentials: lookup } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
const connection = { apiBase: 'https://one' } as ApiClientConnectionSnapshot;
const result = (name = 'bound') => ({
  credentials: [{ name, auth_id: name, auth_index: name, provider: 'codex', bound: true }],
  pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
});
describe('region credential selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockResolvedValue(result());
  });
  it('defaults to bound credentials and sends filtering to the backend', async () => {
    const changed = vi.fn();
    render(<ProxyRegionCredentialSelect connection={connection} value="" onChange={changed} />);
    await screen.findByRole('option', { name: 'bound' });
    expect(lookup).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ scope: 'bound', page_size: 20 }),
      expect.any(AbortSignal)
    );
    fireEvent.change(screen.getByLabelText('region_status.filter'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('region_status.search'), {
      target: { value: 'canada' },
    });
    await waitFor(() =>
      expect(lookup).toHaveBeenLastCalledWith(
        connection,
        expect.objectContaining({ scope: 'all', search: 'canada', page: 1 }),
        expect.any(AbortSignal)
      )
    );
    expect(changed).toHaveBeenCalledWith('');
  });
  it('ignores a late result after changing connections', async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(
      <ProxyRegionCredentialSelect connection={connection} value="" onChange={() => {}} />
    );
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    const signal = lookup.mock.calls[0][2] as AbortSignal;
    view.rerender(
      <ProxyRegionCredentialSelect
        connection={{ apiBase: 'https://two' } as ApiClientConnectionSnapshot}
        value=""
        onChange={() => {}}
      />
    );
    await screen.findByRole('option', { name: 'bound' });
    await act(async () => finish(result('stale')));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('option', { name: 'stale' })).toBeNull();
  });
  it('offers manual index input on old backends without listing all credentials', async () => {
    lookup.mockRejectedValue({ status: 404 });
    render(<ProxyRegionCredentialSelect connection={connection} value="" onChange={() => {}} />);
    await screen.findByLabelText('proxy_ip.auth_index');
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
