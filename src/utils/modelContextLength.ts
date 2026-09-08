export const MAX_MODEL_CONTEXT_LENGTH = 2_147_483_647;

export const isValidModelContextLength = (value: number | undefined): boolean =>
  value === undefined ||
  (Number.isSafeInteger(value) && value >= 0 && value <= MAX_MODEL_CONTEXT_LENGTH);

export const normalizeModelContextLength = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' && isValidModelContextLength(value) ? value : NaN;
};

export const serializeModelContextLength = (value: number | undefined): number | undefined => {
  if (!isValidModelContextLength(value))
    throw new Error('Model max-context-length must be an integer from 0 to 2147483647');
  return value === 0 ? undefined : value;
};
