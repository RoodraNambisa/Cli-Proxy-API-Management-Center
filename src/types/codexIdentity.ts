export const codexIdentityBooleans = [
  'identity-confuse',
  'identity-confuse-require-session-affinity',
  'identity-confuse-restore-response',
  'spoof-session-identity',
  'enforce-software-identity',
  'passthrough-prompt-cache-key',
] as const;
export const codexIdentityFields = [
  ...codexIdentityBooleans,
  'fingerprint-mode',
  'session-identity-pool-size',
  'user-agent',
  'turn-state-policy',
] as const;
export type CodexIdentityOverride = Partial<
  Record<(typeof codexIdentityBooleans)[number], boolean>
> & {
  'fingerprint-mode'?: 'off' | 'device' | 'session' | 'full';
  'session-identity-pool-size'?: number;
  'user-agent'?: string;
  'turn-state-policy'?: 'passthrough' | 'strip' | 'guard-cross-account' | 'same-account-only';
};
export interface CodexIdentityPreviewResult {
  auth_index: string;
  priority: number;
  version: string;
  reason: string;
  applicable: boolean;
  policy: CodexIdentityOverride & {
    'identity-confuse-effective': boolean;
    'session-affinity': boolean;
  };
  sources: Record<string, string>;
  protected_fields: string[];
  software: { UserAgent: string; Originator: string; Version: string };
}
export function readCodexIdentityOverride(value: unknown): CodexIdentityOverride | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    codexIdentityFields
      .filter((key) => source[key] !== null && source[key] !== undefined)
      .map((key) => [key, source[key]])
  ) as CodexIdentityOverride;
}
