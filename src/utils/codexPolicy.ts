export function readCodexBooleanPolicy(
  codex: Record<string, unknown> | null | undefined,
  key: string,
  alias: string
): boolean {
  const value = codex && Object.prototype.hasOwnProperty.call(codex, key)
    ? codex[key] : codex?.[alias];
  if (value != null && typeof value !== 'boolean') {
    throw new Error(`codex.${key} must be a boolean`);
  }
  return value ?? false;
}
