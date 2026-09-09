import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { AiProvidersGeminiEditPage } from '@/pages/AiProvidersGeminiEditPage';
import { AiProvidersVertexEditPage } from '@/pages/AiProvidersVertexEditPage';
import { AiProvidersClaudeEditLayout } from '@/pages/AiProvidersClaudeEditLayout';
import { AiProvidersClaudeEditPage } from '@/pages/AiProvidersClaudeEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { useClaudeEditDraftStore } from '@/stores/useClaudeEditDraftStore';
import { areModelEntriesEqual } from '@/utils/compare';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
  useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
});
const forms = [
  { kind: 'codex', section: 'codex-api-key', field: 'codexApiKeys', element: <AiProvidersCodexEditPage /> },
  { kind: 'gemini', section: 'gemini-api-key', field: 'geminiApiKeys', element: <AiProvidersGeminiEditPage /> },
  { kind: 'interactions', section: 'interactions-api-key', field: 'interactionsApiKeys', element: <AiProvidersGeminiEditPage providerType="interactions" /> },
  { kind: 'vertex', section: 'vertex-api-key', field: 'vertexApiKeys', element: <AiProvidersVertexEditPage /> },
  { kind: 'claude', section: 'claude-api-key', field: 'claudeApiKeys', element: <AiProvidersClaudeEditLayout /> },
] as const;

test.each(forms)('$kind compatibility alone becomes dirty, survives rejection and reloads both states', async ({ kind, section, field, element }) => {
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  const model = { name: 'upstream', alias: kind === 'vertex' ? 'upstream' : 'local', 'display-name': 'Label', 'max-context-length': 131072, thinking: { levels: [], future: true }, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', weight: 7, models: [model] }, { 'api-key': 'untouched', models: [{ name: 'other', alias: kind === 'vertex' ? 'other' : 'other-local', 'is-compat': true }] }];
  const untouched = copy(saved[1]);
  vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ [section]: copy(saved) }));
  vi.spyOn(useConfigStore.getState(), 'isCacheValid').mockReturnValue(false);
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ [section]: saved })[field]);
  const notify = vi.spyOn(useNotificationStore.getState(), 'showNotification');
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = copy(body); return {}; });
  const patch = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
    const payload = body as { index: number; value: Record<string, unknown> };
    Object.assign(saved[payload.index], copy(payload.value)); return {};
  });
  const writer = kind === 'interactions' ? patch : put;
  const path = `/ai-providers/${kind}/0`;
  const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ currentLocation: { pathname: path }, nextLocation: { pathname: '/ai-providers' } });
  const mount = () => render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path={`/ai-providers/${kind}/:index`} element={element}>{kind === 'claude' && <Route index element={<AiProvidersClaudeEditPage />} />}</Route>
    <Route path="/ai-providers" element={<div>saved</div>} />
  </Routes></MemoryRouter>);
  const first = mount();
  await screen.findAllByDisplayValue('upstream');
  const toggle = () => screen.getByRole('checkbox', { name: 'model_compatibility.label 1' }) as HTMLInputElement;
  expect(toggle().checked).toBe(false);
  expect(dirty()).toBe(false);
  fireEvent.click(toggle()); expect(dirty()).toBe(true);
  fireEvent.click(toggle()); expect(dirty()).toBe(false);
  fireEvent.click(toggle());
  writer.mockRejectedValueOnce(new Error('compatibility save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('compatibility save rejected'), 'error'));
  expect(dirty()).toBe(true); expect(toggle().checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', weight: 7, models: [{ ...model, 'is-compat': true }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount(); const second = mount();
  await waitFor(() => expect(toggle().checked).toBe(true));
  expect(dirty()).toBe(false);
  fireEvent.click(toggle()); expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([{ ...model, 'is-compat': false }]);
  second.unmount(); mount();
  await screen.findAllByDisplayValue('upstream');
  expect(toggle().checked).toBe(false); expect(dirty()).toBe(false);
});

test('compatibility dirty comparison treats missing and false as the same default', () => {
  const base = { name: 'upstream', alias: '' };
  expect(areModelEntriesEqual([base], [{ ...base, isCompat: false }])).toBe(true);
  expect(areModelEntriesEqual([base], [{ ...base, isCompat: true }])).toBe(false);
});
