const SENTINEL_BUSY_CODE = 'sentinel_sdk_busy';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const containsSentinelBusyCode = (value: unknown, depth = 0): boolean => {
  if (depth > 4 || value === null || value === undefined) return false;
  if (typeof value === 'string') return value.includes(SENTINEL_BUSY_CODE);
  if (!isRecord(value)) return false;

  for (const key of ['code', 'error_category']) {
    if (value[key] === SENTINEL_BUSY_CODE) return true;
  }
  return ['error', 'message', 'details', 'data'].some((key) =>
    containsSentinelBusyCode(value[key], depth + 1)
  );
};

export const isChatGptWebSentinelBusyError = (value: unknown, explicitStatus?: number): boolean => {
  const statusValue = isRecord(value) ? value.status : undefined;
  const status = explicitStatus ?? (typeof statusValue === 'number' ? statusValue : undefined);
  return status === 503 && containsSentinelBusyCode(value);
};

export const getChatGptWebErrorMessage = (
  error: unknown,
  translate: (key: string) => string
): string => {
  if (isChatGptWebSentinelBusyError(error)) {
    return translate('chatgpt_web.errors.sentinel_sdk_busy');
  }
  return error instanceof Error ? error.message : String(error ?? '');
};
