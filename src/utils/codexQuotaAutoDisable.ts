import type { Document } from 'yaml';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';
import { API_KEY_PRIORITY_LIMIT } from './apiKeyGroups';

export interface CodexQuotaDisableRule {
  id: string;
  sourceIndex?: number;
  providers: string[];
  authPriorities: string[];
  credentialIds: string[];
  weeklyRemainingPercent: string;
  fiveHourRemainingPercent: string;
}
export interface CodexQuotaAutoDisableConfig {
  enabled: boolean;
  rules: CodexQuotaDisableRule[];
}
export const DEFAULT_CODEX_QUOTA_AUTO_DISABLE: CodexQuotaAutoDisableConfig = {
  enabled: false,
  rules: [],
};
const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : []);
const clean = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
const path = ['codex', 'quota-auto-disable'];

export function readCodexQuotaAutoDisable(raw: unknown): CodexQuotaAutoDisableConfig {
  const source = record(raw);
  return {
    enabled: source.enabled === true,
    rules: Array.isArray(source.rules)
      ? source.rules.map((raw, index) => {
          const rule = record(raw);
          return {
            id: `quota-rule-${index}`,
            sourceIndex: index,
            providers: list(rule.providers),
            authPriorities: list(rule['auth-priorities']),
            credentialIds: list(rule['credential-ids']),
            weeklyRemainingPercent: String(rule['weekly-remaining-percent'] ?? ''),
            fiveHourRemainingPercent: String(rule['five-hour-remaining-percent'] ?? ''),
          };
        })
      : [],
  };
}

export function quotaThresholdError(value: string): boolean {
  if (!value.trim()) return false;
  const number = Number(value);
  return (
    !/^\d+(?:\.\d+)?$/.test(value.trim()) || !Number.isFinite(number) || number < 0 || number > 100
  );
}

export function codexQuotaAutoDisableError(value: CodexQuotaAutoDisableConfig): boolean {
  return (
    value.rules.length > 128 ||
    value.rules.some(
      (rule) =>
        (!rule.weeklyRemainingPercent.trim() && !rule.fiveHourRemainingPercent.trim()) ||
        quotaThresholdError(rule.weeklyRemainingPercent) ||
        quotaThresholdError(rule.fiveHourRemainingPercent) ||
        [rule.providers, rule.credentialIds].some(
          (values) =>
            values.length > 128 ||
            values.some(
              (item) =>
                !item.trim() || new TextEncoder().encode(item).length > 256 || /[\r\n\0]/.test(item)
            )
        ) ||
        rule.authPriorities.length > 128 ||
        rule.authPriorities.some(
          (item) =>
            !/^-?\d+$/.test(item.trim()) ||
            !Number.isSafeInteger(Number(item)) ||
            Math.abs(Number(item)) > API_KEY_PRIORITY_LIMIT
        )
    )
  );
}

export function codexQuotaAutoDisableEqual(
  left: CodexQuotaAutoDisableConfig,
  right: CodexQuotaAutoDisableConfig
): boolean {
  const comparable = (value: CodexQuotaAutoDisableConfig) =>
    JSON.stringify(value, (key, item: unknown) =>
      ['id', 'sourceIndex'].includes(key) ? undefined : item
    );
  return comparable(left) === comparable(right);
}

export function writeCodexQuotaAutoDisable(
  doc: Document,
  value: CodexQuotaAutoDisableConfig
): void {
  if (codexQuotaAutoDisableError(value)) throw new Error('Invalid codex.quota-auto-disable rules');
  const previous = record(record(readMergedYamlField(doc, ['codex']))['quota-auto-disable']);
  const oldRules = Array.isArray(previous.rules) ? previous.rules : [];
  detachErrorRuleAliases(doc, doc.getIn(path, true));
  doc.setIn(path, {
    ...previous,
    enabled: value.enabled,
    rules: value.rules.map((rule) => ({
      ...(rule.sourceIndex === undefined ? {} : record(oldRules[rule.sourceIndex])),
      providers: clean(rule.providers).map((provider) => provider.toLowerCase()),
      'auth-priorities': [...new Set(rule.authPriorities.map(Number))],
      'credential-ids': clean(rule.credentialIds),
      'weekly-remaining-percent': rule.weeklyRemainingPercent.trim()
        ? Number(rule.weeklyRemainingPercent)
        : null,
      'five-hour-remaining-percent': rule.fiveHourRemainingPercent.trim()
        ? Number(rule.fiveHourRemainingPercent)
        : null,
    })),
  });
}
