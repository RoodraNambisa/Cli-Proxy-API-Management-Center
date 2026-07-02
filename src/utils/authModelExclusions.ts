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
