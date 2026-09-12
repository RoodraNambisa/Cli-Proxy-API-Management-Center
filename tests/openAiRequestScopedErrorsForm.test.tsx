import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useOpenAIEditDraftStore } from '@/stores/useOpenAIEditDraftStore';
import type { OpenAIFormState } from '@/components/providers/types';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => { vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear(); useAuthStore.setState({ connectionStatus: 'connected' }); useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} }); });
function DraftViewer() {
  const { form } = useOutletContext<{ form: OpenAIFormState }>();
  return <output aria-label="draft-rules">{JSON.stringify(form.requestScopedErrors)}</output>;
}
const mount = (viewer = false) => render(<MemoryRouter initialEntries={['/ai-providers/openai/0']}><Routes>
  <Route path="/ai-providers/openai/:index" element={<AiProvidersOpenAIEditLayout />}><Route index element={viewer ? <DraftViewer /> : <AiProvidersOpenAIEditPage />} /></Route>
  <Route path="/ai-providers" element={<div>saved</div>} />
</Routes></MemoryRouter>);

test('OpenAI rules persist across route layers and rejection without losing the original baseline', async () => {
  const rule = { status: 500, match: [' original '], action: 'stop', future: 'keep' };
  let saved: Array<Record<string, unknown>> = [{ name: 'test-provider', 'base-url': 'https://example.invalid', 'api-key-entries': [{ 'api-key': 'test-first', weight: 7 }, { 'api-key': 'test-second', weight: 19 }], 'request-retry': 3, 'request-scoped-errors': [rule] }, { name: 'untouched', 'base-url': 'https://other.invalid', 'api-key-entries': [], 'request-scoped-errors': [rule] }];
  const untouched = JSON.parse(JSON.stringify(saved[1]));
  const keys = JSON.parse(JSON.stringify(saved[0]['api-key-entries']));
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ 'openai-compatibility': saved }));
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'openai-compatibility': saved }).openaiCompatibility);
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  fireEvent.click(await screen.findByRole('button', { name: /common.edit:/ }));
  const input = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(' original '));
  fireEvent.change(input, { target: { value: ' changed ' } });
  const layer = mount(true);
  await waitFor(() => expect(within(layer.container).getByLabelText('draft-rules').textContent).toContain(' changed '));
  layer.unmount();
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].form.requestScopedErrors?.[0].match).toEqual([' changed ']);
  const status = screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' });
  fireEvent.change(status, { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(status, { target: { value: '500' } });
  put.mockRejectedValueOnce(new Error('server rules rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('server rules rejected'), 'error'));
  expect(JSON.parse(useOpenAIEditDraftStore.getState().drafts['openai:0'].baseline!.requestScopedErrors)).toEqual([rule]);
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ name: 'test-provider', 'request-retry': 3, 'request-scoped-errors': [{ ...rule, match: [' changed '] }] });
  expect(saved[0]['api-key-entries']).toEqual(keys);
  expect(saved[1]).toEqual(untouched);
  first.unmount(); const second = mount();
  fireEvent.click(await screen.findByRole('button', { name: /common.edit:/ }));
  const reloaded = await screen.findByRole('textbox', { name: 'request_scoped_errors.match 1' });
  expect((reloaded as HTMLTextAreaElement).value).toBe(' changed ');
  fireEvent.click(screen.getByRole('button', { name: 'request_scoped_errors.remove_rule' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['request-scoped-errors']).toEqual([]);
  second.unmount(); mount();
  await screen.findByRole('button', { name: 'request_scoped_errors.add_rule' });
  expect(screen.queryByRole('textbox', { name: 'request_scoped_errors.match 1' })).toBeNull();
});
