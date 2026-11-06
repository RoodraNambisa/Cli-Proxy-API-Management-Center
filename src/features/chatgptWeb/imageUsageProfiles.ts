import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';
import { aliasKey, effectiveImageAliases } from './imageOutputFormats';

export const IMAGE_USAGE_PROFILES_FEATURE = 'image_usage_profiles_v1';
export const IMAGE_USAGE_PROFILES = ['gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.6'] as const;
export type ImageUsageProfile = (typeof IMAGE_USAGE_PROFILES)[number];
export type ImageUsageMode = 'by-model' | ImageUsageProfile;
export type ImageUsageModelProfiles = Record<string, ImageUsageProfile>;
export const IMAGE_USAGE_MODES: ImageUsageMode[] = ['by-model', ...IMAGE_USAGE_PROFILES];

export function readImageUsageMode(value: unknown): ImageUsageMode {
  if (value === undefined) return 'by-model';
  if (typeof value !== 'string') throw new Error('image_usage_profiles');
  const mode = value.trim().toLowerCase();
  if (!IMAGE_USAGE_MODES.includes(mode as ImageUsageMode)) throw new Error('image_usage_profiles');
  return mode as ImageUsageMode;
}

export function readImageUsageModelProfiles(
  value: unknown,
  aliases?: string[]
): ImageUsageModelProfiles {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('image_usage_profiles');
  const result: ImageUsageModelProfiles = {};
  for (const [model, raw] of Object.entries(value)) {
    const key = aliasKey(model);
    const profile = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (
      !key ||
      Object.prototype.hasOwnProperty.call(result, key) ||
      !IMAGE_USAGE_PROFILES.includes(profile as ImageUsageProfile) ||
      (aliases && !aliases.some((a) => aliasKey(a) === key))
    )
      throw new Error('image_usage_profiles');
    Object.defineProperty(result, key, {
      value: profile,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

export function defaultImageUsageProfile(model: string): ImageUsageProfile {
  switch (aliasKey(model)) {
    case 'gpt-image-2.5':
    case 'gpt-image-2.5-flare':
    case 'gpt-image-2.5-sunburst':
      return 'gpt-image-2.5';
    case 'gpt-image-2.6':
    case 'gpt-image-2.6-flare':
    case 'gpt-image-2.6-sunburst':
      return 'gpt-image-2.6';
    default:
      return 'gpt-image-2';
  }
}

export function imageUsageProfilesInvalid(
  mode: unknown,
  profiles: unknown,
  models: string[],
  legacy: string
): boolean {
  try {
    readImageUsageMode(mode);
    readImageUsageModelProfiles(profiles, effectiveImageAliases(models, legacy));
    return false;
  } catch {
    return true;
  }
}

export async function supportsImageUsageProfiles(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<boolean> {
  const response = await apiClient.getAtConnection<{ features?: string[] }>(
    connection,
    '/chatgpt-web/capabilities',
    { signal }
  );
  return (
    Array.isArray(response.features) && response.features.includes(IMAGE_USAGE_PROFILES_FEATURE)
  );
}
