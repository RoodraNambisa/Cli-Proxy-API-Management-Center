import type { Document } from 'yaml';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';
import { API_KEY_PRIORITY_LIMIT } from './apiKeyGroups';

export interface ResponseModelRule {
  id: string;
  sourceIndex?: number;
  providers: string[];
  authPriorities: string[];
  credentialIds: string[];
  requestModels: string[];
}
export interface ResponseModelRewriteConfig {
  enabled: boolean;
  rules: ResponseModelRule[];
}
export const DEFAULT_RESPONSE_MODEL_REWRITE: ResponseModelRewriteConfig = {
  enabled: false,
  rules: [],
};
const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : []);
const clean = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export function readResponseModelRewrite(raw: unknown): ResponseModelRewriteConfig {
  const source = record(raw);
  return {
    enabled: source.enabled === true,
    rules: Array.isArray(source.rules)
      ? source.rules.map((raw, index) => {
          const rule = record(raw);
          return {
            id: `model-rule-${index}`,
            sourceIndex: index,
            providers: list(rule.providers),
            authPriorities: list(rule['auth-priorities']),
            credentialIds: list(rule['credential-ids']),
            requestModels: list(rule['request-models']),
          };
        })
      : [],
  };
}

export function responseModelRewriteError(value: ResponseModelRewriteConfig): boolean {
  return (
    value.rules.length > 128 ||
    value.rules.some(
      (rule) =>
        [rule.providers, rule.credentialIds, rule.requestModels].some(
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

export function responseModelRewriteEqual(
  left: ResponseModelRewriteConfig,
  right: ResponseModelRewriteConfig
): boolean {
  const comparable = (value: ResponseModelRewriteConfig) =>
    JSON.stringify(value, (key, item: unknown) =>
      ['id', 'sourceIndex'].includes(key) ? undefined : item
    );
  return comparable(left) === comparable(right);
}

export function writeResponseModelRewrite(doc: Document, value: ResponseModelRewriteConfig): void {
  if (responseModelRewriteError(value)) throw new Error('Invalid response-model-rewrite rules');
  const previous = record(readMergedYamlField(doc, ['response-model-rewrite']));
  const oldRules = Array.isArray(previous.rules) ? previous.rules : [];
  detachErrorRuleAliases(doc, doc.getIn(['response-model-rewrite'], true));
  doc.setIn(['response-model-rewrite'], {
    ...previous,
    enabled: value.enabled,
    rules: value.rules.map((rule) => ({
      ...(rule.sourceIndex === undefined ? {} : record(oldRules[rule.sourceIndex])),
      providers: clean(rule.providers).map((provider) => provider.toLowerCase()),
      'auth-priorities': [...new Set(rule.authPriorities.map(Number))],
      'credential-ids': clean(rule.credentialIds),
      'request-models': clean(rule.requestModels),
    })),
  });
}

export interface ResponseModelRewriteSummary {
  enabled: boolean;
  conditional: boolean;
  total: number;
  since: string;
  last_at?: string;
  rules: Array<{ rule: number; models: string[] | null }>;
  recent?: Array<{
    at: string;
    requested_model: string;
    original_model: string;
    response_model: string;
    rule: number;
    stream: boolean;
  }>;
}
