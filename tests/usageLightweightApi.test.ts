import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useChartData } from '@/components/usage/hooks/useChartData';
import { useUsageData } from '@/components/usage/hooks/useUsageData';
import { FailureSummaryCard } from '@/components/usage/FailureSummaryCard';
import { buildUsageDetailsQuery } from '@/components/usage/requestDetailsQuery';
import { apiClient } from '@/services/api/client';
import { usageApi } from '@/services/api/usage';
import { useAuthStore, useUsageStatsStore } from '@/stores';
import { buildSharedModelPricesFromLegacy } from '@/utils/usage';
import enLocale from '@/i18n/locales/en.json';
import ruLocale from '@/i18n/locales/ru.json';
import zhCNLocale from '@/i18n/locales/zh-CN.json';
import zhTWLocale from '@/i18n/locales/zh-TW.json';

describe('lightweight usage management API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('uses server aggregates with the supplied snapshot range and abort signal', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
    const controller = new AbortController();
    const range = {
      from: '2026-07-08T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
    };

    await usageApi.getUsageSummary(range, { signal: controller.signal });
    await usageApi.getUsageHealth(
      { ...range, bucket: '15m', group_by: 'none' },
      { signal: controller.signal }
    );
    await usageApi.getUsageRates(
      { window_minutes: 30, sparkline_minutes: 60 },
      { signal: controller.signal }
    );
    await usageApi.getUsageTokens(
      { ...range, bucket: 'hour', group_by: 'none' },
      { signal: controller.signal }
    );
    await usageApi.getUsageCosts({ ...range, bucket: 'hour' }, { signal: controller.signal });
    await usageApi.getUsageFailureSummary(range, { signal: controller.signal });

    expect(get).toHaveBeenNthCalledWith(1, '/usage/summary', {
      timeout: 60_000,
      params: range,
      signal: controller.signal,
    });
    expect(get).toHaveBeenNthCalledWith(2, '/usage/health', {
      timeout: 60_000,
      params: {
        ...range,
        bucket: '15m',
        group_by: 'none',
        auth_index: undefined,
        source: undefined,
      },
      signal: controller.signal,
    });
    expect(get).toHaveBeenNthCalledWith(3, '/usage/rates', {
      timeout: 60_000,
      params: { window_minutes: 30, sparkline_minutes: 60 },
      signal: controller.signal,
    });
    expect(get).toHaveBeenNthCalledWith(4, '/usage/tokens', {
      timeout: 60_000,
      params: { ...range, bucket: 'hour', group_by: 'none' },
      signal: controller.signal,
    });
    expect(get).toHaveBeenNthCalledWith(5, '/usage/costs', {
      timeout: 60_000,
      params: { ...range, bucket: 'hour' },
      signal: controller.signal,
    });
    expect(get).toHaveBeenNthCalledWith(6, '/usage/failures/summary', {
      timeout: 60_000,
      params: range,
      signal: controller.signal,
    });
  });

  test('renders safe failure proportions and execution boundaries without raw payloads', () => {
    render(
      createElement(FailureSummaryCard, {
        resource: {
          status: 'ready',
          error: '',
          data: {
            as_of: '2026-08-16T00:00:00Z',
            total: 3,
            main: 2,
            auxiliary: 1,
            boundaries: {
              credential_selected: 2,
              upstream_committed: 1,
              auth_request_slot_consumed: 1,
            },
            by_error_code: [{ value: 'http_401', count: 2, percent: 66.67 }],
            by_failure_stage: [{ value: 'upstream', count: 2, percent: 66.67 }],
            by_model: [],
            by_source: [],
            by_hour: [],
          },
        },
      })
    );

    expect(screen.getByText('HTTP 401')).not.toBeNull();
    expect(screen.getAllByText(/2 · 66\.7%/)).toHaveLength(2);
    expect(document.body.textContent).not.toContain('response_body');
    expect(document.body.textContent).not.toContain('credential-token');
  });

  test('renders readable labels for safe ChatGPT Web settle error codes', () => {
    const codes = [
      'chatgpt_web_image_upstream_failed',
      'chatgpt_web_image_no_output',
      'chatgpt_web_image_missing_terminal',
      'chatgpt_web_image_poll_not_converged',
      'chatgpt_web_image_poll_failed',
      'moderation_blocked',
    ] as const;
    render(
      createElement(FailureSummaryCard, {
        resource: {
          status: 'ready',
          error: '',
          data: {
            as_of: '2026-08-18T00:00:00Z',
            total: codes.length,
            main: codes.length,
            auxiliary: 0,
            boundaries: {
              credential_selected: codes.length,
              upstream_committed: codes.length,
              auth_request_slot_consumed: codes.length,
            },
            by_error_code: codes.map((value) => ({ value, count: 1, percent: 20 })),
            by_failure_stage: [{ value: 'settle', count: codes.length, percent: 100 }],
            by_model: [],
            by_source: [],
            by_hour: [],
          },
        },
      })
    );

    expect(screen.getByText('Web image upstream task failed')).not.toBeNull();
    expect(screen.getByText('Web image produced no deliverable output')).not.toBeNull();
    expect(screen.getByText('Web image terminal state or session is missing')).not.toBeNull();
    expect(screen.getByText('Web image polling did not converge')).not.toBeNull();
    expect(screen.getByText('Web image polling failed')).not.toBeNull();
    expect(screen.getByText('Image request rejected by safety review')).not.toBeNull();

    for (const locale of [enLocale, ruLocale, zhCNLocale, zhTWLocale]) {
      for (const code of codes) {
        expect(locale.usage_stats.failure_error_codes[code]).toBeTruthy();
      }
    }
  });

  test('normalizes server-side details paging, auth filters, and source facets', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
    const range = { from: '2026-07-14T00:00:00Z', to: '2026-07-15T00:00:00Z' };

    await usageApi.getUsageDetails({ ...range, offset: -5, limit: 5000 });
    await usageApi.getUsageAuths({
      ...range,
      auth_index: ['auth-a', '', 'auth-b'],
      paged: true,
      page: 2,
      page_size: 50,
      q: '  alpha  ',
      provider: ['codex', '', 'chatgpt-web'],
      status: ['enabled', 'disabled'],
      sort_by: 'total_requests',
      sort_order: 'desc',
    });
    await usageApi.getUsageFacets({ ...range, kind: 'source', q: '  tenant  ', limit: 100 });

    expect(get).toHaveBeenNthCalledWith(1, '/usage/details', {
      timeout: 60_000,
      params: {
        ...range,
        offset: 0,
        limit: 1000,
        sort_by: 'created_at',
        sort_order: 'desc',
      },
      signal: undefined,
    });
    expect(get).toHaveBeenNthCalledWith(2, '/usage/auths', {
      timeout: 60_000,
      params: {
        ...range,
        auth_index: 'auth-a,auth-b',
        paged: true,
        page: 2,
        page_size: 50,
        q: 'alpha',
        provider: 'codex,chatgpt-web',
        status: 'enabled,disabled',
        sort_by: 'total_requests',
        sort_order: 'desc',
      },
      signal: undefined,
    });
    expect(get).toHaveBeenNthCalledWith(3, '/usage/facets', {
      timeout: 60_000,
      params: { ...range, kind: 'source', q: 'tenant', limit: 100 },
      signal: undefined,
    });
  });

  test('reveals completed usage resources without waiting for the credential page', async () => {
    let resolveAuths: ((value: unknown) => void) | undefined;
    const authsPending = new Promise((resolve) => {
      resolveAuths = resolve;
    });
    vi.spyOn(usageApi, 'getUsageMeta').mockResolvedValue({
      usage: { enabled: true, available: true, version: 'progressive-v1' },
    });
    vi.spyOn(usageApi, 'getUsageSummary').mockResolvedValue({
      usage: { total_requests: 3, success_count: 3, failure_count: 0, total_tokens: 42 },
    });
    vi.spyOn(usageApi, 'getUsageAuths').mockImplementation(
      () => authsPending as ReturnType<typeof usageApi.getUsageAuths>
    );
    vi.spyOn(usageApi, 'getUsageHealth').mockResolvedValue({ items: [] });
    vi.spyOn(usageApi, 'getUsageFailureSummary').mockResolvedValue({
      failures: {
        as_of: '2026-07-15T00:00:00Z',
        total: 3,
        main: 2,
        auxiliary: 1,
        boundaries: {
          credential_selected: 2,
          upstream_committed: 1,
          auth_request_slot_consumed: 1,
        },
        by_error_code: [{ value: 'http_401', count: 2, percent: 66.67 }],
        by_failure_stage: [{ value: 'upstream', count: 2, percent: 66.67 }],
        by_model: [],
        by_source: [],
        by_hour: [],
      },
    });
    vi.spyOn(usageApi, 'getUsageRates').mockResolvedValue({ request_count: 0, token_count: 0 });
    vi.spyOn(usageApi, 'getUsageTokens').mockResolvedValue({ total_tokens: 42 });
    vi.spyOn(usageApi, 'getUsageCosts').mockResolvedValue({
      total: { amount_micros: 0 },
      by_model: [],
      unpriced_models: [],
    });
    vi.spyOn(usageApi, 'getUsagePrices').mockResolvedValue({ models: {} });

    const { result } = renderHook(() => useUsageData({ timeRange: '24h' }));

    await waitFor(() => expect(result.current.summaryResource.status).toBe('ready'));
    await waitFor(() => expect(result.current.failureResource.status).toBe('ready'));
    expect(result.current.failureResource.data?.boundaries.upstream_committed).toBe(1);
    expect(result.current.usage?.total_requests).toBe(3);
    expect(result.current.authResource.status).toBe('loading');

    act(() => {
      resolveAuths?.({
        auths: [{ auth_index: 'auth-a', total_requests: 3 }],
        total: 1,
        pagination: { enabled: true, page: 1, page_size: 50, total_pages: 1 },
      });
    });
    await waitFor(() => expect(result.current.authResource.status).toBe('ready'));
    expect(result.current.authUsage).toHaveLength(1);
    expect(result.current.authPagination).toMatchObject({
      serverSide: true,
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
  });

  test('falls back to local search and paging when the backend returns the legacy auth shape', async () => {
    vi.spyOn(usageApi, 'getUsageMeta').mockResolvedValue({
      usage: { enabled: true, available: true, version: 'legacy-auth-v1' },
    });
    vi.spyOn(usageApi, 'getUsageSummary').mockResolvedValue({ usage: { total_requests: 2 } });
    const getAuths = vi.spyOn(usageApi, 'getUsageAuths').mockResolvedValue({
      auths: [
        { auth_index: 'auth-alpha', name: 'Alpha', total_requests: 1 },
        { auth_index: 'auth-beta', name: 'Beta', total_requests: 1 },
      ],
    });
    vi.spyOn(usageApi, 'getUsageHealth').mockResolvedValue({ items: [] });
    vi.spyOn(usageApi, 'getUsageFailureSummary').mockResolvedValue({
      failures: {
        as_of: '2026-07-15T00:00:00Z',
        total: 0,
        main: 0,
        auxiliary: 0,
        boundaries: {
          credential_selected: 0,
          upstream_committed: 0,
          auth_request_slot_consumed: 0,
        },
        by_error_code: [],
        by_failure_stage: [],
        by_model: [],
        by_source: [],
        by_hour: [],
      },
    });
    vi.spyOn(usageApi, 'getUsageRates').mockResolvedValue({ request_count: 0, token_count: 0 });
    vi.spyOn(usageApi, 'getUsageTokens').mockResolvedValue({ total_tokens: 0 });
    vi.spyOn(usageApi, 'getUsageCosts').mockResolvedValue({
      total: { amount_micros: 0 },
      by_model: [],
      unpriced_models: [],
    });
    vi.spyOn(usageApi, 'getUsagePrices').mockResolvedValue({ models: {} });

    const { result } = renderHook(() => useUsageData({ timeRange: '24h' }));
    await waitFor(() => expect(result.current.authUsage).toHaveLength(2));
    expect(result.current.authPagination.serverSide).toBe(false);

    act(() => result.current.setAuthSearch(' beta '));
    await waitFor(() => expect(result.current.authUsage).toHaveLength(1));
    expect(result.current.authUsage[0]?.auth_index).toBe('auth-beta');
    expect(getAuths.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ paged: true, q: 'beta', page: 1, page_size: 50 })
    );
  });

  test('uses the original server source for filtering without exposing it as the option value', () => {
    const query = buildUsageDetailsQuery(
      { model: '__all__', source: 'k:safe-fingerprint', authIndex: '__all__', result: '__all__' },
      { from: '2026-07-14T00:00:00Z', to: '2026-07-15T00:00:00Z' },
      'sk-sensitive-source'
    );

    expect(query.source).toBe('sk-sensitive-source');
    expect(JSON.stringify(query)).not.toContain('k:safe-fingerprint');
  });

  test('never falls back to the complete usage payload when auth summaries fail', async () => {
    const get = vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('unsupported'));

    await expect(usageApi.getKeyStats()).rejects.toThrow('unsupported');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe('/usage/auths');
    expect(get.mock.calls.some(([path]) => path === '/usage')).toBe(false);
  });

  test('detects an unsupported details endpoint once without repeating the request', async () => {
    const previousAuth = useAuthStore.getState();
    useAuthStore.setState({
      apiBase: 'http://usage-details-unsupported.test',
      managementAccessPath: '',
      managementKey: 'details-test',
    });
    useUsageStatsStore.getState().clearUsageStats();
    const request = vi
      .spyOn(usageApi, 'getUsageDetails')
      .mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

    try {
      await expect(useUsageStatsStore.getState().loadUsageDetails()).rejects.toMatchObject({
        status: 404,
      });
      await expect(useUsageStatsStore.getState().loadUsageDetails()).rejects.toMatchObject({
        status: 404,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(useUsageStatsStore.getState().detailsError).toBeTruthy();
    } finally {
      useAuthStore.setState({
        apiBase: previousAuth.apiBase,
        managementAccessPath: previousAuth.managementAccessPath,
        managementKey: previousAuth.managementKey,
      });
      useUsageStatsStore.getState().clearUsageStats();
    }
  });

  test('sends shared prices using the server field names', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
    const prices = {
      'gpt-5.5': {
        'input-per-million': 1.25,
        'output-per-million': 10,
        'cached-input-per-million': 0.125,
      },
    };

    await usageApi.patchUsagePrices(prices);
    expect(patch).toHaveBeenCalledWith('/usage/prices', { models: prices }, { timeout: 60_000 });
  });

  test('maps legacy browser prices to shared server pricing fields', () => {
    expect(
      buildSharedModelPricesFromLegacy({
        'model-a': { prompt: 1.5, completion: 8, cache: 0.15 },
      })
    ).toEqual({
      'model-a': {
        'input-per-million': 1.5,
        'output-per-million': 8,
        'cached-input-per-million': 0.15,
      },
    });
  });

  test('loads each series bucket once per range and reuses it when toggling charts', async () => {
    const getSeries = vi.spyOn(usageApi, 'getUsageSeries').mockImplementation(async (query) => ({
      items: [{ bucket: '2026-07-15T00:00:00Z', group: 'model-a', requests: 1 }],
      bucket: query?.bucket,
    }));
    const range = { from: '2026-07-14T00:00:00Z', to: '2026-07-15T00:00:00Z' };
    const { result } = renderHook(() =>
      useChartData({
        chartLines: ['all'],
        isDark: false,
        isMobile: false,
        range,
        availabilityStatus: 'ready',
      })
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(getSeries).toHaveBeenCalledTimes(1);
    expect(getSeries.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ bucket: 'day', group_by: 'model' })
    );

    act(() => result.current.setRequestsPeriod('hour'));
    await waitFor(() => expect(getSeries).toHaveBeenCalledTimes(2));
    expect(getSeries.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ bucket: 'hour', group_by: 'model' })
    );

    act(() => result.current.setRequestsPeriod('day'));
    await waitFor(() => expect(result.current.requestsPeriod).toBe('day'));
    expect(getSeries).toHaveBeenCalledTimes(2);
  });

  test('does not request series while usage statistics are disabled', async () => {
    const getSeries = vi.spyOn(usageApi, 'getUsageSeries').mockResolvedValue({ items: [] });
    const { result } = renderHook(() =>
      useChartData({
        chartLines: ['all'],
        isDark: false,
        isMobile: false,
        range: { from: '2026-07-14T00:00:00Z', to: '2026-07-15T00:00:00Z' },
        availabilityStatus: 'disabled',
      })
    );

    await waitFor(() => expect(result.current.status).toBe('disabled'));
    expect(getSeries).not.toHaveBeenCalled();
  });
});
