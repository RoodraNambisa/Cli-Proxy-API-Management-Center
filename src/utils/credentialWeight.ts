export const MAX_CREDENTIAL_WEIGHT = 1_000_000;

export const isValidCredentialWeight = (value: number | undefined): boolean =>
  value === undefined ||
  (Number.isSafeInteger(value) && value >= 0 && value <= MAX_CREDENTIAL_WEIGHT);

// Legacy non-positive integers have the same meaning as zero in the backend.
export const normalizeCredentialWeight = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return undefined;
    if (!/^[+-]?\d+$/.test(text)) return NaN;
    const integer = BigInt(text);
    if (integer < -9223372036854775808n || integer > BigInt(MAX_CREDENTIAL_WEIGHT)) return NaN;
    return integer <= 0n ? 0 : Number(integer);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -9223372036854775808) return NaN;
  return value <= 0 ? 0 : value;
};

export const serializeCredentialWeight = (value: number | undefined): number | undefined => {
  if (!isValidCredentialWeight(value))
    throw new Error('Weight must be an integer from 0 to 1000000');
  return value;
};
