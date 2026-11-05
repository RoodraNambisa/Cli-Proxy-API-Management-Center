import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';

export const IMAGE_FORMATS_KEY = 'model-output-formats';
export const IMAGE_FORMATS_FEATURE = 'image_model_output_formats_v1';
export const IMAGE_OUTPUT_FORMATS = ['png', 'jpeg', 'webp', 'gif'] as const;
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];
export type ModelOutputFormats = Record<string, ImageOutputFormat[]>;
export const DEFAULT_WEB_IMAGE_ALIASES = [
  'gpt-image-2',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.6',
  'gpt-image-2.6-flare',
  'gpt-image-2.6-sunburst',
];
export const aliasKey = (value: string) => value.trim().toLowerCase();
export function effectiveImageAliases(
  models: string[],
  legacy: string,
  defaults = DEFAULT_WEB_IMAGE_ALIASES
): string[] {
  const unique = models
    .map((m) => m.trim())
    .filter((m, i, all) => m && all.findIndex((n) => aliasKey(n) === aliasKey(m)) === i);
  if (unique.length) return unique;
  return legacy.trim() && legacy.trim() !== 'gpt-image-2' ? [legacy.trim()] : [...defaults];
}
export function readModelOutputFormats(value: unknown, aliases?: string[]): ModelOutputFormats {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('image_output_formats');
  const result: ModelOutputFormats = {};
  for (const [model, raw] of Object.entries(value)) {
    const key = aliasKey(model);
    if (
      !key ||
      Object.prototype.hasOwnProperty.call(result, key) ||
      (aliases && !aliases.some((a) => aliasKey(a) === key)) ||
      !Array.isArray(raw) ||
      !raw.length
    )
      throw new Error('image_output_formats');
    const formats = raw.map((f) =>
      typeof f === 'string' ? f.trim().toLowerCase().replace(/^jpg$/, 'jpeg') : ''
    );
    if (formats.some((f) => !IMAGE_OUTPUT_FORMATS.includes(f as ImageOutputFormat)))
      throw new Error('image_output_formats');
    Object.defineProperty(result, key, {
      value: IMAGE_OUTPUT_FORMATS.filter((f) => formats.includes(f)),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
export function imageFormatsInvalid(value: unknown, models: string[], legacy: string): boolean {
  try {
    readModelOutputFormats(value, effectiveImageAliases(models, legacy));
    return false;
  } catch {
    return true;
  }
}
export interface ImageFormatsCapability {
  supported_formats: ImageOutputFormat[];
  default_formats: ImageOutputFormat[];
  default_overrides: ModelOutputFormats;
  default_aliases: string[];
  aliases: Array<{ model: string; output_formats: ImageOutputFormat[] }>;
}
export async function fetchImageFormatsCapability(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<ImageFormatsCapability | null> {
  const response = await apiClient.getAtConnection<{
    features?: string[];
    image_model_output_formats?: ImageFormatsCapability;
  }>(connection, '/chatgpt-web/capabilities', { signal });
  if (!Array.isArray(response.features) || !response.features.includes(IMAGE_FORMATS_FEATURE))
    return null;
  const data = response.image_model_output_formats;
  if (
    !data ||
    !Array.isArray(data.default_aliases) ||
    !data.default_aliases.length ||
    data.default_aliases.some((alias) => typeof alias !== 'string' || !alias.trim()) ||
    !Array.isArray(data.default_formats) ||
    !data.default_formats.length ||
    !Array.isArray(data.supported_formats) ||
    !Array.isArray(data.aliases)
  )
    throw new Error('Invalid image formats capability');
  const defaults = readModelOutputFormats({
    defaults: data.default_formats,
    supported: data.supported_formats,
  });
  return {
    ...data,
    default_formats: defaults.defaults,
    supported_formats: defaults.supported,
    default_overrides: readModelOutputFormats(data.default_overrides),
  };
}
