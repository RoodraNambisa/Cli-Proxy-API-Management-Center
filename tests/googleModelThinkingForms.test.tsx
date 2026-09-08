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

test.each(forms)('$section preserves thinking drafts on failure and round-trips overrides and inheritance', async ({ section, element }) => {
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  const model = { name: 'gemini-test', alias: section === 'vertex-api-key' ? 'gemini-test' : 'local', 'display-name': 'Label', 'max-context-length': 131072, 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', weight: 7, models: [model] }, { 'api-key': 'untouched', models: [{ name: 'other', alias: section === 'vertex-api-key' ? 'other' : 'other-local' }] }];
  const untouched = copy(saved[1]);
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
  await screen.findAllByDisplayValue('gemini-test');
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByText('model_thinking.title 1'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: high' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.min 1' }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
  expect(dirty()).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.dynamic 1' }));
  writer.mockRejectedValueOnce(new Error('thinking save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('thinking save rejected');
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', weight: 7, models: [{ ...model, thinking: { levels: ['high'], min: 100, max: 200, dynamic_allowed: true } }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount(); const second = mount();
  await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }) as HTMLInputElement).value).toBe('200'));
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'model_thinking.reset' }));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([model]); expect(saved[1]).toEqual(untouched);
  second.unmount(); mount();
  await screen.findAllByDisplayValue('gemini-test');
  expect(screen.getByText('model_thinking.inherit')).toBeTruthy();
  expect(dirty()).toBe(false);
});
