import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';
import type { ProviderFormState } from '@/components/providers/types';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => { vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear(); useAuthStore.setState({ connectionStatus: 'connected' }); useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} }); });
function DraftViewer() {
  const { form } = useOutletContext<{ form: ProviderFormState }>();
  return <output aria-label="draft-rules">{JSON.stringify(form.requestScopedErrors)}</output>;
}
const mount = (viewer = false) => render(<MemoryRouter initialEntries={['/ai-providers/claude/0']}><Routes>
  <Route path="/ai-providers/claude/:index" element={<AiProvidersClaudeEditLayout />}><Route index element={viewer ? <DraftViewer /> : <AiProvidersClaudeEditPage />} /></Route>
  <Route path="/ai-providers" element={<div>saved</div>} />
</Routes></MemoryRouter>);

test('Claude rules persist across route layers and rejection without losing the original baseline', async () => {
  const rule = { status: 500, match: [' original '], action: 'stop', future: 'keep' };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'test-original', weight: 7, 'request-retry': 3, 'request-scoped-errors': [rule] }];
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'claude-api-key': saved }).claudeApiKeys);
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
  expect(useClaudeEditDraftStore.getState().drafts['claude:0'].form.requestScopedErrors?.[0].match).toEqual([' changed ']);
  const status = screen.getByRole('spinbutton', { name: 'request_scoped_errors.status' });
  fireEvent.change(status, { target: { value: '600' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(status, { target: { value: '500' } });
  put.mockRejectedValueOnce(new Error('server rules rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('server rules rejected'), 'error'));
  expect(JSON.parse(useClaudeEditDraftStore.getState().drafts['claude:0'].baseline!.requestScopedErrors)).toEqual([rule]);
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'test-original', weight: 7, 'request-retry': 3, 'request-scoped-errors': [{ ...rule, match: [' changed '] }] });
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
