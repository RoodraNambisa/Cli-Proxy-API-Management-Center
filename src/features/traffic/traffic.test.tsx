import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { useVisualConfig, getVisualConfigValidationErrors } from '@/hooks/useVisualConfig';
import { apiClient } from '@/services/api/client';
import { useTrafficBatch, useTrafficOverview } from './useTraffic';

afterEach(() => vi.restoreAllMocks());
describe('admission configuration', () => {
  it('round-trips limits, explicit zero and queue extensions without enabling defaults', () => {
    const yaml = `port: 8317
admission:
  max-queued-requests: 500
  future: retained
routing:
  per-auth-concurrency: 3
  queue: {enabled: true, max-waiting: 40, wait-timeout-seconds: 0, extension: retained}
  priority-overrides:
    - priority: 5
      per-auth-concurrency: 2
      queue: {enabled: false}
      subscription-overrides:
        - credentials: [selected]
          per-auth-concurrency: 0
          extension: retained
`;
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    const value = result.current.visualValues;
    expect(value.routingAdmission?.queue.enabled).toBe(true);
    expect(value.routingPriorityOverrides[0].subscriptionOverrides[0].perAuthConcurrency).toBe('0');
    act(() =>
      result.current.setVisualValues({
        routingAdmission: { ...value.routingAdmission!, concurrency: 7 },
        routingPriorityOverrides: [
          { ...value.routingPriorityOverrides[0], perAuthConcurrency: '0' },
        ],
      })
    );
    expect(result.current.visualDirtyFields).toContain('routingAdmission');
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).routingAdmission
    ).toBeUndefined();
    const saved = parse(result.current.applyVisualChangesToYaml(yaml));
    expect(saved.admission.future).toBe('retained');
    expect(saved.routing['per-auth-concurrency']).toBe(7);
    expect(saved.routing.queue.extension).toBe('retained');
    expect(saved.routing['priority-overrides'][0]['per-auth-concurrency']).toBe(0);
    expect(saved.routing['priority-overrides'][0]['subscription-overrides'][0]).toMatchObject({
      'per-auth-concurrency': 0,
      extension: 'retained',
    });
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ debug: true }));
    const plain = parse(result.current.applyVisualChangesToYaml('port: 8317\n'));
    expect(plain.admission).toBeUndefined();
    expect(plain.routing?.queue).toBeUndefined();
  });
  it('rejects negative and fractional admission limits', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('routing:\n  per-auth-concurrency: -1\n'));
    expect(
      getVisualConfigValidationErrors(result.current.visualValues).routingAdmission
    ).toBeTruthy();
  });
});
describe('current-page traffic polling', () => {
  it('batches at 200 ids and cancels the previous page request', async () => {
    const calls: { ids: string[]; signal: AbortSignal }[] = [];
    vi.spyOn(apiClient, 'postAtConnection').mockImplementation(
      async (_connection, _path, body, options) => {
        const ids = (body as { ids: string[] }).ids;
        calls.push({ ids, signal: options!.signal as AbortSignal });
        return { items: ids.map((id) => ({ id, active: 1 })) } as never;
      }
    );
    const ids = Array.from({ length: 201 }, (_, i) => String(i));
    const { result, rerender, unmount } = renderHook(
      ({ ids }) => useTrafficBatch('auth-files', ids),
      { initialProps: { ids } }
    );
    await waitFor(() => expect(Object.keys(result.current.items)).toHaveLength(201));
    expect(calls.map((c) => c.ids.length)).toEqual([200, 1]);
    rerender({ ids: ['new'] });
    await waitFor(() => expect(result.current.items.new).toBeDefined());
    expect(calls[0].signal.aborted).toBe(true);
    expect(result.current.items['0']).toBeUndefined();
    unmount();
    expect(calls[calls.length - 1]?.signal.aborted).toBe(true);
  });
  it('does not poll while hidden and resumes when visible', async () => {
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ items: [] });
    const { unmount } = renderHook(() => useTrafficBatch('auth-files', ['one']));
    expect(post).not.toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    unmount();
  });
});

it('falls back cleanly when an older backend returns its HTML page for an unknown endpoint', async () => {
  vi.spyOn(apiClient, 'getAtConnection').mockResolvedValue('<html>legacy panel</html>');
  const { result, unmount } = renderHook(() => useTrafficOverview('window_minutes=30'));
  await waitFor(() => expect(result.current.unsupported).toBe(true));
  expect(result.current.data).toBeUndefined();
  unmount();
});
