import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: mocks.t }),
}));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks();
  mocks.guard.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
});
function DraftViewer() {
  const { form } = useOutletContext<{ form: { weight?: number } }>();
  return <output aria-label="draft-weight">{String(form.weight)}</output>;
}
function mount(viewer = false) {
  return render(
    <MemoryRouter initialEntries={['/ai-providers/claude/0']}>
      <Routes>
        <Route path="/ai-providers/claude/:index" element={<AiProvidersClaudeEditLayout />}>
          <Route index element={viewer ? <DraftViewer /> : <AiProvidersClaudeEditPage />} />
        </Route>
        <Route path="/ai-providers" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('Claude weight survives route layers, failed saves, zero and clear reloads', async () => {
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'test-original-key', weight: 5 }];
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'claude-api-key': saved }).claudeApiKeys);
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  let input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
  fireEvent.change(input, { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '0' } });
  const layer = mount(true);
  await waitFor(() => expect(within(layer.container).getByLabelText('draft-weight').textContent).toBe('0'));
  expect(useClaudeEditDraftStore.getState().refCounts['claude:0']).toBe(2);
  layer.unmount();
  expect(useClaudeEditDraftStore.getState().drafts['claude:0'].form.weight).toBe(0);
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('save rejected'), 'error'));
  expect(saved[0].weight).toBe(5);
  expect(useClaudeEditDraftStore.getState().drafts['claude:0'].baseline?.weight).toBe(5);
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'test-original-key', weight: 0 });
  first.unmount();
  const second = mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('0'));
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).not.toHaveProperty('weight');
  second.unmount();
  mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
});
