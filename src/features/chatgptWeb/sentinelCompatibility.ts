import type {
  ChatGptWebSentinelCompatibility,
  ChatGptWebSentinelProperty,
  SentinelPropertyType,
} from '@/types';

export interface SentinelPropertyDraft {
  path: string;
  type: SentinelPropertyType;
  value: string;
  enumerable: boolean;
}

export interface SentinelCompatibilityDraft {
  enabled: boolean;
  autoExtend: boolean;
  writable: string;
  properties: SentinelPropertyDraft[];
}

export const toCompatibilityDraft = (
  config?: ChatGptWebSentinelCompatibility
): SentinelCompatibilityDraft => ({
  enabled: config?.enabled ?? false,
  autoExtend: config?.['observer-state-auto-extend'] ?? true,
  writable: (config?.['writable-window-properties'] ?? []).join('\n'),
  properties: (config?.['environment-properties'] ?? []).map((prop) => ({
    path: prop.path,
    type: prop.type,
    enumerable: prop.enumerable ?? false,
    value:
      prop.type === 'string'
        ? String(prop.value ?? '')
        : prop.value == null
          ? ''
          : String(prop.value),
  })),
});

export function readCompatibilityDraft(
  draft: SentinelCompatibilityDraft
): ChatGptWebSentinelCompatibility | null {
  const writable = [
    ...new Set(
      draft.writable
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ];
  const validName = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;
  const protectedNames = new Set(['__proto__', 'prototype', 'constructor']);
  if (writable.some((key) => !validName.test(key) || protectedNames.has(key))) return null;
  if (writable.length + draft.properties.length > 64) return null;
  const properties: ChatGptWebSentinelProperty[] = [];
  const paths = new Set<string>();
  for (const prop of draft.properties) {
    const path = prop.path.trim();
    if (!/^window\.(?:(?:document|navigator|screen)\.)?[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(path))
      return null;
    const key = path.slice(path.lastIndexOf('.') + 1);
    if (
      protectedNames.has(key) ||
      paths.has(path) ||
      writable.some((name) => path === `window.${name}`)
    )
      return null;
    paths.add(path);
    let value: ChatGptWebSentinelProperty['value'];
    switch (prop.type) {
      case 'string':
        if (Math.max(prop.value.length * 2, new TextEncoder().encode(prop.value).length) > 4096)
          return null;
        value = prop.value;
        break;
      case 'boolean':
        if (prop.value !== 'true' && prop.value !== 'false') return null;
        value = prop.value === 'true';
        break;
      case 'number':
        try {
          value = JSON.parse(prop.value);
        } catch {
          return null;
        }
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value))
        )
          return null;
        break;
      case 'null':
        value = null;
        break;
      case 'undefined':
        break;
      default:
        return null;
    }
    properties.push({
      path,
      type: prop.type,
      enumerable: prop.enumerable,
      ...(prop.type === 'undefined' ? {} : { value }),
    });
  }
  return {
    enabled: draft.enabled,
    'observer-state-auto-extend': draft.autoExtend,
    'writable-window-properties': writable,
    'environment-properties': properties,
  };
}
