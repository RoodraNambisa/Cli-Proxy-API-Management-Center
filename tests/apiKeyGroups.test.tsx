import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { apiClient } from '@/services/api/client';
import { apiKeysApi } from '@/services/api/apiKeys';
import { useNotificationStore } from '@/stores';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

describe('API Key provider groups', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useNotificationStore.getState().clearAll();
  });

  test('loads API keys and provider groups together', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
      if (url === '/api-keys') return { 'api-keys': ['client-key'] } as never;
      if (url === '/api-key-groups') {
        return {
          'api-key-groups': [
            { 'api-key': 'client-key', providers: ['Codex', 'XAI', 'codex'] },
          ],
        } as never;
      }
      throw new Error(`unexpected URL: ${url}`);
    });

    await expect(apiKeysApi.getAccessSnapshot()).resolves.toEqual({
      keys: ['client-key'],
      groups: [{ apiKey: 'client-key', providers: ['codex', 'xai'] }],
    });
    expect(get).toHaveBeenCalledWith('/api-keys');
    expect(get).toHaveBeenCalledWith('/api-key-groups');
  });

  test('submits exact provider IDs and supports an unrestricted empty list', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 'ok' });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({ status: 'ok' });

    await apiKeysApi.updateGroup('client-key', ['Codex', 'xai', 'XAI']);
    expect(patch).toHaveBeenCalledWith('/api-key-groups', {
      'api-key': 'client-key',
      providers: ['codex', 'xai'],
    });

    await apiKeysApi.updateGroup('client-key', []);
    expect(patch).toHaveBeenLastCalledWith('/api-key-groups', {
      'api-key': 'client-key',
      providers: [],
    });

    await apiKeysApi.deleteGroup('client key');
    expect(remove).toHaveBeenCalledWith('/api-key-groups?api-key=client%20key');
  });

  test('uses xai for the Grok provider checkbox', async () => {
    vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['client-key'],
      groups: [],
    });
    const updateGroup = vi.spyOn(apiKeysApi, 'updateGroup').mockResolvedValue({ status: 'ok' });

    render(
      <ApiKeysCardEditor value="client-key" active onChange={vi.fn()} disabled={false} />
    );

    const grokCheckbox = await screen.findByRole('checkbox', { name: 'Grok (xai)' });
    fireEvent.click(grokCheckbox);

    await waitFor(() => {
      expect(updateGroup).toHaveBeenCalledWith('client-key', ['xai']);
    });
  });

  test('reloads provider groups after the saved API Key list changes', async () => {
    const getAccessSnapshot = vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({
      keys: ['client-key'],
      groups: [],
    });
    const view = render(
      <ApiKeysCardEditor
        value="client-key"
        savedValue="client-key"
        active
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(getAccessSnapshot).toHaveBeenCalledTimes(1));

    view.rerender(
      <ApiKeysCardEditor
        value={'client-key\nsecond-key'}
        savedValue={'client-key\nsecond-key'}
        active
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(getAccessSnapshot).toHaveBeenCalledTimes(2));
  });

  test('disables provider changes while restrictions are being refreshed', async () => {
    let resolveRefresh: ((value: { keys: string[]; groups: [] }) => void) | undefined;
    const pendingRefresh = new Promise<{ keys: string[]; groups: [] }>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(apiKeysApi, 'getAccessSnapshot')
      .mockResolvedValueOnce({ keys: ['client-key'], groups: [] })
      .mockReturnValueOnce(pendingRefresh);

    render(<ApiKeysCardEditor value="client-key" active onChange={vi.fn()} />);
    const grokCheckbox = await screen.findByRole('checkbox', { name: 'Grok (xai)' });
    fireEvent.click(
      screen.getByTitle('config_management.visual.api_keys.provider_refresh')
    );

    await waitFor(() => expect(grokCheckbox.hasAttribute('disabled')).toBe(true));
    await act(async () => {
      resolveRefresh?.({ keys: ['client-key'], groups: [] });
      await pendingRefresh;
    });
    await waitFor(() => expect(grokCheckbox.hasAttribute('disabled')).toBe(false));
  });
});
