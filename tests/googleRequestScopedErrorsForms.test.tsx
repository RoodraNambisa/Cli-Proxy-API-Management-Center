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

test.each(forms)('$section saves and clears rules while retaining credentials and failed drafts', async ({ section, element }) => {
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  let saved: Array<Record<string, unknown>> = [
    { 'api-key': 'test-edited', 'base-url': 'https://example.invalid', weight: 7, 'request-retry': 3,
      'request-scoped-errors': [{ status: 500, match: [' original '], action: 'stop', future: 'keep' }] },
    { 'api-key': 'test-untouched', 'base-url': 'https://example.invalid', 'request-scoped-errors': [{ status: 400, match: ['other'], action: 'continue' }] },
  ];
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
  const pattern = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  await waitFor(() => expect((pattern as HTMLTextAreaElement).value).toBe(' original '));
  fireEvent.change(pattern, { target: { value: ' changed ' } });
  const status = screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' });
  fireEvent.change(status, { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  expect(patch).not.toHaveBeenCalled();
  fireEvent.change(status, { target: { value: '500' } });
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ currentLocation: { pathname: '/edit/0' }, nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  writer.mockRejectedValueOnce(new Error('server rules rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('server rules rejected');
  expect(saved[0]['request-scoped-errors']).toEqual([{ status: 500, match: [' original '], action: 'stop', future: 'keep' }]);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'test-edited', weight: 7, 'request-retry': 3,
    'request-scoped-errors': [{ status: 500, match: [' changed '], action: 'stop', future: 'keep' }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount(); const second = mount();
  await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['request-scoped-errors']).toEqual([]);
  second.unmount(); mount();
  await screen.findByRole('button', { name: 'request_scoped_errors.add_rule' });
  expect(screen.queryByRole('textbox', { name: 'request_scoped_errors.match 1' })).toBeNull();
});
