import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { authFilesApi } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types/authFile';
import { ProviderCredentialCard } from './ProviderCredentialCard';

const file: AuthFileItem = {
  name: 'codex:runtime:sample',
  auth_index: 'abc123',
  display_name: 'East channel',
  config_ref: { kind: 'codex', id: 'card-id', revision: '1' },
  disabled: true,
  priority: -5,
  weight: 2,
  api_key_mask: '••••1234',
  proxy_url: 'socks5://user:private-password@proxy.example:1080',
  proxy_route: {
    id: 'route',
    source: 'pool',
    mode: 'proxy',
    pool: 'East',
    address: 'socks5://proxy.example:1080',
  },
  request_limit: {
    limit: 12,
    window_minutes: 1,
    source: 'priority',
    priority: -5,
    concurrency_limit: 3,
    concurrency_source: 'credential',
  },
  error_history: { total: 3, retained_total: 3, distinct: 1, limit: 10 },
  response_model_rewrite: {
    enabled: true,
    conditional: false,
    total: 3,
    since: '2026-11-19T01:00:00Z',
    rules: [],
  },
  fill_order: { record_id: 'sample-order', joined_sequence: '2', position: '2' },
};
const props = {
  file,
  resolvedTheme: 'light' as const,
  selected: false,
  compact: false,
  disabled: false,
  usageLoading: false,
  onSelect: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onReorder: vi.fn(),
};
beforeAll(async () => {
  await i18n.changeLanguage('zh-CN');
});

describe('API credential card', () => {
  it('shows the effective route and limits and probes only the runtime credential selected by the administrator', async () => {
    const check = vi.spyOn(authFilesApi, 'checkProxy').mockResolvedValue({
      proxy_route: {
        ...file.proxy_route!,
        ip: '203.0.113.4',
        loc: 'JP',
        ok: true,
        checked_at: '2026-11-19T01:00:00Z',
      },
    });
    const errors = vi.spyOn(authFilesApi, 'errorHistory');
    const response = vi.spyOn(authFilesApi, 'responseModelRewrite');
    const view = render(
      <MemoryRouter>
        <ProviderCredentialCard {...props} />
      </MemoryRouter>
    );
    expect(screen.getByText('socks5://proxy.example:1080')).toBeTruthy();
    expect(screen.getByText(/代理池.*East/)).toBeTruthy();
    expect(screen.getByText('12 次 / 1 分钟')).toBeTruthy();
    expect(screen.getByText('指定凭证规则')).toBeTruthy();
    expect(screen.getByText('凭证权重')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
    expect(view.container.textContent).not.toContain('private-password');
    expect(check).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(response).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '检测出口 IP: ' + file.name }));
    await screen.findByText('203.0.113.4 · JP');
    expect(check.mock.calls[0][0]).toBe(file.name);
    fireEvent.click(screen.getByRole('button', { name: '编辑渠道' }));
    expect(props.onEdit).toHaveBeenCalledWith('card-id');
    fireEvent.click(screen.getByRole('button', { name: '调整顺序' }));
    expect(props.onReorder).toHaveBeenCalledWith(file);
  });

  it('renders usage and diagnostics from the supplied credential snapshot', () => {
    render(
      <MemoryRouter>
        <ProviderCredentialCard
          {...props}
          file={{ ...file, last_error_status_code: 429, status_message: 'rate limit reached' }}
          usageSummary={{
            requestCount: 83,
            successCount: 76,
            failureCount: 7,
            totalTokens: 840,
            modelCount: 1,
            latestTimestampMs: Date.UTC(2026, 10, 19),
          }}
        />
      </MemoryRouter>
    );
    for (const label of [
      '76',
      '7',
      '83',
      '840',
      '92%',
      'HTTP 429',
      'rate limit reached',
      '最近错误',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /响应校验与模型名称转换详情/ })).toBeTruthy();
  });

  it('keeps routing visible in compact mode and omits unset limits and missing historical data', () => {
    const direct = {
      ...file,
      proxy_route: { id: 'direct-route', source: 'direct', mode: 'direct' as const },
      request_limit: {
        limit: 0,
        window_minutes: 1,
        source: 'global',
        priority: -5,
        concurrency_limit: 0,
        concurrency_source: 'global',
      },
    };
    const view = render(
      <MemoryRouter>
        <ProviderCredentialCard {...props} file={direct} compact trafficVisible={false} />
      </MemoryRouter>
    );
    expect(screen.getByText('直连')).toBeTruthy();
    expect(screen.queryByText('并发上限')).toBeNull();
    expect(screen.queryByText('请求限额')).toBeNull();
    expect(screen.queryByText('成功率')).toBeNull();
    expect(screen.getByText('暂无使用统计')).toBeTruthy();
    view.rerender(
      <MemoryRouter>
        <ProviderCredentialCard {...props} file={{ ...direct, proxy_route: undefined }} />
      </MemoryRouter>
    );
    expect(screen.queryByText('直连')).toBeNull();
    expect(screen.queryByRole('button', { name: /检测出口 IP/ })).toBeNull();
  });
});
