import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore, useNotificationStore } from '@/stores';

const mocks = vi.hoisted(() => ({ t: (key: string) => key }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
// Use one real router instance across Vitest's ESM and external CJS imports.
vi.mock('react-router', async () => vi.importActual('react-router-dom'));

test('cancelled provider navigation retains an edited label until the user confirms leaving', async () => {
  useAuthStore.setState({ connectionStatus: 'connected' });
  vi.spyOn(authFilesApi, 'list').mockResolvedValue({ files: [] });
  vi.spyOn(authFilesApi, 'getOauthExcludedModels').mockResolvedValue({});
  vi.spyOn(authFilesApi, 'getModelDefinitions').mockResolvedValue([]);
  vi.spyOn(authFilesApi, 'getOauthModelAlias').mockResolvedValue({
    codex: [{ name: 'codex-model', alias: 'local', displayName: 'Codex label' }],
    claude: [{ name: 'claude-model', alias: 'other', displayName: 'Claude label' }],
  });
  const confirm = vi.spyOn(useNotificationStore.getState(), 'showConfirmation').mockImplementation(() => {});
  const router = createMemoryRouter([{ path: '/edit', element: <AuthFilesOAuthModelAliasEditPage /> }], { initialEntries: ['/edit?provider=codex'] });
  render(<RouterProvider router={router} />);
  const field = () => screen.getByRole('textbox', { name: 'common.model_display_name_label 1' }) as HTMLInputElement;
  await waitFor(() => expect(field().value).toBe('Codex label'));
  fireEvent.change(field(), { target: { value: 'Unsaved label' } });
  fireEvent.click(screen.getByRole('button', { name: 'Claude', exact: true }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(router.state.location.search).toBe('?provider=codex');
  await act(async () => { confirm.mock.lastCall?.[0].onCancel?.(); });
  expect(field().value).toBe('Unsaved label');
  expect(router.state.location.search).toBe('?provider=codex');
  fireEvent.click(screen.getByRole('button', { name: 'Claude', exact: true }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  await act(async () => { await confirm.mock.lastCall?.[0].onConfirm(); });
  await waitFor(() => expect(field().value).toBe('Claude label'));
  expect(router.state.location.search).toBe('?provider=claude');
});
