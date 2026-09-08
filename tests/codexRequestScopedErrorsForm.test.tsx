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

test('Codex rule-only edits survive rejected saves, reloads and clearing without changing credentials', async () => {
  let saved: Array<Record<string, unknown>> = [
    { 'api-key': 'test-edited', 'base-url': 'https://example.invalid', weight: 7, 'request-retry': 3,
      'request-scoped-errors': [{ status: 500, match: [' original '], action: 'stop', future: 'keep' }] },
    { 'api-key': 'test-untouched', 'base-url': 'https://example.invalid', 'request-scoped-errors': [{ status: 400, match: ['other'], action: 'continue' }] },
  ];
  const untouched = JSON.parse(JSON.stringify(saved[1]));
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'codex-api-key': saved }).codexApiKeys);
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  const pattern = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  await waitFor(() => expect((pattern as HTMLTextAreaElement).value).toBe(' original '));
  expect(dirty()).toBe(false);
  fireEvent.change(pattern, { target: { value: '  changed\nvalue ' } });
  expect(dirty()).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' }), { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' }), { target: { value: '500' } });
  put.mockRejectedValueOnce(new Error('server regex rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('server regex rejected');
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'test-edited', weight: 7, 'request-retry': 3,
    'request-scoped-errors': [{ status: 500, match: ['  changed\nvalue '], action: 'stop', future: 'keep' }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount();
  const second = mount();
  const reloaded = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  expect((reloaded as HTMLTextAreaElement).value).toBe('  changed\nvalue ');
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['request-scoped-errors']).toEqual([]);
  second.unmount(); mount();
  await screen.findByRole('button', { name: 'request_scoped_errors.add_rule' });
  expect(screen.queryByRole('textbox', { name: 'request_scoped_errors.match 1' })).toBeNull();
  expect(dirty()).toBe(false);
});
