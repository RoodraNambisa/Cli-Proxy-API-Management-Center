const SENTINEL_BUSY_CODE = 'sentinel_sdk_busy';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

export type ChatGptWebErrorDiagnostics = {
  category: string;
  failureStage: string;
  attempts: number;
  status?: number;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

const readErrorPayload = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null;
  for (const key of ['data', 'details']) {
    if (isRecord(value[key])) return value[key] as Record<string, unknown>;
  }
  return value;
};

export const getChatGptWebErrorDiagnostics = (value: unknown): ChatGptWebErrorDiagnostics => {
  const source = isRecord(value) ? value : {};
  const payload = readErrorPayload(value) ?? {};
  const categoryValue =
    payload.error_category ?? payload.code ?? source.error_category ?? source.code;
  const failureStageValue = payload.failure_stage ?? source.failure_stage;
  const attemptsValue = payload.attempts ?? source.attempts;
  const statusValue = source.status ?? payload.http_status ?? payload.status;
  return {
    category: typeof categoryValue === 'string' ? categoryValue.trim() : '',
    failureStage: typeof failureStageValue === 'string' ? failureStageValue.trim() : '',
    attempts:
      typeof attemptsValue === 'number' && Number.isSafeInteger(attemptsValue) && attemptsValue > 0
        ? attemptsValue
        : 0,
    status: typeof statusValue === 'number' ? statusValue : undefined,
  };
};

const translateOrFallback = (translate: Translate, key: string, fallback: string): string => {
  const translated = translate(key);
  return translated === key ? fallback : translated;
};

export const getChatGptWebErrorDiagnosticMessages = (
  value: unknown,
  translate: Translate
): string[] => {
  const diagnostics = getChatGptWebErrorDiagnostics(value);
  const messages: string[] = [];
  if (diagnostics.failureStage) {
    const stage = translateOrFallback(
      translate,
      `chatgpt_web.failure_stages.${diagnostics.failureStage}`,
      diagnostics.failureStage
    );
    messages.push(translate('chatgpt_web.diagnostics_stage', { stage }));
  }
  if (diagnostics.attempts > 0) {
    messages.push(
      translate('chatgpt_web.diagnostics_attempts', {
        count: diagnostics.attempts,
      })
    );
  }
  return messages;
};

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

export const getChatGptWebErrorMessage = (error: unknown, translate: Translate): string => {
  if (isChatGptWebSentinelBusyError(error)) {
    return translate('chatgpt_web.errors.sentinel_sdk_busy');
  }
  const diagnostics = getChatGptWebErrorDiagnostics(error);
  if (diagnostics.category === 'cloudflare_challenge') {
    return translate('chatgpt_web.errors.cloudflare_challenge');
  }
  if (diagnostics.category === 'authorization_completion_required') {
    return translate('chatgpt_web.errors.authorization_completion_required');
  }
  if (diagnostics.category === 'login_proxy_invalid') {
    return translate('chatgpt_web.errors.login_proxy_invalid');
  }
  return error instanceof Error ? error.message : String(error ?? '');
};
