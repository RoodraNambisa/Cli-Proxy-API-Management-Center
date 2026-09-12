import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { normalizeUsageFailureDetails } from '@/utils/usage/failureDetails';
import { normalizeUsageDetail } from '@/stores/useUsageStatsStore';
import { UsageErrorDetails } from '@/components/usage/UsageErrorDetails';
import en from '@/i18n/locales/en.json';
import ru from '@/i18n/locales/ru.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));

describe('usage failure diagnostics', () => {
  test('keeps failure metadata through the paged usage normalizer', () => {
    const raw = { timestamp: '2026-09-12T00:00:00Z', failed: true, status_code: 429, error_code: 'usage_limit_reached', error_type: 'quota_error', error_message: 'quota exhausted', error_response: '{"error":{"code":"usage_limit_reached"}}', failure_stage: 'upstream', request_id: 'local-fixture', upstream_request_id: 'upstream-fixture', credential_selected: true, upstream_committed: true, auth_request_slot_consumed: false };
    expect(normalizeUsageDetail(raw, 0)).toMatchObject(raw);
    expect(normalizeUsageFailureDetails({ status_code: '500', error_message: 'x'.repeat(10000), error_code: { unsafe: true }, upstream_committed: 'false' })).toEqual({ status_code: 500, error_message: 'x'.repeat(1024) });
    expect(normalizeUsageFailureDetails({})).toEqual({});
  });

  test('shows structured details as text without interpreting response HTML', async () => {
    const close = vi.fn();
    render(<UsageErrorDetails onClose={close} detail={{ status_code: 500, error_code: 'resource_exhausted', error_message: '<img src=x onerror=alert(1)>', error_response: '{"error":{"message":"capacity exhausted"}}', request_id: 'req-fixture' }} />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('resource_exhausted')).toBeTruthy();
    expect(screen.getByText('req-fixture')).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  test('explains missing historical details and translates every label', () => {
    render(<UsageErrorDetails onClose={vi.fn()} detail={{}} />);
    expect(screen.getByText('usage_stats.error_details.unavailable')).toBeTruthy();
    for (const locale of [ru, zhCN, zhTW]) {
      expect(Object.keys(locale.usage_stats.error_details)).toEqual(Object.keys(en.usage_stats.error_details));
    }
  });
});
