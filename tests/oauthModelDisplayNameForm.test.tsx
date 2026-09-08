import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AuthFilesOAuthModelAliasEditPage } from '@/pages/AuthFilesOAuthModelAliasEditPage';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useAuthStore, useNotificationStore } from '@/stores';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => { vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); useAuthStore.setState({ connectionStatus: 'connected' }); });
const mount = () => render(<MemoryRouter initialEntries={['/edit?provider=codex']}><Routes>
  <Route path="/edit" element={<AuthFilesOAuthModelAliasEditPage />} />
  <Route path="/auth-files" element={<div>saved</div>} />
</Routes></MemoryRouter>);
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: boolean }).shouldBlock;

test('OAuth display-name edits preserve mapping metadata, failed drafts and reload defaults', async () => {
  const model = { name: 'gpt-5.5', alias: 'local', fork: true, 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ ...model, 'display-name': 'Before' }];
  vi.spyOn(authFilesApi, 'list').mockResolvedValue({ files: [] });
  vi.spyOn(authFilesApi, 'getOauthExcludedModels').mockResolvedValue({});
  vi.spyOn(authFilesApi, 'getModelDefinitions').mockResolvedValue([]);
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ 'oauth-model-alias': { codex: saved } }));
  const patch = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => { saved = (body as { aliases: Array<Record<string, unknown>> }).aliases; return {}; });
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const first = mount();
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'common.model_display_name_label 1' }) as HTMLInputElement).value).toBe('Before'));
  const input = screen.getByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect(dirty()).toBe(false);
  fireEvent.change(input, { target: { value: '  After  ' } });
  expect(dirty()).toBe(true);
  patch.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'oauth_model_alias.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('save rejected'), 'error'));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'oauth_model_alias.save' }));
  await screen.findByText('saved');
  expect(saved).toEqual([{ ...model, 'display-name': 'After' }]);
  first.unmount(); const second = mount();
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'common.model_display_name_label 1' }) as HTMLInputElement).value).toBe('After'));
  const reloaded = screen.getByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect(dirty()).toBe(false);
  fireEvent.change(reloaded, { target: { value: '' } });
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'oauth_model_alias.save' }));
  await screen.findByText('saved');
  expect(saved).toEqual([model]);
  second.unmount(); mount();
  await screen.findByDisplayValue('gpt-5.5');
  const empty = screen.getByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect((empty as HTMLInputElement).value).toBe('');
  expect(dirty()).toBe(false);
});
