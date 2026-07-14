import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useChartData } from '@/components/usage/hooks/useChartData';
import { buildUsageDetailsQuery } from '@/components/usage/requestDetailsQuery';
import { apiClient } from '@/services/api/client';
import { usageApi } from '@/services/api/usage';
import { useAuthStore, useUsageStatsStore } from '@/stores';
import { buildSharedModelPricesFromLegacy } from '@/utils/usage';

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
  });

  test('normalizes server-side details paging and auth filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({});
    const range = { from: '2026-07-14T00:00:00Z', to: '2026-07-15T00:00:00Z' };

    await usageApi.getUsageDetails({ ...range, offset: -5, limit: 5000 });
    await usageApi.getUsageAuths({ ...range, auth_index: ['auth-a', '', 'auth-b'] });

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
      params: { ...range, auth_index: 'auth-a,auth-b' },
      signal: undefined,
    });
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
