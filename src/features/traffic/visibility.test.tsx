import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '@/stores/useConfigStore';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { parse } from 'yaml';

const setVisibility = (field: 'api-key-traffic' | 'credential-traffic', value: boolean) => {
  const config = useConfigStore.getState().config;
  const previous = config?.raw?.['management-ui'] as Record<string, unknown> | undefined;
  useConfigStore.setState({ config: { raw: { 'management-ui': { ...previous, [field]: value } } } });
};
import { apiClient } from '@/services/api/client';
import { useTrafficBatch } from './useTraffic';

beforeEach(() => {
  vi.useFakeTimers();
  useConfigStore.setState({ config: { raw: {} } });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
  useConfigStore.setState({ config: { raw: {} } });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('independent live traffic display preferences', () => {
  it('does not poll hidden panels and resumes immediately when re-enabled', async () => {
    const calls: { path: string; signal: AbortSignal }[] = [];
    vi.spyOn(apiClient, 'postAtConnection').mockImplementation(async (_, path, _body, options) => {
      calls.push({ path, signal: options!.signal as AbortSignal });
      return { items: [{ id: 'one', active: 1 }] } as never;
    });
    setVisibility('credential-traffic', false);
    const { result, unmount } = renderHook(() => ({
      credentials: useTrafficBatch('auth-files', ['one']),
      keys: useTrafficBatch('api-keys', ['one']),
    }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.credentials.visible).toBe(false);
    expect(calls.map((c) => c.path)).toEqual(['/api-keys/traffic']);
    await act(async () =>
      setVisibility('api-key-traffic', false)
    );
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(calls).toHaveLength(1);
    await act(async () =>
      setVisibility('credential-traffic', true)
    );
    expect(calls.map((c) => c.path)).toEqual(['/api-keys/traffic', '/auth-files/traffic']);
    expect(result.current.credentials.visible).toBe(true);
    expect(result.current.credentials.items.one.active).toBe(1);
    expect(result.current.keys.visible).toBe(false);
    unmount();
    expect(calls[1].signal.aborted).toBe(true);
  });

  it('cancels an in-flight read when hidden and discards its late response', async () => {
    let finish!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    vi.spyOn(apiClient, 'postAtConnection').mockImplementation((_, _path, _body, options) => {
      signal = options!.signal as AbortSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { result, unmount } = renderHook(() => useTrafficBatch('auth-files', ['one']));
    await act(async () =>
      setVisibility('credential-traffic', false)
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => finish({ items: [{ id: 'one', active: 99 }] }));
    expect(result.current.items.one).toBeUndefined();
    expect(result.current.visible).toBe(false);
    unmount();
  });

  it('waits for server settings before starting live reads', async () => {
    useConfigStore.setState({ config: null });
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ items: [] });
    const { result, unmount } = renderHook(() => useTrafficBatch('auth-files', ['one']));
    expect(post).not.toHaveBeenCalled();
    await act(async () => setVisibility('credential-traffic', false));
    expect(result.current.visible).toBe(false);
    expect(post).not.toHaveBeenCalled();
    unmount();
  });

  it('loads missing summaries once while live panels are hidden and refreshes on a new list snapshot', async () => {
    setVisibility('credential-traffic', false);
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({
      items: [{ id: 'old', concurrency_limit: 3, concurrency_source: 'priority' }],
    });
    const { result, rerender, unmount } = renderHook(
      ({ revision }) => useTrafficBatch('auth-files', ['new', 'old'], true, { ids: ['old'], revision }),
      { initialProps: { revision: 1 } }
    );
    await act(async () => { await Promise.resolve(); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][2]).toEqual({ ids: ['old'] });
    expect(result.current.visible).toBe(false);
    expect(result.current.items.old.concurrency_limit).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(post).toHaveBeenCalledTimes(1);
    rerender({ revision: 2 });
    await act(async () => { await Promise.resolve(); });
    expect(post).toHaveBeenCalledTimes(2);
    await act(async () => setVisibility('credential-traffic', true));
    expect(post.mock.calls[post.mock.calls.length - 1]?.[2]).toEqual({ ids: ['new', 'old'] });
    expect(result.current.visible).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(post).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('cancels a pending summary batch after a page change and ignores its late response', async () => {
    setVisibility('credential-traffic', false);
    let finish!: (value: unknown) => void;
    const post = vi.spyOn(apiClient, 'postAtConnection').mockImplementationOnce(
      () => new Promise(resolve => { finish = resolve; })
    ).mockResolvedValue({ items: [{ id: 'second', concurrency_limit: 4 }] });
    const { result, rerender, unmount } = renderHook(
      ({ id }) => useTrafficBatch('auth-files', [id], true, { ids: [id] }),
      { initialProps: { id: 'first' } }
    );
    rerender({ id: 'second' });
    expect(post.mock.calls[0][3]?.signal?.aborted).toBe(true);
    await act(async () => finish({ items: [{ id: 'first', concurrency_limit: 99 }] }));
    expect(result.current.items.first).toBeUndefined();
    expect(result.current.items.second.concurrency_limit).toBe(4);
    unmount();
  });

  it('does not enable live polling when the display settings could not be read', async () => {
    useConfigStore.setState({ config: { raw: {}, managementUIReadFailed: true } });
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ items: [] });
    const { result, unmount } = renderHook(() => useTrafficBatch('api-keys', ['one']));
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(post).not.toHaveBeenCalled();
    expect(result.current.stale).toBe(true);
    unmount();
  });

  it('persists independent switches in server YAML and preserves unknown fields and comments', () => {
    const yaml = '# shared UI\nmanagement-ui:\n  future: preserved\n  api-key-traffic: false\nport: 8317\n';
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml(yaml));
    expect(result.current.visualValues.trafficVisibility).toEqual({ apiKeyTraffic: false, credentialTraffic: true });
    act(() => result.current.setVisualValues({ trafficVisibility: { apiKeyTraffic: true, credentialTraffic: false } }));
    expect(result.current.visualDirtyFields).toContain('trafficVisibility');
    const saved = result.current.applyVisualChangesToYaml(yaml);
    expect(saved).toContain('# shared UI');
    expect(parse(saved)['management-ui']).toEqual({ future: 'preserved', 'api-key-traffic': true, 'credential-traffic': false });
    act(() => result.current.loadVisualValuesFromYaml(saved));
    expect(result.current.visualValues.trafficVisibility).toEqual({ apiKeyTraffic: true, credentialTraffic: false });
  });

  it('preserves another browser change to the untouched display switch', () => {
    const { result } = renderHook(() => useVisualConfig());
    act(() => result.current.loadVisualValuesFromYaml('port: 8317\n'));
    act(() => result.current.setVisualValues({ trafficVisibility: { apiKeyTraffic: true, credentialTraffic: false } }));
    const latest = 'port: 8317\nmanagement-ui:\n  api-key-traffic: false\n';
    expect(parse(result.current.applyVisualChangesToYaml(latest))['management-ui']).toEqual({
      'api-key-traffic': false, 'credential-traffic': false,
    });
  });
});
