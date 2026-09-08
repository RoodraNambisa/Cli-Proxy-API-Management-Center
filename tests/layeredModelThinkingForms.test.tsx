import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { AiProvidersOpenAIEditLayout } from '@/pages/AiProvidersOpenAIEditLayout';
import { AiProvidersOpenAIEditPage } from '@/pages/AiProvidersOpenAIEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';
import { useOpenAIEditDraftStore } from '@/stores/useOpenAIEditDraftStore';
import type { ModelEntry } from '@/components/providers/types';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
  useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} });
});
function DraftViewer() {
  const { form } = useOutletContext<{ form: { modelEntries: ModelEntry[] } }>();
  return <output aria-label="draft-models">{JSON.stringify(form.modelEntries)}</output>;
}
const forms = [{
  key: 'claude', section: 'claude-api-key', layout: <AiProvidersClaudeEditLayout />, page: <AiProvidersClaudeEditPage />,
  credential: { 'api-key': 'fixture', weight: 7 },
}, {
  key: 'openai', section: 'openai-compatibility', layout: <AiProvidersOpenAIEditLayout />, page: <AiProvidersOpenAIEditPage />,
  credential: { name: 'compat', 'api-key-entries': [{ 'api-key': 'fixture', weight: 7 }, { 'api-key': 'other', weight: 4 }] },
}];
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ nextLocation: { pathname: '/ai-providers' } });

test.each(forms)('$key retains thinking capability drafts across layers, rejection, save and reload', async ({ key, section, layout, page, credential }) => {
  const model = { name: 'upstream', alias: 'local', 'display-name': 'Label', 'max-context-length': 131072, 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ ...credential, 'base-url': 'https://example.invalid', models: [{ ...model, thinking: { levels: [], future: 'keep' } }] }];
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ [section]: saved }));
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => {
    const config = normalizeConfigResponse({ [section]: saved });
    return key === 'openai' ? config.openaiCompatibility : config.claudeApiKeys;
  });
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const mount = (viewer = false) => render(<MemoryRouter initialEntries={[`/ai-providers/${key}/0`]}><Routes>
    <Route path={`/ai-providers/${key}/:index`} element={layout}><Route index element={viewer ? <DraftViewer /> : page} /></Route>
    <Route path="/ai-providers" element={<div>saved</div>} />
  </Routes></MemoryRouter>);
  const first = mount();
  await screen.findByDisplayValue('upstream');
  const input = screen.getByRole('spinbutton', { name: 'model_thinking.min 1' });
  expect(dirty()).toBe(false);
  for (const value of ['-1', '1.5', '2147483648']) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(put).not.toHaveBeenCalled();
    expect(dirty()).toBe(true);
  }
  fireEvent.change(input, { target: { value: '100' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: high' }));
  expect(dirty()).toBe(true);
  const layer = mount(true);
  await waitFor(() => expect(within(layer.container).getByLabelText('draft-models').textContent).toContain('"levels":["high"]'));
  layer.unmount();
  put.mockRejectedValueOnce(new Error('save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('save rejected'), 'error'));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ ...credential, models: [{ ...model, thinking: { levels: ['high'], min: 100, max: 200, future: 'keep' } }] });
  first.unmount(); const second = mount();
  await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }) as HTMLInputElement).value).toBe('200'));
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'model_thinking.reset' }));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([model]);
  second.unmount(); mount();
  await screen.findByDisplayValue('upstream');
  expect(screen.getByText('model_thinking.inherit')).toBeTruthy();
  expect(dirty()).toBe(false);
});
