import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyPoolsPage } from './ProxyPoolsPage';
import { proxyPoolsApi } from '@/services/api';
import { useAuthStore } from '@/stores';
import i18n from '@/i18n';

vi.mock('@/services/api', async (original) => ({
  ...(await original<typeof import('@/services/api')>()),
  proxyPoolsApi: {
    getPools: vi.fn().mockResolvedValue([
      {
        name: 'test-pool',
        entries: [{ id: 'existing', 'url-template': 'http://proxy.example:80' }],
      },
    ]),
    getRulesConfig: vi.fn().mockResolvedValue({ rules: [], schemaVersion: 2 }),
    getBindings: vi.fn().mockResolvedValue([]),
    getPoolStatus: vi.fn().mockResolvedValue({ name: 'test-pool', binding_count: 0 }),
    getCheckTasks: vi.fn().mockResolvedValue([]),
    getHealthCheck: vi.fn().mockRejectedValue({ status: 404 }),
    createPool: vi.fn().mockResolvedValue({}),
    updatePool: vi.fn().mockResolvedValue({}),
  },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  useAuthStore.setState({ connectionStatus: 'connected' });
});
afterEach(() => {
  useAuthStore.setState({ connectionStatus: 'disconnected' });
});

describe('proxy pool import integration', () => {
  it('imports into a new pool draft, then persists only after Save', async () => {
    render(<ProxyPoolsPage />);
    await screen.findByText('test-pool');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('proxy_pools.add_pool') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(i18n.t('proxy_pools.pool_name')), {
      target: { value: 'imported' },
    });
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Remember proxy node in credentials' })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bulk import' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Proxy list to import' }), {
      target: { value: '192.0.2.10:1080:user:pw\n192.0.2.11:1080:user:pw' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 entries' }));
    expect(proxyPoolsApi.createPool).not.toHaveBeenCalled();
    expect(
      within(dialog)
        .getAllByLabelText(i18n.t('proxy_pools.entry_id'))
        .map((el) => (el as HTMLInputElement).value)
    ).toEqual(['proxy-001', 'proxy-002']);
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('common.save') }));
    await waitFor(() =>
      expect(proxyPoolsApi.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'imported',
          'remember-credential-binding': true,
          entries: [
            {
              id: 'proxy-001',
              'url-template': 'socks5://user:pw@192.0.2.10:1080',
              ports: undefined,
            },
            {
              id: 'proxy-002',
              'url-template': 'socks5://user:pw@192.0.2.11:1080',
              ports: undefined,
            },
          ],
        })
      )
    );
  });

  it('opens a copy dialog directly from the pool card without saving changes', async () => {
    render(<ProxyPoolsPage />);
    await screen.findByText('test-pool');
    fireEvent.click(screen.getByRole('button', { name: 'Bulk copy' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      (within(dialog).getByRole('textbox', { name: 'Proxy list to copy' }) as HTMLTextAreaElement)
        .value
    ).toBe('http://proxy.example:80');
    expect(proxyPoolsApi.updatePool).not.toHaveBeenCalled();
  });
});
