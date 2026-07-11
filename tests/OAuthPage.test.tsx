import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OAuthPage } from '@/pages/OAuthPage';

const mocks = vi.hoisted(() => ({
  startAuth: vi.fn(),
  getAuthStatus: vi.fn(),
  cancelAuth: vi.fn(),
  submitCallback: vi.fn(),
  listAuthFiles: vi.fn(),
  copyToClipboard: vi.fn(),
  showNotification: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@/services/api/oauth', () => ({
  oauthApi: {
    startAuth: mocks.startAuth,
    getAuthStatus: mocks.getAuthStatus,
    cancelAuth: mocks.cancelAuth,
    submitCallback: mocks.submitCallback,
  },
}));

vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: {
    list: mocks.listAuthFiles,
  },
}));

vi.mock('@/services/api/vertex', () => ({
  vertexApi: {
    importCredential: vi.fn(),
  },
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: mocks.copyToClipboard,
}));

vi.mock('@/stores', () => ({
  useNotificationStore: () => ({ showNotification: mocks.showNotification }),
  useThemeStore: (selector: (state: { resolvedTheme: 'light' }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; time?: string }) =>
      options?.defaultValue ?? (options?.time ? `${key} ${options.time}` : key),
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <OAuthPage />
    </MemoryRouter>
  );

const startXaiLogin = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText('auth_login.xai_oauth_button'));
    await Promise.resolve();
  });
};

describe('xAI device OAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.startAuth.mockReset();
    mocks.getAuthStatus.mockReset();
    mocks.cancelAuth.mockReset().mockResolvedValue({ status: 'ok', cancelled: true });
    mocks.submitCallback.mockReset();
    mocks.listAuthFiles.mockReset().mockResolvedValue({ files: [] });
    mocks.copyToClipboard.mockReset().mockResolvedValue(true);
    mocks.showNotification.mockReset();
    mocks.open.mockReset();
    vi.stubGlobal('open', mocks.open);
    mocks.startAuth.mockResolvedValue({
      status: 'ok',
      url: 'https://accounts.x.ai/device',
      state: 'xai-state',
      flow: 'device',
      user_code: 'ABCD-EFGH',
      expires_in: 900,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('shows and copies user_code, opens the URL, and handles wait then success', async () => {
    mocks.getAuthStatus
      .mockResolvedValueOnce({ status: 'wait' })
      .mockResolvedValueOnce({ status: 'ok' });
    renderPage();
    await startXaiLogin();

    expect(screen.getByText('ABCD-EFGH')).not.toBeNull();
    expect(screen.getByText('auth_login.xai_expires_in 15:00')).not.toBeNull();
    expect(mocks.open).toHaveBeenCalledWith(
      'https://accounts.x.ai/device',
      '_blank',
      'noopener,noreferrer'
    );

    await act(async () => {
      fireEvent.click(screen.getByText('auth_login.xai_copy_user_code'));
      await Promise.resolve();
    });
    expect(mocks.copyToClipboard).toHaveBeenCalledWith('ABCD-EFGH');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mocks.getAuthStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mocks.getAuthStatus).toHaveBeenCalledTimes(2);
    expect(mocks.listAuthFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByText('auth_login.xai_oauth_status_success')).not.toBeNull();
  });

  test('stops polling and displays the backend error', async () => {
    mocks.getAuthStatus.mockResolvedValue({ status: 'error', error: 'access denied' });
    renderPage();
    await startXaiLogin();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText(/access denied/)).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.getAuthStatus).toHaveBeenCalledTimes(1);
  });

  test('cancels the backend session from the UI', async () => {
    mocks.getAuthStatus.mockResolvedValue({ status: 'wait' });
    renderPage();
    await startXaiLogin();

    await act(async () => {
      fireEvent.click(screen.getByText('auth_login.xai_oauth_cancel'));
      await Promise.resolve();
    });
    expect(mocks.cancelAuth).toHaveBeenCalledWith('xai-state');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.getAuthStatus).not.toHaveBeenCalled();
  });

  test('expires the device flow, cancels the session, and stops polling', async () => {
    mocks.startAuth.mockResolvedValue({
      status: 'ok',
      url: 'https://accounts.x.ai/device',
      state: 'short-lived-state',
      flow: 'device',
      user_code: 'SHORT-CODE',
      expires_in: 2,
    });
    mocks.getAuthStatus.mockResolvedValue({ status: 'wait' });
    renderPage();
    await startXaiLogin();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(mocks.showNotification).toHaveBeenCalledWith(
      'auth_login.xai_oauth_timeout',
      'error'
    );
    expect(mocks.cancelAuth).toHaveBeenCalledWith('short-lived-state');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.getAuthStatus).not.toHaveBeenCalled();
  });

  test('cancels the session and clears timers when the page unmounts', async () => {
    mocks.getAuthStatus.mockResolvedValue({ status: 'wait' });
    const view = renderPage();
    await startXaiLogin();

    view.unmount();
    expect(mocks.cancelAuth).toHaveBeenCalledWith('xai-state');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.getAuthStatus).not.toHaveBeenCalled();
  });
});
