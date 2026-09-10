import type { ModelAlias } from '@/types';
import { normalizeModelDisplayName } from '@/utils/modelDisplayName';
import { normalizeModelThinking } from '@/utils/modelThinking';

export interface ModelEntry extends ModelAlias {
  alias: string;
}

export const modelsToEntries = (models?: ModelAlias[]): ModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '' }];
  }
  return models.map((model) => {
    const entry = { ...model, name: model.name || '', alias: model.alias || '' };
    delete entry.thinking;
    const thinking = normalizeModelThinking(model.thinking);
    if (thinking !== undefined) entry.thinking = thinking;
    if (Array.isArray(entry.inputModalities)) entry.inputModalities = [...entry.inputModalities];
    return entry;
  });
};

export const entriesToModels = (entries: ModelEntry[]): ModelAlias[] => {
  return entries
    .filter((entry) => entry.name.trim())
    .map((entry) => {
      const model: ModelAlias = { ...entry, name: entry.name.trim() };
      if (Array.isArray(model.inputModalities)) model.inputModalities = [...model.inputModalities];
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
