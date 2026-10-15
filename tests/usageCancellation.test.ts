import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { usageApi } from '@/services/api/usage';
import { useUsageStatsStore } from '@/stores';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type DetailsResponse = Awaited<ReturnType<typeof usageApi.getUsageDetails>>;
const page = (model: string): DetailsResponse => ({
  items: [{ model, timestamp: '2026-10-15T00:00:00Z' }],
  total: 1,
});

beforeEach(() => useUsageStatsStore.getState().clearUsageStats());
afterEach(() => {
  vi.restoreAllMocks();
  useUsageStatsStore.getState().clearUsageStats();
});

describe('usage detail cancellation', () => {
  test('forwards the abort signal and keeps the latest filter result', async () => {
    const previous = deferred<DetailsResponse>();
    const next = deferred<DetailsResponse>();
    const request = vi
      .spyOn(usageApi, 'getUsageDetails')
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(next.promise);
    const controller = new AbortController();
    const oldLoad = useUsageStatsStore
      .getState()
      .loadUsageDetails({ query: { model: 'old' }, signal: controller.signal });
    const newLoad = useUsageStatsStore.getState().loadUsageDetails({ query: { model: 'new' } });
    controller.abort();
    next.resolve(page('new'));
    await newLoad;
    const latest = useUsageStatsStore.getState().detailsPage;
    previous.resolve(page('old'));
    await oldLoad;
    expect(request.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    expect(useUsageStatsStore.getState().detailsPage).toBe(latest);
    expect(useUsageStatsStore.getState().detailsError).toBeNull();
  });

  test.each(['success', 'not_found', 'cancel_error'])(
    'does not install a canceled %s response or cache an unsupported capability',
    async (outcome) => {
      const pending = deferred<DetailsResponse>();
      const request = vi
        .spyOn(usageApi, 'getUsageDetails')
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(page('current'));
      const controller = new AbortController();
      const load = useUsageStatsStore.getState().loadUsageDetails({ signal: controller.signal });
      const settled = load.catch((error: unknown) => error);
      controller.abort();
      if (outcome === 'success') pending.resolve(page('canceled'));
      else
        pending.reject(
          outcome === 'not_found'
            ? Object.assign(new Error('not found'), { status: 404 })
            : new DOMException('Canceled', 'AbortError')
        );
      await settled;
      expect(useUsageStatsStore.getState()).toMatchObject({
        detailsPage: null,
        detailsLoading: false,
        detailsError: null,
      });
      await useUsageStatsStore.getState().loadUsageDetails();
      expect(request).toHaveBeenCalledTimes(2);
      expect(useUsageStatsStore.getState().detailsPage?.details).toHaveLength(1);
    }
  );

  test('does not send a request after the owner has already canceled', async () => {
    const request = vi.spyOn(usageApi, 'getUsageDetails');
    const controller = new AbortController();
    controller.abort();
    await expect(
      useUsageStatsStore.getState().loadUsageDetails({ signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    expect(useUsageStatsStore.getState().detailsLoading).toBe(false);
  });
});
