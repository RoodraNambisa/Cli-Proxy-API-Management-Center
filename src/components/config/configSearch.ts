import type { ConfigSearchDefinition } from './configCatalog';

export function normalizeConfigSearchQuery(query: string): string {
  return query.trim().replace(/:$/, '').trim().toLowerCase().replace(/\[\d*\]/g, '');
}

export type ConfigSearchMatch = { yamlKey: string; rank: number };

export function matchConfigSearch(
  definition: ConfigSearchDefinition,
  query: string,
  translatedText: string[]
): ConfigSearchMatch | undefined {
  if (!query) return undefined;

  let best: ConfigSearchMatch | undefined;
  for (const yamlKey of definition.yamlKeys) {
    const key = normalizeConfigSearchQuery(yamlKey);
    let rank: number;
    if (key === query) {
      rank = 0;
    } else if (key.endsWith(`.${query}`)) {
      rank = 1;
    } else if (key.includes(query)) {
      rank = 2;
    } else if (query.startsWith(`${key}.`)) {
      // Keep parent-section lookup for paths not yet listed in the catalog.
      rank = 3;
    } else {
      continue;
    }
    if (
      !best ||
      rank < best.rank ||
      (rank === 3 && best.rank === 3 && yamlKey.length > best.yamlKey.length)
    ) {
      best = { yamlKey, rank };
    }
  }
  if (best) return best;

  if (
    [...translatedText, ...(definition.aliases ?? [])].some((text) =>
      text.toLowerCase().includes(query)
    )
  ) {
    return { yamlKey: definition.yamlKeys[0] ?? '', rank: 4 };
  }
  return undefined;
}
