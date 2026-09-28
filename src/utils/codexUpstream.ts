export { normalizeGrokBaseUrl as normalizeCodexBaseUrl } from './grokUpstream';

export const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export function readCodexBaseUrl(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('codex.base-url must be a string');
  return value;
}
