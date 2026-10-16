import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProxyRegionApplicationDetails } from './ProxyRegionApplication';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
describe('region application presentation', () => {
  it('keeps saved proxy values separate from disabled consumption', () => {
    render(
      <ProxyRegionApplicationDetails
        value={{
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
          language: { value: 'en-CA', source: 'proxy_node', state: 'ready', follow_proxy: true },
        }}
      />
    );
    expect(screen.getByText('UTC')).toBeTruthy();
    expect(screen.getByText('America/Toronto')).toBeTruthy();
    expect(screen.getByText('region_status.states.not_following')).toBeTruthy();
    expect(screen.getByText('region_status.states.ready')).toBeTruthy();
    expect(screen.getByText('region_status.actual_request_hint')).toBeTruthy();
  });
});
