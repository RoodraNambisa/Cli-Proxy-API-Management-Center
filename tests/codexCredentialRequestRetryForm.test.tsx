import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CredentialRequestRetryInput } from '@/components/providers/CredentialRequestRetryInput';
import { AiProvidersCodexEditPage } from '@/pages/AiProvidersCodexEditPage';
import { apiClient } from '@/services/api/client';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { useAuthStore, useConfigStore } from '@/stores';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

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

const mountForm = () =>
  render(
    <MemoryRouter initialEntries={['/edit/0']}>
      <Routes>
        <Route path="/edit/:index" element={<AiProvidersCodexEditPage />} />
        <Route path="/ai-providers" element={<div>saved</div>} />
      </Routes>
    </MemoryRouter>
  );
const blocksNavigation = () => {
  const options = mocks.guard.mock.lastCall?.[0] as unknown as {
    shouldBlock: (context: unknown) => boolean;
  };
  return options.shouldBlock({
    currentLocation: { pathname: '/edit/0' },
    nextLocation: { pathname: '/ai-providers' },
  });
};
function serverFixture() {
  let saved: Array<Record<string, unknown>> = [
    {
      'api-key': 'test-original-key',
      'base-url': 'https://example.invalid',
      'request-retry': 5,
      weight: 7,
    },
  ];
  vi.spyOn(useConfigStore.getState(), 'fetchConfig').mockImplementation(
    async () => normalizeConfigResponse({ 'codex-api-key': saved }).codexApiKeys
  );
  const put = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, data) => {
    saved = JSON.parse(JSON.stringify(data));
    return {};
  });
  return { put, saved: () => saved };
}

describe('Codex credential request retry form', () => {
  test.each([
    ['0', 0],
    ['', undefined],
    ['2147483647', 2_147_483_647],
  ] as const)(
    'saves and reloads request retry %s without changing the key',
    async (inputValue, expected) => {
      const server = serverFixture();
      const first = mountForm();
      const input = await screen.findByRole('spinbutton', {
        name: 'ai_providers.request_retry_label',
      });
      await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
      expect(blocksNavigation()).toBe(false);
      fireEvent.change(input, { target: { value: inputValue } });
      expect(blocksNavigation()).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      await screen.findByText('saved');
      expect(server.put).toHaveBeenCalledTimes(1);
      expect(server.saved()[0]['api-key']).toBe('test-original-key');
      expect(server.saved()[0].weight).toBe(7);
      expect(server.saved()[0]['request-retry']).toBe(expected);
      first.unmount();
      mountForm();
      const reloaded = await screen.findByRole('spinbutton', {
        name: 'ai_providers.request_retry_label',
      });
      await waitFor(() => expect((reloaded as HTMLInputElement).value).toBe(inputValue));
      expect(blocksNavigation()).toBe(false);
    }
  );

  test('invalid and rejected saves preserve the draft and allow a corrected retry', async () => {
    const server = serverFixture();
    mountForm();
    const input = await screen.findByRole('spinbutton', {
      name: 'ai_providers.request_retry_label',
    });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('5'));
    for (const value of ['1.5', '2147483648', '-1']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
      expect(server.put).not.toHaveBeenCalled();
      expect(blocksNavigation()).toBe(true);
    }
    server.put.mockRejectedValueOnce(new Error('server validation rejected'));
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await screen.findByText('server validation rejected');
    expect(blocksNavigation()).toBe(true);
    expect(server.saved()[0]['request-retry']).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await screen.findByText('saved');
    expect(server.saved()[0]['request-retry']).toBe(0);
  });

  test('a browser bad numeric input is invalid rather than an inherited blank', () => {
    const onChange = vi.fn();
    render(<CredentialRequestRetryInput value={5} onChange={onChange} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect([input.min, input.max, input.step]).toEqual(['0', '2147483647', '1']);
    Object.defineProperty(input, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(NaN);
    for (const locale of [en, ru, zhCN, zhTW]) {
      expect(locale.ai_providers.request_retry_label).toBeTruthy();
      expect(locale.ai_providers.request_retry_hint).toBeTruthy();
      expect(locale.ai_providers.request_retry_inherit).toBeTruthy();
      expect(locale.ai_providers.request_retry_invalid).toBeTruthy();
    }
  });
});
