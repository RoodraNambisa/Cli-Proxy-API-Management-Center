import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { parseDocument } from 'yaml';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';
import { readGrokConfig, writeGrokConfig, grokConfigErrors } from '@/utils/grokConfig';

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
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ connectionStatus: 'connected' });
});

test('image policy and dynamic headers remain opt-in and round-trip without changing other YAML', () => {
  const doc = parseDocument('xai:\n  future: kept\n  headers: {X-Test: "$X-Client"}\n');
  const baseline = readGrokConfig(doc.toJS().xai);
  expect(baseline.imageToolPolicy).toBe('remove');
  expect(baseline.dynamicHeaders).toBe(false);
  const next = { ...baseline, imageToolPolicy: 'allow', dynamicHeaders: true };
  expect(grokConfigErrors(next)).toEqual({});
  writeGrokConfig(doc, next, baseline);
  expect(doc.toJS().xai).toMatchObject({
    future: 'kept',
    headers: { 'X-Test': '$X-Client' },
    'dynamic-headers': true,
    'image-generation-tool-policy': 'allow',
  });
  expect(readGrokConfig(doc.toJS().xai)).toEqual(next);
  expect(
    grokConfigErrors({ ...next, imageToolPolicy: 'unknown' })['grok.imageToolPolicy']
  ).toBeTruthy();
});

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/edit/0']}>
      <Routes>
        <Route path="/edit/:index" element={<AiProvidersCodexEditPage provider="xai" />} />
        <Route path="/ai-providers/xai" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>
  );

test('native Grok key editor uses its own endpoint and retains models and zero-valued options', async () => {
  const raw = {
    'xai-api-key': [
      {
        'api-key': 'native-fixture',
        'base-url': 'https://api.x.ai/v1',
        weight: 0,
        'request-retry': 0,
        headers: { 'X-Test': 'kept' },
        models: [{ name: 'grok-4.6', alias: 'fast', future: 'kept' }],
      },
    ],
  };
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue(
    normalizeConfigResponse(raw).xaiApiKeys
  );
  const put = vi.spyOn(apiClient, 'putAtConnection').mockResolvedValue({});
  mount();
  await screen.findByDisplayValue('native-fixture');
  expect(
    screen.queryByRole('checkbox', { name: 'ai_providers.xai_alpha_search_label' })
  ).toBeNull();
  fireEvent.change(screen.getByDisplayValue('native-fixture'), {
    target: { value: 'native-fixture-edited' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await screen.findByText('saved');
  expect(put).toHaveBeenCalledTimes(1);
  expect(put.mock.calls[0][1]).toBe('/xai-api-key');
  expect(put.mock.calls[0][2]).toMatchObject([
    {
      'api-key': 'native-fixture-edited',
      weight: 0,
      'request-retry': 0,
      headers: { 'X-Test': 'kept' },
      models: [{ name: 'grok-4.6', alias: 'fast', future: 'kept' }],
    },
  ]);
});

test('late save completion cannot replace another connection configuration', async () => {
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockResolvedValue([
    { apiKey: 'fixture', baseUrl: 'https://api.x.ai/v1' },
  ]);
  const update = vi.spyOn(useConfigStore.getState(), 'updateConfigValue');
  let finish!: (value: unknown) => void;
  const put = vi.spyOn(apiClient, 'putAtConnection').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = mount();
  await screen.findByDisplayValue('fixture');
  fireEvent.change(screen.getByDisplayValue('fixture'), { target: { value: 'changed' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => finish({}));
  expect(update).not.toHaveBeenCalled();
});
