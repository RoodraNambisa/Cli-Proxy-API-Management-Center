import type { Document } from 'yaml';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';

export const CODEX_SERVICE_TIERS = ['priority', 'ultrafast', 'flex'] as const;
export interface CodexServiceTierRule {
  id: string;
  sourceIndex?: number;
  models: string[];
  tiers: string[];
  defaultTier: string;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const normalizeTier = (value: string) =>
  value.trim().toLowerCase() === 'fast' ? 'priority' : value.trim().toLowerCase();

export function readCodexServiceTiers(raw: unknown): CodexServiceTierRule[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('codex.service-tier-rules must be a list');
  return raw.map((value, index) => {
    const rule = record(value);
    if (
      !Array.isArray(rule.models) ||
      rule.models.some((item) => typeof item !== 'string') ||
      (rule.tiers != null &&
        (!Array.isArray(rule.tiers) || rule.tiers.some((item) => typeof item !== 'string'))) ||
      (rule.default != null && typeof rule.default !== 'string')
    ) {
      throw new Error('codex.service-tier-rules contains an invalid rule');
    }
    return {
      id: `service-tier-${index}`,
      sourceIndex: index,
      models: rule.models,
      tiers: ((rule.tiers as string[] | undefined) ?? []).map(normalizeTier),
      defaultTier: normalizeTier((rule.default as string | undefined) ?? '') || 'default',
    };
  });
}

export function codexServiceTiersError(rules: CodexServiceTierRule[]): boolean {
  const seen = new Set<string>();
  return (
    rules.length > 64 ||
    rules.some((rule) => {
      const modelsInvalid =
        !rule.models.length ||
        rule.models.length > 64 ||
        rule.models.some((raw) => {
          const model = raw.trim();
          if (
            !model ||
            new TextEncoder().encode(model).length > 256 ||
            /[\s\0?[\]\\]/.test(model) ||
            (model.includes('*') && model !== '*') ||
            seen.has(model)
          )
            return true;
          seen.add(model);
          return false;
        });
      return (
        modelsInvalid ||
        new Set(rule.tiers).size !== rule.tiers.length ||
        rule.tiers.some(
          (tier) => !CODEX_SERVICE_TIERS.includes(tier as (typeof CODEX_SERVICE_TIERS)[number])
        ) ||
        (rule.defaultTier !== 'default' && !rule.tiers.includes(rule.defaultTier))
      );
    })
  );
}

export function codexServiceTiersEqual(
  left: CodexServiceTierRule[],
  right: CodexServiceTierRule[]
): boolean {
  const clean = (rules: CodexServiceTierRule[]) =>
    rules.map(({ models, tiers, defaultTier }) => ({ models, tiers, defaultTier }));
  return JSON.stringify(clean(left)) === JSON.stringify(clean(right));
}

export function writeCodexServiceTiers(doc: Document, rules: CodexServiceTierRule[]): void {
  if (codexServiceTiersError(rules)) throw new Error('Invalid codex.service-tier-rules');
  const path = ['codex', 'service-tier-rules'];
  const old = record(readMergedYamlField(doc, ['codex']))['service-tier-rules'];
  const previous = Array.isArray(old) ? old : [];
  detachErrorRuleAliases(doc, doc.getIn(path, true));
  doc.setIn(
    path,
    rules.map((rule) => ({
      ...record(rule.sourceIndex === undefined ? undefined : previous[rule.sourceIndex]),
      models: rule.models.map((model) => model.trim()),
      tiers: rule.tiers,
      default: rule.defaultTier,
    }))
  );
}
