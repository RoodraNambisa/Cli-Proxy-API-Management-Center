import { readGrokModelRouting, grokModelRoutingError, serializeGrokCatalogSources, serializeGrokModelRoutes } from './grokModelRouting';
import { isAlias, isMap, type Document } from 'yaml';
import { DEFAULT_GROK_CONFIG, GROK_DEFAULT_KEYS, type GrokVisualConfig } from '@/types/grok';
import type { VisualConfigValidationErrors } from '@/types/visualConfig';
import { detachErrorRuleAliases, readMergedYamlField } from './requestScopedErrorsYaml';
import { GROK_UPSTREAM_MODES, type GrokUpstreamMode } from './grokUpstream';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  value === undefined || value === null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
const invalidHeaderValue = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && code !== 9) || code === 127;
  });
const flags = {
  passthrough: 'passthrough-client-identity',
  spoof: 'spoof-session-identity',
  convergence: 'session-identity-convergence',
  confuse: 'identity-confuse',
  webSearch: 'inject-web-search',
  xSearch: 'inject-x-search',
} as const;
const profiles = {
  userAgent: 'user-agent',
  clientVersion: 'client-version',
  clientIdentifier: 'client-identifier',
} as const;

export function readGrokConfig(raw: unknown): GrokVisualConfig {
  const data = record(raw),
    profile = record(data['header-defaults']),
    defaults = record(data['request-defaults']);
  const out = {
    ...DEFAULT_GROK_CONFIG,
    routing: readGrokModelRouting(data['model-catalog-sources'], data['model-routes']),
    headers: Object.entries(record(data.headers)).map(([key, value]) => ({
      key,
      value: text(value),
    })),
    defaults: { ...DEFAULT_GROK_CONFIG.defaults },
  };
  for (const [key, field] of Object.entries(flags))
    out[key as keyof typeof flags] = data[field] === true;
  for (const [key, field] of Object.entries(profiles))
    out[key as keyof typeof profiles] = text(profile[field]);
  out.poolSize = text(data['session-identity-pool-size'] ?? 4);
  out.upstreamMode = text(data['default-base-url-mode']).trim().toLowerCase() || 'cli';
  out.chatMode = text(data['chat-completions-mode']).trim().toLowerCase() || 'responses';
  for (const key of GROK_DEFAULT_KEYS)
    out.defaults[key] = text(
      key === 'reasoning.effort' ? record(defaults.reasoning).effort : defaults[key]
    );
  return out;
}

export function grokConfigErrors(values: GrokVisualConfig): VisualConfigValidationErrors {
  const errors: VisualConfigValidationErrors = {};
  if (!['responses', 'direct'].includes(values.chatMode))
    errors['grok.chatMode'] = 'grok_chat_mode';
  if (grokModelRoutingError(values.routing)) errors['grok.routing'] = 'grok_model_routing';
  if (!GROK_UPSTREAM_MODES.includes(values.upstreamMode as GrokUpstreamMode))
    errors['grok.upstreamMode'] = 'grok_upstream_mode';
  if (!/^\d+$/.test(values.poolSize) || Number(values.poolSize) < 1 || Number(values.poolSize) > 64)
    errors['grok.poolSize'] = 'integer_range_1_64';
  const seen = new Set<string>();
  if (values.headers.length > 64) errors['grok.headers'] = 'grok_headers';
  values.headers.forEach(({ key, value }) => {
    if (!key && !value) return;
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
      invalidHeaderValue(value) ||
      value.length > 8192 ||
      seen.has(key.toLowerCase())
    )
      errors['grok.headers'] = 'grok_headers';
    seen.add(key.toLowerCase());
  });
  for (const key of Object.keys(profiles) as Array<keyof typeof profiles>)
    if (values[key].length > 1024 || invalidHeaderValue(values[key]))
      errors[`grok.${key}`] = 'grok_headers';
  for (const key of GROK_DEFAULT_KEYS) {
    const raw = values.defaults[key].trim();
    if (!raw) continue;
    if (
      key === 'max_output_tokens' &&
      (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 2147483647)
    )
      errors[`grok.${key}`] = 'positive_integer';
    if (
      (key === 'temperature' || key === 'top_p') &&
      (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > (key === 'top_p' ? 1 : 2))
    )
      errors[`grok.${key}`] = 'grok_parameter';
    if (
      (key === 'parallel_tool_calls' || key === 'stream_tool_calls') &&
      !['true', 'false'].includes(raw)
    )
      errors[`grok.${key}`] = 'grok_parameter';
    if (key === 'tool_choice' && !['auto', 'none', 'required'].includes(raw)) {
      try {
        if (!Object.keys(record(JSON.parse(raw))).length) errors[`grok.${key}`] = 'json_object';
      } catch {
        errors[`grok.${key}`] = 'json_object';
      }
    }
  }
  return errors;
}

// Update only edited leaves; detach aliases before writing through inherited maps.
export function writeGrokConfig(
  doc: Document,
  values: GrokVisualConfig,
  baseline: GrokVisualConfig
) {
  const write = (path: string[], value: unknown) => {
    for (let length = 1; length < path.length; length++) {
      const parent = path.slice(0, length),
        node = doc.getIn(parent, true);
      detachErrorRuleAliases(doc, node);
      if (isAlias(node) || !isMap(node) || node.has('<<')) {
        let inherited = readMergedYamlField(doc, ['xai']);
        for (const part of parent.slice(1)) inherited = record(inherited)[part];
        doc.setIn(parent, doc.createNode(record(inherited)));
      }
    }
    detachErrorRuleAliases(doc, doc.getIn(path, true));
    if (value === undefined) doc.deleteIn(path);
    else doc.setIn(path, value);
  };
  for (const key of Object.keys(flags) as Array<keyof typeof flags>)
    if (values[key] !== baseline[key]) write(['xai', flags[key]], values[key]);
  for (const key of Object.keys(profiles) as Array<keyof typeof profiles>)
    if (values[key] !== baseline[key])
      write(['xai', 'header-defaults', profiles[key]], values[key].trim() || undefined);
  if (values.poolSize !== baseline.poolSize)
    write(['xai', 'session-identity-pool-size'], Number(values.poolSize));
  if (JSON.stringify(values.routing.catalogSources) !== JSON.stringify(baseline.routing.catalogSources))
    write(['xai', 'model-catalog-sources'], serializeGrokCatalogSources(values.routing));
  if (JSON.stringify(values.routing.modelRoutes) !== JSON.stringify(baseline.routing.modelRoutes))
    write(['xai', 'model-routes'], serializeGrokModelRoutes(values.routing));
  if (values.upstreamMode !== baseline.upstreamMode)
    write(['xai', 'default-base-url-mode'], values.upstreamMode);
  if (values.chatMode !== baseline.chatMode)
    write(['xai', 'chat-completions-mode'], values.chatMode);
  if (JSON.stringify(values.headers) !== JSON.stringify(baseline.headers))
    write(
      ['xai', 'headers'],
      Object.fromEntries(
        values.headers.filter(({ key }) => key.trim()).map(({ key, value }) => [key.trim(), value])
      )
    );
  for (const key of GROK_DEFAULT_KEYS) {
    if (values.defaults[key] === baseline.defaults[key]) continue;
    const raw = values.defaults[key].trim();
    const path = ['xai', 'request-defaults', ...key.split('.')];
    const value = !raw
      ? undefined
      : key === 'reasoning.effort' || (key === 'tool_choice' && !raw.startsWith('{'))
        ? raw
        : ['max_output_tokens', 'temperature', 'top_p'].includes(key)
          ? Number(raw)
          : JSON.parse(raw);
    write(path, value);
    if (key === 'reasoning.effort' && value === undefined) {
      const reasoningPath = ['xai', 'request-defaults', 'reasoning'];
      const reasoning = doc.getIn(reasoningPath, true);
      if (isMap(reasoning) && reasoning.items.length === 0) doc.deleteIn(reasoningPath);
    }
  }
}
