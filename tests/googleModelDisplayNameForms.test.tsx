import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersGeminiEditPage } from '@/pages/AiProvidersGeminiEditPage';
import { AiProvidersVertexEditPage } from '@/pages/AiProvidersVertexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => { vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear(); useAuthStore.setState({ connectionStatus: 'connected' }); });
const forms = [
  { section: 'gemini-api-key', element: <AiProvidersGeminiEditPage /> },
  { section: 'interactions-api-key', element: <AiProvidersGeminiEditPage providerType="interactions" /> },
  { section: 'vertex-api-key', element: <AiProvidersVertexEditPage /> },
];
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ currentLocation: { pathname: '/edit/0' }, nextLocation: { pathname: '/ai-providers' } });

test.each(forms)('$section saves, reloads and clears labels with model metadata intact', async ({ section, element }) => {
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  const baseModel = { name: 'gemini-test', alias: 'local', 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', weight: 7, models: [{ ...baseModel, 'display-name': 'Before' }] }];
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ [section]: copy(saved) }));
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => {
    const config = normalizeConfigResponse({ [section]: saved });
    return section === 'vertex-api-key' ? config.vertexApiKeys : section === 'interactions-api-key' ? config.interactionsApiKeys : config.geminiApiKeys;
  });
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = copy(body); return {}; });
  const patch = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
    const payload = body as { index: number; value: Record<string, unknown> };
    Object.assign(saved[payload.index], copy(payload.value)); return {};
  });
  const writer = section === 'interactions-api-key' ? patch : put;
  const mount = () => render(<MemoryRouter initialEntries={['/edit/0']}><Routes><Route path="/edit/:index" element={element} /><Route path="/ai-providers" element={<div>saved</div>} /></Routes></MemoryRouter>);
  const first = mount();
  const input = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('Before'));
  expect(dirty()).toBe(false);
  fireEvent.change(input, { target: { value: '  After ' } });
  expect(dirty()).toBe(true);
  writer.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('save rejected');
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', weight: 7, models: [{ ...baseModel, 'display-name': 'After' }] });
  first.unmount(); const second = mount();
  const reloaded = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect((reloaded as HTMLInputElement).value).toBe('After');
  expect(dirty()).toBe(false);
  fireEvent.change(reloaded, { target: { value: '' } });
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([baseModel]);
  second.unmount(); mount();
  const empty = await screen.findByRole('textbox', { name: 'common.model_display_name_label 1' });
  expect((empty as HTMLInputElement).value).toBe('');
  expect(dirty()).toBe(false);
});
