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
beforeEach(() => { vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear(); useAuthStore.setState({ connectionStatus: 'connected' }); });
const mount = () => render(<MemoryRouter initialEntries={['/edit/0']}><Routes><Route path="/edit/:index" element={<AiProvidersCodexEditPage />} /><Route path="/ai-providers" element={<div>saved</div>} /></Routes></MemoryRouter>);
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ currentLocation: { pathname: '/edit/0' }, nextLocation: { pathname: '/ai-providers' } });
const checkbox = () => screen.getByRole('checkbox', { name: 'ai_providers.codex_alpha_search_label' }) as HTMLInputElement;

test('capability-only edits become dirty, survive rejection, save and reload in both directions', async () => {
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', websockets: true, models: [{ name: 'gpt-5.5', 'display-name': 'Label', future: 'keep' }] }, { 'api-key': 'untouched', 'base-url': 'https://other.invalid', 'alpha-search': true }];
  const untouched = structuredClone(saved[1]);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'codex-api-key': saved }).codexApiKeys);
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  await screen.findByDisplayValue('fixture');
  expect(checkbox().checked).toBe(false); expect(dirty()).toBe(false);
  fireEvent.click(checkbox()); expect(dirty()).toBe(true);
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('save rejected');
  expect(checkbox().checked).toBe(true); expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', 'alpha-search': true, websockets: true, models: [{ name: 'gpt-5.5', 'display-name': 'Label', future: 'keep' }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount(); const second = mount();
  await waitFor(() => expect(checkbox().checked).toBe(true));
  expect(dirty()).toBe(false);
  fireEvent.click(checkbox()); expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['alpha-search']).toBe(false);
  second.unmount(); mount();
  await screen.findByDisplayValue('fixture');
  expect(checkbox().checked).toBe(false); expect(dirty()).toBe(false);
});

test('disconnected form keeps the capability read-only', async () => {
  useAuthStore.setState({ connectionStatus: 'disconnected' });
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([{ apiKey: 'fixture', baseUrl: 'https://example.invalid', alphaSearch: true }]);
  mount(); await screen.findByDisplayValue('fixture');
  expect(checkbox().disabled).toBe(true); expect(checkbox().checked).toBe(true);
});
