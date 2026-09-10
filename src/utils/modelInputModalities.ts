import type { ModelInputModality } from '@/types/provider';

export const MODEL_INPUT_MODALITIES: readonly ModelInputModality[] = ['text', 'image', 'audio', 'video'];

export function normalizeModelInputModalities(value: unknown): ModelInputModality[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error('Model input-modalities must be a list');
  const result: ModelInputModality[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('Model input-modalities must contain strings');
    const modality = item.trim().toLowerCase() as ModelInputModality;
    if (!MODEL_INPUT_MODALITIES.includes(modality)) throw new Error('Model input-modalities must contain only text, image, audio or video');
    if (!result.includes(modality)) result.push(modality);
  }
  return result.length ? result : undefined;
}
