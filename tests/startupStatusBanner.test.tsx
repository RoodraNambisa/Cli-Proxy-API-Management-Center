import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { StartupStatusBanner } from '@/components/layout/StartupStatusBanner';
import { useStartupStatusStore } from '@/stores/useStartupStatusStore';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

describe('global startup status banner', () => {
  beforeEach(() => useStartupStatusStore.getState().reset());

  test('shows degraded issues without blocking the ready service', () => {
    useStartupStatusStore.setState({
      snapshot: {
        phase: 'ready',
        status: 'degraded',
        ready: true,
        degraded: true,
        started_at: null,
        updated_at: null,
        issues: [{ stage: 'auth_store_load', code: 'auth_records_skipped', severity: 'warning' }],
        stages: [],
      },
      support: 'supported',
    });

    render(
      <MemoryRouter>
        <StartupStatusBanner />
      </MemoryRouter>
    );
    const banner = screen.getByTestId('global-startup-status');
    expect(banner.getAttribute('data-status')).toBe('degraded');
    expect(screen.getByText('system_info.startup.issues.auth_records_skipped')).toBeTruthy();
    expect(screen.getByText('system_info.startup.view_details').getAttribute('href')).toBe(
      '/system'
    );
  });

  test('does not render for ready or unsupported backends', () => {
    const { rerender } = render(
      <MemoryRouter>
        <StartupStatusBanner />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('global-startup-status')).toBeNull();

    useStartupStatusStore.setState({
      snapshot: {
        phase: 'ready',
        status: 'ready',
        ready: true,
        degraded: false,
        started_at: null,
        updated_at: null,
        issues: [],
        stages: [],
      },
      support: 'supported',
    });
    rerender(
      <MemoryRouter>
        <StartupStatusBanner />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('global-startup-status')).toBeNull();
  });

  test('announces a failed startup as an alert', () => {
    useStartupStatusStore.setState({
      snapshot: {
        phase: 'failed',
        status: 'failed',
        ready: false,
        degraded: false,
        started_at: null,
        updated_at: null,
        issues: [
          { stage: 'watcher_initial_sync', code: 'watcher_initial_sync_failed', severity: 'error' },
        ],
        stages: [],
      },
      support: 'supported',
    });

    render(
      <MemoryRouter>
        <StartupStatusBanner />
      </MemoryRouter>
    );
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('data-status')).toBe('failed');
  });
});
