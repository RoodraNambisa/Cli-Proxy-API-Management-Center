import type { CodexRequestCompression } from '@/types/config';

export function readCodexBooleanPolicy(
  codex: Record<string, unknown> | null | undefined,
  key: string,
  alias: string
): boolean {
  const value =
    codex && Object.prototype.hasOwnProperty.call(codex, key) ? codex[key] : codex?.[alias];
  if (value != null && typeof value !== 'boolean') {
    throw new Error(`codex.${key} must be a boolean`);
  }
  return value ?? false;
}

export function readCodexRequestCompression(
  codex: Record<string, unknown> | null | undefined
): CodexRequestCompression {
  const value =
    codex && Object.prototype.hasOwnProperty.call(codex, 'upstream-request-compression')
      ? codex['upstream-request-compression']
      : codex?.upstreamRequestCompression;
  if (value == null) return 'off';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === 'off') return 'off';
    if (normalized === 'zstd') return 'zstd';
  }
  throw new Error('codex.upstream-request-compression must be off or zstd');
}
