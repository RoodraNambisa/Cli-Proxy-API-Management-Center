import { describe, expect, test } from 'vitest';
import { normalizeUsageDetail } from '@/stores/useUsageStatsStore';
import { extractTotalTokens } from '@/utils/usage';

describe('usage detail compatibility', () => {
  test('normalizes cache creation tokens and service tiers', () => {
    const detail = normalizeUsageDetail(
      {
        timestamp: '2026-07-11T00:00:00Z',
        model: 'grok-4.5',
        request_service_tier: ' priority ',
        response_service_tier: ' flex ',
        tokens: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_tokens: 7,
          total_tokens: 15,
        },
      },
      0
    );

    expect(detail.tokens.cache_creation_tokens).toBe(7);
    expect(detail.tokens.total_tokens).toBe(15);
    expect(detail.request_service_tier).toBe('priority');
    expect(detail.response_service_tier).toBe('flex');
  });

  test('defaults missing optional fields without adding cache creation to total tokens', () => {
    const detail = normalizeUsageDetail({ tokens: {} }, 0);
    expect(detail.tokens.cache_creation_tokens).toBe(0);
    expect(detail.request_service_tier).toBeUndefined();
    expect(detail.response_service_tier).toBeUndefined();
    expect(
      extractTotalTokens({
        tokens: { input_tokens: 3, output_tokens: 4, cache_creation_tokens: 99 },
      })
    ).toBe(7);
  });
});
