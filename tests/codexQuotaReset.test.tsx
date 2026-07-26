import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { CODEX_CONFIG } from '@/components/quota/quotaConfigs';
import { AuthFileQuotaSection } from '@/features/authFiles/components/AuthFileQuotaSection';
import { apiCallApi } from '@/services/api';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
  CODEX_RATE_LIMIT_RESET_CREDITS_URL,
  CODEX_USAGE_URL,
} from '@/utils/quota';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

const file: AuthFileItem = {
  name: 'codex-pro.json',
  type: 'codex',
  auth_index: 'auth-index-1',
  chatgpt_account_id: 'account-1',
  plan_type: 'pro',
};

const t = ((key: string) => key) as TFunction;

describe('Codex quota reset credits', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useQuotaStore.getState().clearQuotaCache();
    useNotificationStore.getState().clearAll();
    useNotificationStore.getState().hideConfirmation();
  });

  test('consumes one reset credit through the management API proxy and refreshes state', async () => {
    const request = vi.spyOn(apiCallApi, 'request').mockImplementation(async (payload) => {
      if (payload.method === 'POST' && payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL) {
        return { statusCode: 200, header: {}, bodyText: '{}', body: {} };
      }
      if (payload.method === 'GET' && payload.url === CODEX_USAGE_URL) {
        return {
          statusCode: 200,
          header: {},
          bodyText: '',
          body: { plan_type: 'pro', rate_limit: {} },
        };
      }
      if (payload.method === 'GET' && payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_URL) {
        return {
          statusCode: 200,
          header: {},
          bodyText: '',
          body: { available_count: 0, credits: [] },
        };
      }
      throw new Error(`Unexpected request: ${payload.method} ${payload.url}`);
    });

    const data = await CODEX_CONFIG.resetQuota?.(file, t, 'credit-1');

    const consumeRequest = request.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.url === CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL);
    expect(consumeRequest).toMatchObject({
      authIndex: 'auth-index-1',
      method: 'POST',
      url: CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL,
      header: {
        'Chatgpt-Account-Id': 'account-1',
      },
    });
    expect(JSON.parse(consumeRequest?.data ?? '{}')).toEqual({
      credit_id: 'credit-1',
      redeem_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
    });
    expect(data).toMatchObject({
      planType: 'pro',
      resetCreditsData: {
        availableCount: 0,
        credits: [],
        error: '',
      },
    });
  });

  test('uses the selected reset credit only after confirmation', async () => {
    const resetQuota = vi.spyOn(CODEX_CONFIG, 'resetQuota').mockResolvedValue({
      planType: 'pro',
      windows: [],
      resetCreditsData: {
        availableCount: 0,
        credits: [],
        error: '',
      },
    });
    useQuotaStore.getState().setCodexQuota({
      [file.name]: {
        status: 'success',
        windows: [],
        planType: 'pro',
        resetCreditsAvailableCount: 2,
        resetCredits: [
          {
            id: 'credit-1',
            status: 'available',
            grantedAt: '',
            expiresAt: '2026-07-30T00:00:00Z',
          },
          {
            id: 'credit-2',
            status: 'available',
            grantedAt: '',
            expiresAt: '2026-08-15T00:00:00Z',
          },
        ],
      },
    });

    render(<AuthFileQuotaSection file={file} quotaType="codex" disableControls={false} />);

    const creditActions = screen.getAllByRole('button', {
      name: 'codex_quota.use_reset_credit_button',
    });
    expect(creditActions).toHaveLength(2);
    fireEvent.click(creditActions[1]);
    expect(resetQuota).not.toHaveBeenCalled();

    const confirmation = useNotificationStore.getState().confirmation;
    expect(confirmation.isOpen).toBe(true);
    expect(confirmation.options?.confirmText).toBe('codex_quota.reset_confirm_button');

    await act(async () => {
      await confirmation.options?.onConfirm();
    });

    expect(resetQuota).toHaveBeenCalledWith(file, expect.any(Function), 'credit-2');
    expect(useQuotaStore.getState().codexQuota[file.name].resetCreditsAvailableCount).toBe(0);
    expect(
      screen.queryByRole('button', { name: 'codex_quota.use_reset_credit_button' })
    ).toBeNull();
  });

  test('does not offer a reset action when a credit has no credit_id', () => {
    useQuotaStore.getState().setCodexQuota({
      [file.name]: {
        status: 'success',
        windows: [],
        planType: 'pro',
        resetCreditsAvailableCount: 1,
        resetCredits: [
          {
            id: '',
            status: 'available',
            grantedAt: '',
            expiresAt: '2026-07-30T00:00:00Z',
          },
        ],
      },
    });

    render(<AuthFileQuotaSection file={file} quotaType="codex" disableControls={false} />);

    expect(
      screen.queryByRole('button', { name: 'codex_quota.use_reset_credit_button' })
    ).toBeNull();
  });
});
