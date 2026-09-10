import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore, useOpenAIEditDraftStore } from '@/stores';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} });
});
const mount = () => render(<MemoryRouter initialEntries={['/ai-providers/openai/0']}><Routes>
  <Route path="/ai-providers/openai/:index" element={<AiProvidersOpenAIEditLayout />}><Route index element={<AiProvidersOpenAIEditPage />} /></Route>
  <Route path="/ai-providers" element={<div>saved</div>} />
</Routes></MemoryRouter>);

test('model input controls survive rejected saves, reload, and restored inheritance', async () => {
  const originalModel = { name: 'upstream', alias: 'local', future: { kept: true }, 'force-mapping': true };
  let saved: Array<Record<string, unknown>> = [{ name: 'fixture', 'base-url': 'https://example.test', 'api-key-entries': [{ 'api-key': 'fixture-key', weight: 7 }], models: [originalModel] }];
  const originalKeys = JSON.parse(JSON.stringify(saved[0]['api-key-entries']));
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ 'openai-compatibility': saved }));
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'openai-compatibility': saved }).openaiCompatibility);
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  let input = await screen.findByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.text' }) as HTMLInputElement;
  expect(input.checked).toBe(false);
  fireEvent.click(input);
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].form.modelEntries[0].inputModalities).toEqual(['text']);
  put.mockRejectedValueOnce(new Error('server model declaration rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('server model declaration rejected'), 'error'));
  expect(input.checked).toBe(true);
  expect(useOpenAIEditDraftStore.getState().drafts['openai:0'].baseline!.models[0].inputModalities).toBeUndefined();
  const guard = mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean };
  expect(guard.shouldBlock({ nextLocation: { pathname: '/ai-providers' } })).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([{ ...originalModel, 'input-modalities': ['text'] }]);
  expect(saved[0]['api-key-entries']).toEqual(originalKeys);
  first.unmount();
  const second = mount();
  input = await screen.findByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.text' }) as HTMLInputElement;
  expect(input.checked).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.image' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([{ ...originalModel, 'input-modalities': ['text', 'image'] }]);
  second.unmount();
  const third = mount();
  await screen.findByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.text' });
  fireEvent.click(screen.getByRole('button', { name: 'model_input_modalities.reset' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([originalModel]);
  third.unmount(); mount();
  input = await screen.findByRole('checkbox', { name: 'model_input_modalities.title 1: model_input_modalities.text' }) as HTMLInputElement;
  expect(input.checked).toBe(false);
});
