import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AiProvidersGeminiEditPage } from '@/pages/AiProvidersGeminiEditPage';
import { AiProvidersVertexEditPage } from '@/pages/AiProvidersVertexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';

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
});

const forms = [
  { section: 'gemini-api-key', element: <AiProvidersGeminiEditPage /> },
  {
    section: 'interactions-api-key',
    element: <AiProvidersGeminiEditPage providerType="interactions" />,
  },
  { section: 'vertex-api-key', element: <AiProvidersVertexEditPage /> },
];

describe('Google credential request retry forms', () => {
  for (const { section, element } of forms) {
    test(section + ' preserves zero, clear, untouched credentials and a failed draft', async () => {
      let saved: Array<Record<string, unknown>> = [
        {
          'api-key': 'test-edited-key',
          'base-url': 'https://example.invalid',
          'request-retry': 5,
          weight: 9,
        },
        {
          'api-key': 'test-untouched-key',
          'base-url': 'https://example.invalid',
          'request-retry': 17,
          weight: 19,
        },
      ];
      const rawCopy = (value: unknown) => JSON.parse(JSON.stringify(value));
      vi.spyOn(apiClient, 'get').mockImplementation(async () => ({ [section]: rawCopy(saved) }));
      vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(async () => {
        const config = normalizeConfigResponse({ [section]: saved });
        return section === 'vertex-api-key'
          ? config.vertexApiKeys
          : section === 'interactions-api-key'
            ? config.interactionsApiKeys
            : config.geminiApiKeys;
      });
      const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => {
        saved = rawCopy(body);
        return {};
      });
      const patch = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
        const payload = body as { index: number; value: Record<string, unknown> };
        const values = rawCopy(payload.value);
        for (const [key, value] of Object.entries(values)) {
          if (value === null) delete saved[payload.index][key];
          else saved[payload.index][key] = value;
        }
        return {};
      });
      const mount = () =>
        render(
          <MemoryRouter initialEntries={['/edit/0']}>
            <Routes>
              <Route path="/edit/:index" element={element} />
              <Route path="/ai-providers" element={<div>saved</div>} />
            </Routes>
          </MemoryRouter>
        );
      let view = mount();
      let input = await screen.findByRole('spinbutton', {
        name: 'ai_providers.request_retry_label',
      });
      await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
      fireEvent.change(input, { target: { value: '1.5' } });
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      expect(put).not.toHaveBeenCalled();
      expect(patch).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: '0' } });
      const writer = section === 'interactions-api-key' ? patch : put;
      writer.mockRejectedValueOnce(new Error('save rejected'));
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await screen.findByText('save rejected');
      const guard = mocks.guard.mock.lastCall?.[0] as unknown as {
        shouldBlock: (value: unknown) => boolean;
      };
      expect(
        guard.shouldBlock({
          currentLocation: { pathname: '/edit/0' },
          nextLocation: { pathname: '/ai-providers' },
        })
      ).toBe(true);
      expect(saved[0]['request-retry']).toBe(5);
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await screen.findByText('saved');
      expect(saved[0]['request-retry']).toBe(0);
      expect(saved[0]['api-key']).toBe('test-edited-key');
      expect(saved[0].weight).toBe(9);
      expect(saved[1]).toMatchObject({
        'api-key': 'test-untouched-key',
        'request-retry': 17,
        weight: 19,
      });
      view.unmount();
      view = mount();
      input = await screen.findByRole('spinbutton', { name: 'ai_providers.request_retry_label' });
      await waitFor(() => expect((input as HTMLInputElement).value).toBe('0'));
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await screen.findByText('saved');
      expect(saved[0]).not.toHaveProperty('request-retry');
      view.unmount();
      mount();
      input = await screen.findByRole('spinbutton', { name: 'ai_providers.request_retry_label' });
      await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
    });
  }
});
