export const MAX_CREDENTIAL_REQUEST_RETRY = 2_147_483_647;

export const isValidCredentialRequestRetry = (value: number | undefined): boolean =>
  value === undefined ||
  (Number.isSafeInteger(value) && value >= 0 && value <= MAX_CREDENTIAL_REQUEST_RETRY);

// Preserve invalid inputs for validation and retain the backend's legacy negative-as-zero rule.
export const normalizeCredentialRequestRetry = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return undefined;
    if (!/^[+-]?\d+$/.test(text)) return NaN;
    const integer = BigInt(text);
    if (integer < -9223372036854775808n || integer > BigInt(MAX_CREDENTIAL_REQUEST_RETRY))
      return NaN;
    return integer <= 0n ? 0 : Number(integer);
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -9223372036854775808)
    return NaN;
  return value <= 0 ? 0 : value;
};

export const serializeCredentialRequestRetry = (value: number | undefined): number | undefined => {
  if (!isValidCredentialRequestRetry(value))
    throw new Error('Request retry must be an integer from 0 to 2147483647');
  return value;
};
