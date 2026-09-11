import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { apiKeysApi } from '@/services/api/apiKeys';
import { apiClient } from '@/services/api/client';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => vi.restoreAllMocks());

test('loads runtime timestamps without changing the existing key list API', async () => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url) => {
    if (url === '/api-key-groups') return { 'api-key-groups': [] } as never;
    return { 'api-keys': ['fixture'], 'last-used': { fixture: '2026-09-12T01:00:00Z', invalid: 'bad-date' } } as never;
  });
  await expect(apiKeysApi.list()).resolves.toEqual(['fixture']);
  await expect(apiKeysApi.getAccessSnapshot()).resolves.toEqual({
    keys: ['fixture'], groups: [], lastUsed: { fixture: '2026-09-12T01:00:00Z' },
  });
});

test('refreshes displayed usage without saving or dirtying the key configuration', async () => {
  const onChange = vi.fn();
  const update = vi.spyOn(apiKeysApi, 'updateGroup');
  vi.spyOn(apiKeysApi, 'getAccessSnapshot')
    .mockResolvedValueOnce({ keys: ['fixture'], groups: [], lastUsed: {} })
    .mockResolvedValueOnce({ keys: ['fixture'], groups: [], lastUsed: { fixture: '2026-09-12T01:00:00Z' } });
  const view = render(<ApiKeysCardEditor value="fixture" active onChange={onChange} />);
  await screen.findByText('config_management.visual.api_keys.last_used_never', { exact: false });
  fireEvent.click(screen.getByTitle('config_management.visual.api_keys.provider_refresh'));
  await waitFor(() => expect(view.container.querySelector('time')?.dateTime).toBe('2026-09-12T01:00:00Z'));
  expect(onChange).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test('does not claim an unused key when the backend does not expose usage', async () => {
  vi.spyOn(apiKeysApi, 'getAccessSnapshot').mockResolvedValue({ keys: ['fixture'], groups: [] });
  render(<ApiKeysCardEditor value="fixture" active onChange={vi.fn()} />);
  await screen.findByRole('checkbox', { name: 'Codex (codex)' });
  expect(screen.getByText('config_management.visual.api_keys.last_used_unavailable', { exact: false })).toBeTruthy();
  expect(screen.queryByText('config_management.visual.api_keys.last_used_never', { exact: false })).toBeNull();
});
