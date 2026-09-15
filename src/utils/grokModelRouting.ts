import { GROK_UPSTREAM_MODES, normalizeGrokBaseUrl } from './grokUpstream';

export interface GrokModelRoute {
  models: string[];
  upstream: string;
}
export interface GrokModelRoutingDraft {
  catalogSources: string[];
  modelRoutes: Array<{ models: string; upstream: string }>;
}
export const emptyGrokModelRouting = (): GrokModelRoutingDraft => ({
  catalogSources: [],
  modelRoutes: [],
});

export function readGrokModelRouting(sources: unknown, routes: unknown): GrokModelRoutingDraft {
  return {
    catalogSources: sources == null ? [] : Array.isArray(sources) ? sources.map(String) : [''],
    modelRoutes:
      routes == null
        ? []
        : Array.isArray(routes)
          ? routes.map((value) => {
              const route =
                value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
              return {
                models: Array.isArray(route.models) ? route.models.map(String).join(', ') : '',
                upstream: typeof route.upstream === 'string' ? route.upstream : '',
              };
            })
          : [{ models: '', upstream: '' }],
  };
}

export function normalizeGrokUpstreamReference(value: string): string | null {
  const text = value.trim(),
    mode = text.toLowerCase();
  if (['default', ...GROK_UPSTREAM_MODES].includes(mode)) return mode;
  if (!text || text.length > 2048) return null;
  return normalizeGrokBaseUrl(text);
}
export function serializeGrokModelRoutes(draft: GrokModelRoutingDraft): GrokModelRoute[] {
  return draft.modelRoutes.map((route) => ({
    models: [
      ...new Set(
        route.models
          .split(/[,\n]/)
          .map((v) => v.trim())
          .filter(Boolean)
      ),
    ],
    upstream: normalizeGrokUpstreamReference(route.upstream) ?? route.upstream.trim(),
  }));
}
export function serializeGrokCatalogSources(draft: GrokModelRoutingDraft): string[] {
  return [
    ...new Set(
      draft.catalogSources.map((value) => normalizeGrokUpstreamReference(value) ?? value.trim())
    ),
  ];
}
export function grokModelRoutingError(draft: GrokModelRoutingDraft): 'sources' | 'routes' | null {
  if (
    draft.catalogSources.length > 8 ||
    draft.catalogSources.some((value) => !normalizeGrokUpstreamReference(value))
  )
    return 'sources';
  if (
    draft.modelRoutes.length > 64 ||
    serializeGrokModelRoutes(draft).some(
      (route) =>
        !normalizeGrokUpstreamReference(route.upstream) ||
        !route.models.length ||
        route.models.length > 64 ||
        route.models.some(
          (id) =>
            id.length > 256 ||
            id.includes('\0') ||
            /[\s?\\]/.test(id) ||
            id.includes('[') ||
            id.includes(']')
        )
    )
  )
    return 'routes';
  return null;
}
