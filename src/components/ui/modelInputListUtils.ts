import type { ModelAlias } from '@/types';
import { normalizeModelDisplayName } from '@/utils/modelDisplayName';

export interface ModelEntry extends ModelAlias {
  alias: string;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => ({
    ...model,
    name: model.name || '',
    alias: model.alias || ''
  }));
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { ...entry, name: entry.name.trim() };
      delete model.alias;
      delete model.displayName;
      const displayName = normalizeModelDisplayName(entry.displayName);
      if (displayName !== undefined) model.displayName = displayName;
      const alias = entry.alias.trim();
      if (alias && alias !== model.name) {
        model.alias = alias;
      }
      return model;
    });
};
