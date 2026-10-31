import type {
  AuthModelExclusionVisualEntry,
  VisualConfigValidationErrorCode,
} from '@/types/visualConfig';

export const AUTH_IMAGE_PRIORITY_CAPABILITY = 'auth-model-exclusions-image-priority-supported';

export function authImagePriorityScope(rule: AuthModelExclusionVisualEntry): 'all' | 'selected' {
  return (
    rule.disableImageGenerationScope ??
    (rule.disableImageGenerationPriorities?.length ? 'selected' : 'all')
  );
}

export function authImagePriorityError(
  rule: AuthModelExclusionVisualEntry
): VisualConfigValidationErrorCode | undefined {
  if (!rule.disableImageGeneration || authImagePriorityScope(rule) !== 'selected') return;
  const priorities = rule.disableImageGenerationPriorities ?? [];
  if (!priorities.length) return 'auth_model_exclusion_image_priorities_required';
  if (priorities.some((p) => !/^[+-]?\d+$/.test(p.trim()) || !Number.isSafeInteger(Number(p))))
    return 'integer_list';
  if (
    rule.priorities.length &&
    priorities.some((p) => !rule.priorities.some((allowed) => Number(allowed) === Number(p)))
  )
    return 'auth_model_exclusion_image_priorities_outside';
}

export function normalizeAuthModelExclusionProviders(providers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  providers.forEach((provider) => {
    const normalized = provider.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

export function normalizeAuthModelExclusionModels(models: string[]): string[] {
  const items = models.map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return [];

  const allMode = items[0].toLowerCase() === '-all';
  const seen = new Set<string>();
  const result: string[] = [];

  const pushUnique = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  };

  if (allMode) {
    pushUnique('-all');
    items.slice(1).forEach((item) => {
      if (item.toLowerCase() === '-all') return;
      const model = item.startsWith('+') ? item.slice(1).trim() : item;
      if (model) pushUnique(`+${model}`);
    });
    return result;
  }

  items.forEach((item) => {
    const model = item.startsWith('+') ? item.slice(1).trim() : item;
    if (model) pushUnique(model);
  });
  return result;
}

export function isAuthModelExclusionAllMode(models: string[]): boolean {
  const first = models.map((item) => item.trim()).find(Boolean);
  return first?.toLowerCase() === '-all';
}
