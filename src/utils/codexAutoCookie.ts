import {
  readStateModelOverrides,
  splitStateList,
  type CodexStateOverride,
} from './codexStateOverride';

// Keep strategy inheritance aligned with the backend's CookieOnlyConflict.
export function autoCookieConflict(value: CodexStateOverride): string | undefined {
  if (!value.enabled) return;
  const overrides = readStateModelOverrides(value['model-overrides']) ?? [];
  const global = (model: string) =>
    overrides.find((item) => item.model === model)?.strategy ?? value.strategy;
  const models = (scope: string[]) => [
    ...new Set([
      ...scope,
      ...overrides.map((item) => String(item.model ?? '')),
      ...(scope.length ? [] : ['']),
    ]),
  ];
  if (value.rules === undefined) {
    for (const model of models(splitStateList(value.models))) {
      if (global(model) === 'cookie-only') return model ? `model-overrides (${model})` : 'strategy';
    }
    return;
  }
  for (const [index, rule] of value.rules.entries()) {
    if (rule.enabled === false || rule.action === 'skip') continue;
    const active = (rule['model-overrides'] ?? []).filter((item) => item.enabled !== false);
    const candidates = [...models(rule.models), ...active.flatMap((item) => item.models)];
    for (const model of candidates) {
      const strategy =
        active.find((item) => item.models.includes(model))?.settings.strategy ??
        rule.settings.strategy ??
        global(model);
      if (strategy === 'cookie-only') return `rules[${index}] (${rule.id})`;
    }
  }
}
