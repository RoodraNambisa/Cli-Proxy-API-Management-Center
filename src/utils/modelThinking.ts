import type { ModelThinking } from '@/types/modelThinking';

export const MAX_MODEL_THINKING_BUDGET = 2_147_483_647;
export const MODEL_THINKING_LEVELS = [
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto',
] as const;
const levels = new Set<string>(MODEL_THINKING_LEVELS);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Draft snapshots must also accept temporarily invalid numeric input. */
export const copyModelThinking = (value?: ModelThinking): ModelThinking | undefined =>
  value === undefined ? undefined : { ...value, ...(value.levels ? { levels: [...value.levels] } : {}) };

export const areModelThinkingEqual = (left?: ModelThinking, right?: ModelThinking): boolean => {
  if (left === undefined || right === undefined) return left === right;
  if (!Object.is(left.min ?? 0, right.min ?? 0) || !Object.is(left.max ?? 0, right.max ?? 0)) return false;
  if (Boolean(left.zeroAllowed) !== Boolean(right.zeroAllowed) || Boolean(left.dynamicAllowed) !== Boolean(right.dynamicAllowed)) return false;
  const a = left.levels ?? [];
  const b = right.levels ?? [];
  return a.length === b.length && a.every((level, index) => level === b[index]);
};

const firstField = (value: Record<string, unknown>, keys: string[]) => {
  const key = keys.find((candidate) => own(value, candidate));
  return key === undefined ? undefined : value[key];
};

/** Retain unknown fields and saved level spelling; runtime normalization is separate. */
export const normalizeModelThinking = (value: unknown): ModelThinking | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Model thinking must be an object');
  }
  const raw = value as Record<string, unknown>;
  const result: ModelThinking = { ...raw };
  for (const key of [
    'min', 'max', 'levels', 'zero_allowed', 'zero-allowed', 'zeroAllowed',
    'dynamic_allowed', 'dynamic-allowed', 'dynamicAllowed',
  ]) delete result[key];
  for (const key of ['min', 'max'] as const) {
    const amount = raw[key];
    if (amount === undefined || amount === null) continue;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0 || amount > MAX_MODEL_THINKING_BUDGET) {
      throw new Error('Model thinking budgets must be integers from 0 to 2147483647');
    }
    result[key] = amount;
  }
  if ((result.min ?? 0) > (result.max ?? 0)) throw new Error('Model thinking min must not exceed max');
  for (const [target, keys] of [
    ['zeroAllowed', ['zero_allowed', 'zero-allowed', 'zeroAllowed']],
    ['dynamicAllowed', ['dynamic_allowed', 'dynamic-allowed', 'dynamicAllowed']],
  ] as const) {
    const flag = firstField(raw, [...keys]);
    if (flag === undefined || flag === null) continue;
    if (typeof flag !== 'boolean') throw new Error('Model thinking flags must be booleans');
    result[target] = flag;
  }
  if (raw.levels !== undefined && raw.levels !== null) {
    if (!Array.isArray(raw.levels) || raw.levels.some((level) => typeof level !== 'string' || !levels.has(level.trim().toLowerCase()))) {
      throw new Error('Model thinking levels must use supported reasoning levels');
    }
    result.levels = [...raw.levels];
  }
  return result;
};

export const isValidModelThinking = (value: unknown): boolean => {
  try {
    normalizeModelThinking(value);
    return true;
  } catch {
    return false;
  }
};

export const serializeModelThinking = (value: unknown): Record<string, unknown> | undefined => {
  const normalized = normalizeModelThinking(value);
  if (normalized === undefined) return undefined;
  const result: Record<string, unknown> = { ...normalized };
  delete result.zeroAllowed;
  delete result.dynamicAllowed;
  if (normalized.zeroAllowed !== undefined) result.zero_allowed = normalized.zeroAllowed;
  if (normalized.dynamicAllowed !== undefined) result.dynamic_allowed = normalized.dynamicAllowed;
  return result;
};
