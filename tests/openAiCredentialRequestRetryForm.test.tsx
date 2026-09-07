import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useOpenAIEditDraftStore } from '@/stores/useOpenAIEditDraftStore';

const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })),
}));
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
  const { form } = useOutletContext<{ form: { requestRetry?: number } }>();
  return <output aria-label="draft-request-retry">{String(form.requestRetry)}</output>;
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

test('OpenAI request retry survives route layers, failed saves, zero and clear reloads', async () => {
  let saved: Array<Record<string, unknown>> = [
    {
      name: 'test-provider',
      'base-url': 'https://example.invalid',
      'request-retry': 5,
      'api-key-entries': [
        { 'api-key': 'test-first-key', weight: 7 },
        { 'api-key': 'test-second-key', weight: 19 },
      ],
    },
    {
      name: 'untouched-provider',
      'base-url': 'https://untouched.invalid',
      'request-retry': 11,
      'api-key-entries': [],
    },
  ];
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(
    async () => normalizeConfigResponse({ 'openai-compatibility': saved }).openaiCompatibility
  );
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ 'openai-compatibility': saved }));
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => {
    saved = JSON.parse(JSON.stringify(body));
    return {};
  });
  const first = mount();
  let input = await screen.findByRole('spinbutton', { name: 'ai_providers.request_retry_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
  expect(
    screen.getAllByRole('spinbutton', { name: 'ai_providers.request_retry_label' })
  ).toHaveLength(1);
  expect(screen.getByText('ai_providers.provider_request_retry_scope')).toBeTruthy();
  fireEvent.change(input, { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '0' } });
  const layer = mount(true);
  await waitFor(() =>
    expect(within(layer.container).getByLabelText('draft-request-retry').textContent).toBe('0')
  );
  expect(useOpenAIEditDraftStore.getState().refCounts['openai:0']).toBe(2);
  layer.unmount();
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].form.requestRetry).toBe(0);
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('save rejected'), 'error')
  );
  expect(saved[0]['request-retry']).toBe(5);
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].baseline?.requestRetry).toBe(5);
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as {
    shouldBlock: (value: unknown) => boolean;
  };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]['request-retry']).toBe(0);
  expect(saved[0]['api-key-entries']).toEqual([
    { 'api-key': 'test-first-key', weight: 7 },
    { 'api-key': 'test-second-key', weight: 19 },
  ]);
  expect(saved[1]['request-retry']).toBe(11);
  first.unmount();
  const second = mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.request_retry_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe('0'));
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).not.toHaveProperty('request-retry');
  second.unmount();
  mount();
  input = await screen.findByRole('spinbutton', { name: 'ai_providers.request_retry_label' });
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
});
