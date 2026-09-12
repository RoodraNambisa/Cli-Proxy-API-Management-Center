import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  KIMI_CONFIG,
  XAI_CONFIG,
} from '@/components/quota/quotaConfigs';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const file: AuthFileItem = Object.freeze({
  name: 'disabled-quota-fixture.json',
  type: 'codex',
  disabled: true,
});

test.each([{ retained_for_dependents: true }, { deletion_state: 'retained_for_dependents' }])(
  'keeps retained credentials blocked: %j',
  (retained) => {
    const fetchQuota = vi.spyOn(CODEX_CONFIG, 'fetchQuota');
    render(
      <AuthFileQuotaSection
        file={{ ...file, ...retained }}
        quotaType="codex"
        disableControls={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'codex_quota.refresh_button' })).toBeNull();
    const idle = screen.getByRole('button', { name: 'codex_quota.idle' });
    expect((idle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(idle);
    expect(fetchQuota).not.toHaveBeenCalled();
  }
);

beforeEach(() => {
  vi.restoreAllMocks();
  useQuotaStore.getState().clearQuotaCache();
  useNotificationStore.getState().clearAll();
  useNotificationStore.getState().hideConfirmation();
});

test('manually refreshes a disabled credential without auto-fetching or enabling it', async () => {
  const fetchQuota = vi
    .spyOn(CODEX_CONFIG, 'fetchQuota')
    .mockResolvedValue({ planType: 'pro', windows: [] });
  render(<AuthFileQuotaSection file={file} quotaType="codex" disableControls={false} />);
  const refresh = screen.getByRole('button', { name: 'codex_quota.refresh_button' });
  expect((refresh as HTMLButtonElement).disabled).toBe(false);
  expect(refresh.title).toBe('auth_files.disabled_quota_refresh_hint');
  expect(fetchQuota).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(refresh);
  });
  expect(fetchQuota).toHaveBeenCalledExactlyOnceWith(file, expect.any(Function));
  expect(useQuotaStore.getState().codexQuota[file.name].status).toBe('success');
  expect(file.disabled).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'codex_quota.refresh_button' }) as HTMLButtonElement)
      .disabled
  ).toBe(false);
  expect(CODEX_CONFIG.filterFn(file)).toBe(false);
});

test('keeps manual retry available after a quota error and blocks repeated in-flight clicks', async () => {
  let finish!: (value: { windows: [] }) => void;
  const fetchQuota = vi
    .spyOn(CODEX_CONFIG, 'fetchQuota')
    .mockRejectedValueOnce(Object.assign(new Error('fixture unauthorized'), { status: 401 }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
  render(<AuthFileQuotaSection file={file} quotaType="codex" disableControls={false} />);
  const refresh = screen.getByRole('button', { name: 'codex_quota.refresh_button' });
  await act(async () => {
    fireEvent.click(refresh);
  });
  expect(useQuotaStore.getState().codexQuota[file.name].status).toBe('error');
  fireEvent.click(refresh);
  await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(refresh);
  expect(fetchQuota).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish({ windows: [] });
  });
  expect(useQuotaStore.getState().codexQuota[file.name].status).toBe('success');
  expect(file.disabled).toBe(true);
});

test('can read reset credits while disabled but cannot consume them', async () => {
  const fetchCredits = vi.spyOn(CODEX_CONFIG, 'fetchResetCredits').mockResolvedValue({
    availableCount: 1,
    error: '',
    credits: [
      {
        id: 'credit-fixture',
        status: 'available',
        grantedAt: '',
        expiresAt: '2099-01-01T00:00:00Z',
      },
    ],
  });
  const consume = vi.spyOn(CODEX_CONFIG, 'resetQuota');
  render(<AuthFileQuotaSection file={file} quotaType="codex" disableControls={false} />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'codex_quota.refresh_reset_credits_button' })
    );
  });
  expect(fetchCredits).toHaveBeenCalledExactlyOnceWith(file, expect.any(Function));
  const reset = screen.getByRole('button', { name: 'codex_quota.use_reset_credit_button' });
  expect((reset as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(reset);
  expect(consume).not.toHaveBeenCalled();
  expect(useNotificationStore.getState().confirmation.isOpen).toBe(false);
});

test.each([
  { disableControls: true, runtimeOnly: false },
  { disableControls: false, runtimeOnly: true },
])('still blocks controls or runtime-only files: %j', ({ disableControls, runtimeOnly }) => {
  const fetchQuota = vi.spyOn(CODEX_CONFIG, 'fetchQuota');
  render(
    <AuthFileQuotaSection
      file={{ ...file, runtime_only: runtimeOnly }}
      quotaType="codex"
      disableControls={disableControls}
    />
  );
  expect(screen.queryByRole('button', { name: 'codex_quota.refresh_button' })).toBeNull();
  const idle = screen.getByRole('button', { name: 'codex_quota.idle' });
  expect((idle as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(idle);
  expect(fetchQuota).not.toHaveBeenCalled();
});

test.each([ANTIGRAVITY_CONFIG, CLAUDE_CONFIG, KIMI_CONFIG, XAI_CONFIG])(
  'retains a manual quota action for disabled $type cards',
  async (config) => {
    const fetchQuota = vi
      .spyOn(config, 'fetchQuota')
      .mockRejectedValue(new Error('fixture failure'));
    render(
      <AuthFileQuotaSection
        file={{ ...file, type: config.type }}
        quotaType={config.type}
        disableControls={false}
      />
    );
    const refresh = screen.getByRole('button', { name: `${config.i18nPrefix}.refresh_button` });
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(fetchQuota).toHaveBeenCalledOnce();
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  }
);
