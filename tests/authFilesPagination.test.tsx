import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type AuthFilesListParams } from '@/services/api/authFiles';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useNotificationStore } from '@/stores';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const params = (page: number): AuthFilesListParams => ({
  page,
  pageSize: 9,
  provider: 'chatgpt-web',
  plan: 'free',
  priority: '0',
  problemOnly: false,
  enabledOnly: true,
  disabledOnly: false,
  search: 'account*',
  sort: 'priority',
});

describe('auth files server-side pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useNotificationStore.getState().clearAll();
  });

  test('sends all pagination filters and preserves backend order and total', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      files: [
        { name: 'z.json', type: 'chatgpt-web' },
        { name: 'a.json', type: 'chatgpt-web' },
      ],
      total: 100,
      pagination: { enabled: true, page: 2, page_size: 9, total_pages: 12 },
      facets: { providers: [], priorities: [], plans: [] },
    });

    const response = await authFilesApi.listPaged(params(2));

    expect(get).toHaveBeenCalledWith(
      '/auth-files',
      expect.objectContaining({
        params: {
          paged: true,
          page: 2,
          page_size: 9,
          provider: 'chatgpt-web',
          plan: 'free',
          priority: '0',
          problem_only: false,
          enabled_only: true,
          disabled_only: false,
          search: 'account*',
          sort: 'priority',
        },
      })
    );
    expect(response.files.map((file) => file.name)).toEqual(['z.json', 'a.json']);
    expect(response.total).toBe(100);
    expect(response.pagination?.enabled).toBe(true);
  });

  test('falls back to a legacy full response when pagination metadata is absent', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      files: [
        { name: 'z.json', type: 'codex' },
        { name: 'a.json', type: 'codex' },
      ],
    });

    const response = await authFilesApi.listPaged(params(1));

    expect(response.pagination).toBeUndefined();
    expect(response.total).toBe(2);
    expect(response.files.map((file) => file.name)).toEqual(['a.json', 'z.json']);
  });

  test('keeps cross-page selection when a new page replaces the visible files', async () => {
    vi.spyOn(authFilesApi, 'listPaged')
      .mockResolvedValueOnce({
        files: [{ name: 'page-one.json', type: 'codex' }],
        total: 2,
        pagination: { enabled: true, page: 1, page_size: 1, total_pages: 2 },
      })
      .mockResolvedValueOnce({
        files: [{ name: 'page-two.json', type: 'chatgpt-web' }],
        total: 2,
        pagination: { enabled: true, page: 2, page_size: 1, total_pages: 2 },
      });
    const refreshKeyStats = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ page }) =>
        useAuthFilesData({
          refreshKeyStats,
          active: false,
          connectionGenerationKey: 'connection',
          listParams: { ...params(page), pageSize: 1 },
        }),
      { initialProps: { page: 1 } }
    );

    await act(async () => result.current.loadFiles());
    act(() => result.current.toggleSelect('page-one.json'));
    rerender({ page: 2 });
    await act(async () => result.current.loadFiles());

    expect(result.current.files.map((file) => file.name)).toEqual(['page-two.json']);
    expect(Array.from(result.current.selectedFiles)).toEqual(['page-one.json']);
  });

  test('clears cross-page selection when the management connection changes', async () => {
    vi.spyOn(authFilesApi, 'listPaged').mockResolvedValue({
      files: [{ name: 'selected.json', type: 'codex' }],
      total: 1,
      pagination: { enabled: true, page: 1, page_size: 1, total_pages: 1 },
    });
    const refreshKeyStats = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ connection }) =>
        useAuthFilesData({
          refreshKeyStats,
          active: false,
          connectionGenerationKey: connection,
          listParams: { ...params(1), pageSize: 1 },
        }),
      { initialProps: { connection: 'first' } }
    );

    await act(async () => result.current.loadFiles());
    act(() => result.current.toggleSelect('selected.json'));
    expect(Array.from(result.current.selectedFiles)).toEqual(['selected.json']);

    rerender({ connection: 'second' });
    expect(Array.from(result.current.selectedFiles)).toEqual([]);
  });

  test('ignores a stale page response after the query changes', async () => {
    let resolveFirst: ((value: Awaited<ReturnType<typeof authFilesApi.listPaged>>) => void) | null =
      null;
    let resolveSecond:
      | ((value: Awaited<ReturnType<typeof authFilesApi.listPaged>>) => void)
      | null = null;
    vi.spyOn(authFilesApi, 'listPaged')
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));
    const refreshKeyStats = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ page }) =>
        useAuthFilesData({
          refreshKeyStats,
          active: false,
          connectionGenerationKey: 'connection',
          listParams: { ...params(page), pageSize: 1 },
        }),
      { initialProps: { page: 1 } }
    );

    let firstRequest: Promise<void>;
    await act(async () => {
      firstRequest = result.current.loadFiles();
    });
    rerender({ page: 2 });
    let secondRequest: Promise<void>;
    await act(async () => {
      secondRequest = result.current.loadFiles();
      resolveSecond?.({
        files: [{ name: 'current.json', type: 'codex' }],
        total: 2,
        pagination: { enabled: true, page: 2, page_size: 1, total_pages: 2 },
      });
      await secondRequest;
    });
    await act(async () => {
      resolveFirst?.({
        files: [{ name: 'stale.json', type: 'codex' }],
        total: 2,
        pagination: { enabled: true, page: 1, page_size: 1, total_pages: 2 },
      });
      await firstRequest;
    });

    expect(result.current.files.map((file) => file.name)).toEqual(['current.json']);
    expect(result.current.filesPagination?.page).toBe(2);
  });

  test('selection endpoint omits page controls while retaining filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      files: [{ name: 'selected.json', type: 'codex' }],
      total: 1,
    });

    await authFilesApi.listSelection(params(3));

    const request = get.mock.calls[0]?.[1] as { params?: Record<string, unknown> };
    expect(request.params?.paged).toBeUndefined();
    expect(request.params?.page).toBeUndefined();
    expect(request.params?.page_size).toBeUndefined();
    expect(request.params?.provider).toBe('chatgpt-web');
    expect(request.params?.search).toBe('account*');
  });
});
