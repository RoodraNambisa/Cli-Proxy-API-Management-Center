import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import { getVisualConfigValidationErrors } from './useVisualConfig';

describe('Codex session identity pool validation', () => {
  it.each(['1', '4', '64'])('accepts %s', (value) => {
    const errors = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      codexFingerprintSessionIdentityPoolSize: value,
    });
    expect(errors.codexFingerprintSessionIdentityPoolSize).toBeUndefined();
  });

  it.each(['', '0', '1.5', '65'])('rejects %s', (value) => {
    const errors = getVisualConfigValidationErrors({
      ...DEFAULT_VISUAL_VALUES,
      codexFingerprintSessionIdentityPoolSize: value,
    });
    expect(errors.codexFingerprintSessionIdentityPoolSize).toBe('integer_range_1_64');
  });
});
