import { render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { beforeEach, expect, test, vi } from 'vitest';
import { XAI_CONFIG } from '@/components/quota/quotaConfigs';
import type { QuotaRenderHelpers } from '@/components/quota/QuotaCard';
import { apiCallApi, type ApiCallResult } from '@/services/api/apiCall';
import { buildXaiBillingSummary, mergeXaiBillingSummaries, XAI_BILLING_MONTHLY_URL, XAI_BILLING_WEEKLY_URL, XAI_SETTINGS_URL } from '@/utils/quota';
import type { XaiBillingSummary } from '@/types';
import zh from '@/i18n/locales/zh-CN.json';

const t = ((key: string, options: Record<string, unknown> = {}) => {
  const text = key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], zh);
  return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ''));
}) as unknown as TFunction;
const helpers: QuotaRenderHelpers = {
  styles: {},
  QuotaProgressBar: ({ percent }) => <div data-testid="quota-percent">{percent === null ? 'unknown' : percent}</div>,
};
const file = { name: 'grok-fixture.json', type: 'xai', auth_index: 'fixture-auth', sub: 'fixture-user' };
const credits = {
  config: {
    currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2026-09-07T12:00:00Z', end: '2026-09-14T12:00:00Z' },
    onDemandCap: { val: 0 }, onDemandUsed: { val: 0 }, prepaidBalance: { val: 0 }, isUnifiedBillingUser: true,
    billingPeriodStart: '2026-09-07T12:00:00Z', billingPeriodEnd: '2026-09-14T12:00:00Z',
  },
};
const settings = { subscription_tier_display: 'SuperGrok Heavy', on_demand_enabled: null };
const result = (statusCode: number, body: unknown): ApiCallResult => ({ statusCode, body, bodyText: JSON.stringify(body), header: {} });
const display = (billing: XaiBillingSummary) => render(<>{XAI_CONFIG.renderQuotaItems({ status: 'success', billing }, t, helpers)}</>);

beforeEach(() => vi.restoreAllMocks());

test('matches Grok Build zero-usage fallback without adding a second monthly allowance', async () => {
  const request = vi.spyOn(apiCallApi, 'request').mockImplementation(async (input) => {
    expect(input.method).toBe('GET');
    expect(input.header).toMatchObject({ 'x-grok-client-version': '0.2.120', 'x-grok-client-mode': 'cli', 'x-userid': 'fixture-user' });
    if (input.url === XAI_BILLING_WEEKLY_URL) return result(200, credits);
    if (input.url === XAI_SETTINGS_URL) return result(200, settings);
    throw new Error('Legacy billing and inference must not be called for a valid credits snapshot');
  });
  const billing = await XAI_CONFIG.fetchQuota(file, t);
  expect(request).toHaveBeenCalledTimes(2);
  expect(billing).toMatchObject({ isCreditsConfig: true, isUnifiedBillingUser: true, usagePercent: 0, monthlyLimitCents: null, prepaidBalanceCents: 0, subscriptionTier: 'SuperGrok Heavy' });
  display(billing);
  expect(screen.getByText('SuperGrok Heavy')).toBeTruthy();
  expect(screen.getByText('统一周限额')).toBeTruthy();
  expect(screen.getByText('已用 0%')).toBeTruthy();
  expect(screen.queryByText('上游未返回比例')).toBeNull();
  expect(screen.getByText('充值余额')).toBeTruthy();
  expect(screen.getByText('未启用')).toBeTruthy();
  expect(screen.queryByText('月度积分')).toBeNull();
  expect(screen.getByTestId('quota-percent').textContent).toBe('100');
});

test('does not borrow a monthly percentage or monthly reset for a missing weekly percentage', () => {
  const weekly = buildXaiBillingSummary(credits.config);
  const monthly = buildXaiBillingSummary({ monthlyLimit: { val: 100 }, used: { val: 50 }, billingPeriodEnd: '2026-10-01T00:00:00Z' });
  const merged = mergeXaiBillingSummaries(weekly, monthly);
  expect(merged).toMatchObject({ periodType: 'weekly', usagePercent: 0, periodEnd: '2026-09-14T12:00:00Z', monthlyLimitCents: null });
  expect(merged?.billingPeriodEnd).toBeUndefined();
});

test('legacy billing keeps its allowance when shared balance metadata is present', () => {
  const billing = buildXaiBillingSummary({
    monthlyLimit: {val: 15000}, used: {val: 3000},
    billingPeriodEnd: '2026-10-01T00:00:00Z',
    isUnifiedBillingUser: false, prepaidBalance: {val: -1250},
  })!;
  expect(billing).toMatchObject({isCreditsConfig:false,periodType:'monthly',usagePercent:20,monthlyLimitCents:15000,prepaidBalanceCents:-1250});
  display(billing);
  expect(screen.getByText('月度积分')).toBeTruthy();
  expect(screen.getByTestId('quota-percent').textContent).toBe('80');
});

test('prepaid credit accounting signs do not appear as a negative balance', () => {
  const billing = buildXaiBillingSummary({...credits.config,prepaidBalance:{val:-1250}})!;
  display(billing);
  const amount=new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(12.5);
  expect(screen.getByText(amount)).toBeTruthy();
  expect(screen.queryByText(new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(-12.5))).toBeNull();
});

test('matches Grok Build reset fallback within the same billing response', () => {
  const billing = buildXaiBillingSummary({ currentPeriod: { type: 'weekly' }, creditUsagePercent: 20, billingPeriodStart: '2026-09-01T00:00:00Z', billingPeriodEnd: '2026-10-01T00:00:00Z' });
  expect(billing).toMatchObject({ periodType: 'weekly', usagePercent: 20 });
  expect(billing?.periodStart).toBeUndefined();
  expect(billing?.periodEnd).toBe('2026-10-01T00:00:00Z');
});

test('prefers explicit zero usage and hides deprecated allowance rows in modern snapshots', () => {
  const billing = buildXaiBillingSummary({ ...credits.config, creditUsagePercent: 0, monthlyLimit: { val: 0 }, used: { val: 0 } })!;
  expect(billing.usagePercent).toBe(0);
  display(billing);
  expect(screen.getByText('已用 0%')).toBeTruthy();
  expect(screen.queryByText('上游未返回比例')).toBeNull();
  expect(screen.queryByText('月度积分')).toBeNull();
  expect(screen.getByTestId('quota-percent').textContent).toBe('100');
});

test('handles monthly credits periods and snake case without labelling them weekly', () => {
  const billing = buildXaiBillingSummary({ current_period: { type: 'USAGE_PERIOD_TYPE_MONTHLY', end: '2026-10-01T00:00:00Z' }, credit_usage_percent: '40', is_unified_billing_user: true, prepaid_balance: { val: '1234' } })!;
  expect(billing).toMatchObject({ periodType: 'monthly', usagePercent: 40, prepaidBalanceCents: 1234 });
  display(billing);
  expect(screen.getByText('统一月限额')).toBeTruthy();
  expect(screen.getByTestId('quota-percent').textContent).toBe('60');
  expect(screen.queryByText('月度积分')).toBeNull();
});

test('reads proto3 empty money objects as zero without converting missing amounts to zero', () => {
  expect(buildXaiBillingSummary({ ...credits.config, prepaidBalance: {} })?.prepaidBalanceCents).toBe(0);
  const billing = buildXaiBillingSummary({ currentPeriod: credits.config.currentPeriod });
  expect(billing?.prepaidBalanceCents).toBeNull();
  expect(billing?.onDemandCapCents).toBeNull();
  display(billing!);
  expect(screen.getByText('上游未提供')).toBeTruthy();
  expect(screen.queryByText('未启用')).toBeNull();
});

test('falls back to the legacy response as a whole if credits cannot be read', async () => {
  const request = vi.spyOn(apiCallApi, 'request').mockImplementation(async (input) => {
    if (input.url === XAI_BILLING_WEEKLY_URL) return result(404, { error: 'unsupported' });
    if (input.url === XAI_SETTINGS_URL) return result(503, { error: 'unavailable' });
    if (input.url === XAI_BILLING_MONTHLY_URL) return result(200, { config: { monthlyLimit: { val: 15000 }, used: { val: 3000 }, billingPeriodEnd: '2026-10-01T00:00:00Z', onDemandCap: {} } });
    throw new Error('Unexpected request');
  });
  const billing = await XAI_CONFIG.fetchQuota(file, t);
  expect(request).toHaveBeenCalledTimes(3);
  expect(billing).toMatchObject({ isCreditsConfig: false, periodType: 'monthly', usedPercent: 20, monthlyLimitCents: 15000 });
  display(billing);
  expect(screen.getByText('月度积分')).toBeTruthy();
  expect(screen.getByText('SuperGrok')).toBeTruthy();
  expect(screen.queryByText('周限额')).toBeNull();
});

test('treats malformed credits like a failed query and preserves the original error when both fail', async () => {
  vi.spyOn(apiCallApi, 'request').mockImplementation(async (input) => result(input.url === XAI_SETTINGS_URL ? 200 : 403, input.url === XAI_SETTINGS_URL ? settings : { error: 'Access denied' }));
  await expect(XAI_CONFIG.fetchQuota(file, t)).rejects.toThrow('Access denied');
  expect(buildXaiBillingSummary({})).toBeNull();
});

test('does not treat a settings failure as a quota failure', async () => {
  vi.spyOn(apiCallApi, 'request').mockImplementation(async (input) => {
    if (input.url === XAI_SETTINGS_URL) throw new Error('settings unavailable');
    return result(200, { ...credits, onDemandEnabled: false, subscriptionTier: 'SuperGrok Heavy' });
  });
  const billing = await XAI_CONFIG.fetchQuota(file, t);
  expect(billing).toMatchObject({ usagePercent: 0, onDemandEnabled: false, subscriptionTier: 'SuperGrok Heavy' });
});

test.each([
  [{ creditUsagePercent: 35, monthlyLimit: { val: 100 }, used: { val: 90 } }, 35],
  [{ creditUsagePercent: 0, monthlyLimit: { val: 100 }, used: { val: 90 } }, 0],
  [{ creditUsagePercent: 120 }, 100],
  [{ credit_usage_percent: '-5' }, 0],
  [{ monthlyLimit: { val: 200 }, used: { val: 50 } }, 25],
  [{ monthly_limit: { val: '200' }, used: { val: '80' } }, 40],
  [{ monthlyLimit: { val: 100 }, used: { val: 130 } }, 100],
  [{ monthlyLimit: { val: 100 } }, 0],
  [{ monthlyLimit: {}, used: { val: 10 } }, 0],
  [{}, 0],
])('uses the official percentage, amount, then zero fallback for %j', (fields, expected) => {
  const billing = buildXaiBillingSummary({ ...credits.config, ...fields })!;
  expect(billing.usagePercent).toBe(expected);
  expect(billing.monthlyLimitCents).toBeNull();
  expect(billing.periodEnd).toBe(credits.config.currentPeriod.end);
});

test('does not infer a weekly period from a percentage alone or show a zero legacy allowance', () => {
  expect(buildXaiBillingSummary({ creditUsagePercent: 30 })?.periodType).toBe('unknown');
  const billing = buildXaiBillingSummary({ monthlyLimit: { val: 0 }, used: { val: 0 }, onDemandCap: { val: 0 }, billingPeriodEnd: '2026-10-01T00:00:00Z' })!;
  display(billing);
  expect(screen.queryByText('月度积分')).toBeNull();
  expect(screen.getByText('旧版账单未提供可显示的订阅额度')).toBeTruthy();
});
