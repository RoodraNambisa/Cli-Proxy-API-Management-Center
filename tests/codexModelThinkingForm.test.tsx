import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';
import { copyModelThinking } from '@/utils/modelThinking';
import { areModelEntriesEqual } from '@/utils/compare';

const mocks = vi.hoisted(() => ({ t: (key: string) => key, guard: vi.fn(() => ({ allowNextNavigation: vi.fn() })) }));
vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: mocks.guard }));
beforeEach(() => {
  vi.restoreAllMocks(); mocks.guard.mockClear(); localStorage.clear(); sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
});
const mount = () => render(<MemoryRouter initialEntries={['/edit/0']}><Routes>
  <Route path="/edit/:index" element={<AiProvidersCodexEditPage />} />
  <Route path="/ai-providers" element={<div>saved</div>} />
</Routes></MemoryRouter>);
const dirty = () => (mocks.guard.mock.lastCall?.[0] as unknown as { shouldBlock: (value: unknown) => boolean }).shouldBlock({ currentLocation: { pathname: '/edit/0' }, nextLocation: { pathname: '/ai-providers' } });

test('Codex thinking edits save, reload and clear while failed drafts retain credentials and model fields', async () => {
  const model = { name: 'gpt-5.5', alias: 'local-model', 'display-name': 'Label', 'max-context-length': 131072, 'force-mapping': true, future: { keep: true } };
  let saved: Array<Record<string, unknown>> = [{ 'api-key': 'fixture', 'base-url': 'https://example.invalid', weight: 3, models: [model] }, { 'api-key': 'untouched', models: [{ name: 'other' }] }];
  const untouched = JSON.parse(JSON.stringify(saved[1]));
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => normalizeConfigResponse({ 'codex-api-key': saved }).codexApiKeys);
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => { saved = JSON.parse(JSON.stringify(body)); return {}; });
  const first = mount();
  await screen.findByDisplayValue('gpt-5.5');
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByText('model_thinking.title 1'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.levels 1: high' }));
  expect(dirty()).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.min 1' }), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(put).not.toHaveBeenCalled();
  expect(dirty()).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'model_thinking.zero 1' }));
  put.mockRejectedValueOnce(new Error('thinking save rejected'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('thinking save rejected');
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0]).toMatchObject({ 'api-key': 'fixture', weight: 3, models: [{ ...model, thinking: { levels: ['high'], min: 100, max: 200, zero_allowed: true } }] });
  expect(saved[1]).toEqual(untouched);
  first.unmount();
  const second = mount();
  await waitFor(() => expect((screen.getByRole('spinbutton', { name: 'model_thinking.max 1' }) as HTMLInputElement).value).toBe('200'));
  expect(dirty()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'model_thinking.reset' }));
  expect(dirty()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(saved[0].models).toEqual([model]);
  second.unmount(); mount();
  await screen.findByDisplayValue('gpt-5.5');
  expect(screen.getByText('model_thinking.inherit')).toBeTruthy();
  expect(dirty()).toBe(false);
});

test('model dirty comparison distinguishes inheritance and handles invalid numeric drafts without validation exceptions', () => {
  const base = { name: 'upstream', alias: '' };
  const source = { min: 2, max: 1, levels: ['high'] };
  const copied = copyModelThinking(source)!;
  copied.levels![0] = 'low';
  expect(source.levels).toEqual(['high']);
  expect(areModelEntriesEqual([base], [{ ...base, thinking: {} }])).toBe(false);
  expect(areModelEntriesEqual([{ ...base, thinking: {} }], [{ ...base, thinking: { min: 0, max: 0, zeroAllowed: false, levels: [] } }])).toBe(true);
  expect(areModelEntriesEqual([{ ...base, thinking: source }], [{ ...base, thinking: copied }])).toBe(false);
  expect(areModelEntriesEqual([{ ...base, thinking: { min: NaN } }], [{ ...base, thinking: { min: NaN } }])).toBe(true);
});
