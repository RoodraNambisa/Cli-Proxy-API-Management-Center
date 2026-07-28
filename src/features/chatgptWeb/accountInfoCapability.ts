const MAX_UNSUPPORTED_GENERATIONS = 32;
const unsupportedGenerations = new Set<string>();
const listeners = new Set<(key: string, unsupported: boolean) => void>();

const normalizeGenerationKey = (key: string): string => key.trim();
const notifyCapabilityChange = (key: string, unsupported: boolean): void => {
  for (const listener of Array.from(listeners)) {
    listener(key, unsupported);
  }
};

export const isChatGptWebAccountInfoUnsupported = (key: string): boolean => {
  const normalized = normalizeGenerationKey(key);
  return normalized !== '' && unsupportedGenerations.has(normalized);
};

export const markChatGptWebAccountInfoUnsupported = (key: string): void => {
  const normalized = normalizeGenerationKey(key);
  if (normalized === '') return;
  const changed = !unsupportedGenerations.has(normalized);
  unsupportedGenerations.delete(normalized);
  unsupportedGenerations.add(normalized);
  while (unsupportedGenerations.size > MAX_UNSUPPORTED_GENERATIONS) {
    const oldest = unsupportedGenerations.values().next().value;
    if (typeof oldest !== 'string') break;
    unsupportedGenerations.delete(oldest);
    notifyCapabilityChange(oldest, false);
  }
  if (changed) notifyCapabilityChange(normalized, true);
};

export const clearChatGptWebAccountInfoUnsupported = (key: string): void => {
  const normalized = normalizeGenerationKey(key);
  if (normalized !== '' && unsupportedGenerations.delete(normalized)) {
    notifyCapabilityChange(normalized, false);
  }
};

export const subscribeChatGptWebAccountInfoCapability = (
  listener: (key: string, unsupported: boolean) => void
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const resetChatGptWebAccountInfoCapabilityCache = (): void => {
  const keys = Array.from(unsupportedGenerations);
  unsupportedGenerations.clear();
  for (const key of keys) notifyCapabilityChange(key, false);
};
