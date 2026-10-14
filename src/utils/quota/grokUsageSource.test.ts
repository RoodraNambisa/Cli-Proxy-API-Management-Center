import { describe, expect, it } from 'vitest';
import { buildXaiBillingSummary } from './builders';

describe('Grok quota ratio source', () => {
  it('distinguishes an explicit zero, amount calculation and compatibility zero', () => {
    expect(buildXaiBillingSummary({ creditUsagePercent: 0 })?.usageSource).toBe(
      'creditUsagePercent'
    );
    expect(
      buildXaiBillingSummary({ monthlyLimit: { val: '100' }, used: { val: '9' } })
    ).toMatchObject({ usageSource: 'amounts', usagePercent: 9 });
    expect(buildXaiBillingSummary({ isUnifiedBillingUser: true })).toMatchObject({
      usageSource: 'compatibility-zero',
      usagePercent: 0,
    });
  });
});
