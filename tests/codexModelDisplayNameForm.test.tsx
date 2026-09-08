import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
});
const mount = () => render(<MemoryRouter initialEntries={['/edit/0']}><Routes>
  <Route path="/edit/:index" element={<AiProvidersCodexEditPage />} />
  <Route path="/ai-providers" element={<div>saved</div>} />
</Routes></MemoryRouter>);
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ currentLocation: { pathname: '/edit/0' }, nextLocation: { pathname: '/ai-providers' } });

test('Codex label edits save, reload and clear without changing aliases or hidden model settings', async () => {
  const model = { name: 'gpt-5.5', alias: 'local-model', 'display-name': 'Before', 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', weight: 3, models: [model] }, { 'api-key': 'untouched', models: [{ name: 'other', 'display-name': 'Other' }] }];
  const untouched = JSON.parse(JSON.stringify(saved[1]));
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'codex-api-key': saved }).codexApiKeys);
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  const field = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  await waitFor(() => expect((field as HTMLInputElement).value).toBe('Before'));
  expect(dirty()).toBe(false);
  fireEvent.change(field, { target: { value: '  After  ' } });
  expect(dirty()).toBe(true);
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('save rejected');
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', weight: 3, models: [{ ...model, 'display-name': 'After' }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount();
  const second = mount();
  const reloaded = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect((reloaded as HTMLInputElement).value).toBe('After');
  expect(dirty()).toBe(false);
  fireEvent.change(reloaded, { target: { value: ' ' } });
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([{ name: 'gpt-5.5', alias: 'local-model', 'force-mapping': true, future: { keep: true } }]);
  second.unmount(); mount();
  const empty = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect((empty as HTMLInputElement).value).toBe('');
  expect(dirty()).toBe(false);
});
