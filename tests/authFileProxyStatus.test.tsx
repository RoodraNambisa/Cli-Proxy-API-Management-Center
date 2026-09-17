import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthFileProxyStatus } from '@/features/authFiles/components/AuthFileProxyStatus';
import { authFilesApi } from '@/services/api/authFiles';
import type { AuthFileItem, AuthFileProxyRoute } from '@/types/authFile';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; minutes?: number }) =>
      key === 'credential_proxy.limit_value' ? `${values?.count} / ${values?.minutes} min` : key,
  }),
}));
const route: AuthFileProxyRoute = {
  id: 'route-one',
  source: 'auth',
  mode: 'proxy',
  address: 'socks5h://proxy.example:1080',
};
const file: AuthFileItem = {
  name: 'chosen.json',
  provider: 'xai',
  proxy_route: route,
  request_limit: { limit: 10, window_minutes: 1, source: 'subscription', priority: 3, rule: 1 },
};

describe('credential proxy and effective request limits', () => {
  it('displays effective settings without network checks and preserves unknown IP', () => {
    const check = vi.spyOn(authFilesApi, 'checkProxy');
    render(<AuthFileProxyStatus file={file} disabled={false} />);
    expect(screen.getByText(route.address!)).toBeTruthy();
    expect(screen.getByText('credential_proxy.unchecked')).toBeTruthy();
    expect(screen.getByText('10 / 1 min')).toBeTruthy();
    expect(screen.getByText('credential_proxy.limit_sources.subscription #1')).toBeTruthy();
    expect(check).not.toHaveBeenCalled();
  });
  it('checks only on click and displays the egress IP and observation time', async () => {
    const check = vi.spyOn(authFilesApi, 'checkProxy').mockResolvedValue({
      proxy_route: {
        ...route,
        ip: '203.0.113.7',
        loc: 'JP',
        ok: true,
        checked_at: '2026-09-17T11:00:00Z',
      },
    });
    const view = render(<AuthFileProxyStatus file={file} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'credential_proxy.check: chosen.json' }));
    await screen.findByText('203.0.113.7 · JP');
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toBe('chosen.json');
    expect(screen.getByText(/credential_proxy.checked_at/)).toBeTruthy();
    view.rerender(
      <AuthFileProxyStatus
        file={{
          ...file,
          proxy_route: {
            ...route,
            ip: '203.0.113.8',
            checked_at: '2026-09-17T12:00:00Z',
            ok: true,
          },
        }}
        disabled={false}
      />
    );
    expect(screen.getByText('203.0.113.8')).toBeTruthy();
    expect(screen.queryByText('203.0.113.7 · JP')).toBeNull();
  });
  it('cancels and drops stale results after the credential route changes', async () => {
    let finish!: (result: { proxy_route: AuthFileProxyRoute }) => void;
    const check = vi.spyOn(authFilesApi, 'checkProxy').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(<AuthFileProxyStatus file={file} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'credential_proxy.check: chosen.json' }));
    view.rerender(
      <AuthFileProxyStatus
        file={{
          ...file,
          proxy_route: { ...route, id: 'route-two', address: 'http://other.example:8000' },
        }}
        disabled={false}
      />
    );
    expect(check.mock.calls[0][2].aborted).toBe(true);
    await act(async () => finish({ proxy_route: { ...route, ip: '203.0.113.7', ok: true } }));
    expect(screen.queryByText('203.0.113.7')).toBeNull();
    expect(screen.getByText('http://other.example:8000')).toBeTruthy();
  });
  it('does not claim a failed or browser-relay probe is a working server IP', async () => {
    vi.spyOn(authFilesApi, 'checkProxy').mockResolvedValue({
      proxy_route: { ...route, ip: '203.0.113.9', ok: false, error: 'request_failed' },
    });
    const view = render(<AuthFileProxyStatus file={file} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'credential_proxy.check: chosen.json' }));
    await screen.findByText('credential_proxy.failed');
    expect(screen.queryByText('203.0.113.9')).toBeNull();
    view.rerender(
      <AuthFileProxyStatus
        file={{ ...file, proxy_route: { ...route, id: 'relay', source: 'relay' } }}
        disabled={false}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('credential_proxy.relay')).toBeTruthy();
  });
  it('shows no local restriction when disabled and leaves old backends compatible', async () => {
    const view = render(
      <AuthFileProxyStatus file={{ name: 'old-backend.json' }} disabled={false} />
    );
    expect(screen.queryByText('credential_proxy.label')).toBeNull();
    view.rerender(
      <AuthFileProxyStatus
        file={{
          ...file,
          request_limit: { limit: 0, window_minutes: 5, source: 'priority', priority: 3 },
        }}
        disabled
      />
    );
    expect(screen.getByText('credential_proxy.unlimited')).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    );
  });
});
