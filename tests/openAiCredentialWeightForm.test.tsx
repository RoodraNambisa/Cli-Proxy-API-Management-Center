import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useOpenAIEditDraftStore } from '@/stores/useOpenAIEditDraftStore';

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
  useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} });
});
function DraftViewer() {
  const { form } = useOutletContext<{ form: { apiKeyEntries: Array<{ weight?: number }> } }>();
  return <output aria-label="draft-weight">{String(form.apiKeyEntries[1]?.weight)}</output>;
}
function mount(viewer = false) {
  return render(
    <MemoryRouter initialEntries={['/ai-providers/openai/0']}>
      <Routes>
        <Route path="/ai-providers/openai/:index" element={<AiProvidersOpenAIEditLayout />}>
          <Route index element={viewer ? <DraftViewer /> : <AiProvidersOpenAIEditPage />} />
        </Route>
        <Route path="/ai-providers" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('OpenAI weights belong to each credential and survive shared drafts and API reload', async () => {
  let saved = [{
    name: 'test-provider',
    'base-url': 'https://example.invalid',
    'api-key-entries': [
      { 'api-key': 'test-first-key', weight: 5 as number | undefined },
      { 'api-key': 'test-second-key', weight: 9 as number | undefined },
    ],
  }];
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'openai-compatibility': saved }).openaiCompatibility);
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  let input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label 2' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('9'));
  expect(screen.getAllByText('ai_providers.weight_hint')).toHaveLength(1);
  expect((screen.getByRole('spinbutton', { name: 'ai_providers.weight_label 1' }) as HTMLInputElement).value).toBe('5');
  fireEvent.change(input, { target: { value: '1000001' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '0' } });
  const layer = mount(true);
  await waitFor(() => expect(within(layer.container).getByLabelText('draft-weight').textContent).toBe('0'));
  layer.unmount();
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('save rejected'), 'error'));
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].baseline?.apiKeyEntries[1].weight).toBe(9);
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).not.toHaveProperty('weight');
  expect(saved[0]['api-key-entries']).toEqual([{ 'api-key': 'test-first-key', weight: 5 }, { 'api-key': 'test-second-key', weight: 0 }]);
  first.unmount();
  const second = mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label 2' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('0'));
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['api-key-entries'][1]).not.toHaveProperty('weight');
  expect(saved[0]['api-key-entries'][0].weight).toBe(5);
  second.unmount();
  mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.weight_label 2' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
});
