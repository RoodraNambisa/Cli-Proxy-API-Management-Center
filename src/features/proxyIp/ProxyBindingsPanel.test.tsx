import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyBindingsPanel } from './ProxyBindingsPanel';
const mock = vi.hoisted(() => ({ page: vi.fn(), post: vi.fn(), generation: 1 }));
const t = vi.hoisted(() => (k: string) => k);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
vi.mock('@/stores', () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({
      apiBase: 'https://test',
      connectionGeneration: mock.generation,
      connectionStatus: 'connected',
    }),
  useNotificationStore: (select: (s: unknown) => unknown) => select({ showNotification: () => {} }),
}));
vi.mock('@/services/api/client', () => ({
  apiClient: {
    captureConnection: () => ({ generation: mock.generation }),
    postAtConnection: mock.post,
  },
}));
vi.mock('@/services/api/proxyPools', () => ({ proxyPoolsApi: { getBindingsPage: mock.page } }));
const row = (id: string) => ({
  auth_id: id,
  auth_index: id,
  name: id + '.json',
  provider: 'chatgpt-web',
  binding_id: 'binding-' + id,
  healthy: true,
  ip: '203.0.113.2',
  pool: 'canada',
  entry: 'node',
  application: {
    kind: 'configuration_preview',
    evaluated_at: '2026-10-16T00:00:00Z',
    auth_disabled: false,
    timezone: {
      value: 'UTC',
      source: 'provider_settings',
      state: 'not_following',
      follow_proxy: false,
      proxy_value: 'America/Toronto',
      proxy_source: 'proxy_pool',
    },
    language: { value: 'en-CA', source: 'proxy_pool', state: 'ready', follow_proxy: true },
  },
});
const result = (id = 'a', page = 1) => ({
  bindings: [row(id)],
  pagination: { page, page_size: 50, total: 51, total_pages: 2 },
});
describe('binding region status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.generation = 1;
    mock.page.mockResolvedValue(result());
    mock.post.mockResolvedValue({ results: [] });
  });
  it('shows independent application states and saved proxy details without requesting inference', async () => {
    render(<ProxyBindingsPanel revision={0} onRebound={() => {}} />);
    await screen.findByText('UTC');
    expect(screen.getByText('region_status.states.not_following')).toBeTruthy();
    expect(screen.getByText('en-CA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'region_status.details' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('America/Toronto')).toBeTruthy();
    expect(within(dialog).getByText('region_status.actual_request_hint')).toBeTruthy();
    expect(mock.post).not.toHaveBeenCalled();
  });
  it('limits selection to the current page and discards old connection results', async () => {
    const view = render(<ProxyBindingsPanel revision={0} onRebound={() => {}} />);
    await screen.findByText('a.json');
    fireEvent.click(screen.getByLabelText('region_status.select_page'));
    mock.page.mockResolvedValueOnce(result('b', 2));
    fireEvent.click(screen.getByRole('button', { name: 'proxy_ip.next_page' }));
    await screen.findByText('b.json');
    expect(
      (screen.getByRole('button', { name: 'proxy_pools.rebind_selected' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    let finish!: (r: ReturnType<typeof result>) => void;
    mock.page.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        })
    );
    fireEvent.change(screen.getByLabelText('region_status.search'), { target: { value: 'old' } });
    await waitFor(() => expect(mock.page).toHaveBeenCalledTimes(3));
    mock.generation = 2;
    mock.page.mockResolvedValue(result('new'));
    view.rerender(<ProxyBindingsPanel revision={0} onRebound={() => {}} />);
    await screen.findByText('new.json');
    await act(async () => finish(result('stale')));
    expect(screen.queryByText('stale.json')).toBeNull();
  });
});
