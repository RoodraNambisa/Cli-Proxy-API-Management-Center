import { useCallback, useMemo, useReducer } from 'react';
import { isMap, parse as parseYaml, parseDocument } from 'yaml';
import type {
  CodexCustomModelValidationErrors,
  CodexCustomModelVisualEntry,
  AuthModelExclusionVisualEntry,
  DisabledImageGenerationToolAction,
  DisabledImageGenerationToolErrorVisualConfig,
  ErrorResponseRewriteVisualEntry,
  FixedErrorCooldownScope,
  FixedErrorCooldownVisualEntry,
  NativeImageEndpointVisualConfig,
  NativeImagesVisualConfig,
  NonRetryableErrorVisualEntry,
  PayloadFilterRule,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadRule,
  RoutingPriorityOverrideStrategy,
  RoutingPriorityOverrideVisualEntry,
  RoutingSubscriptionOverrideVisualEntry,
  VisualConfigValues,
  VisualConfigValidationErrors,
  PayloadParamValidationErrorCode,
} from '@/types/visualConfig';
import { DEFAULT_VISUAL_VALUES, makeClientId } from '@/types/visualConfig';
import { CODEX_CUSTOM_MODEL_GROUPS, type CodexCustomModelGroup } from '@/types/config';
import {
  normalizeAuthModelExclusionModels,
  normalizeAuthModelExclusionProviders,
} from '@/utils/authModelExclusions';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractApiKeyValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }

  const record = asRecord(raw);
  if (!record) return null;

  const candidates = [record['api-key'], record.apiKey, record.key, record.Key];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parseApiKeysText(raw: unknown): string {
  if (!Array.isArray(raw)) return '';

  const keys: string[] = [];
  for (const item of raw) {
    const key = extractApiKeyValue(item);
    if (key) keys.push(key);
  }
  return keys.join('\n');
}

function resolveApiKeysText(parsed: Record<string, unknown>): string {
  if (Object.prototype.hasOwnProperty.call(parsed, 'api-keys')) {
    return parseApiKeysText(parsed['api-keys']);
  }

  const auth = asRecord(parsed.auth);
  const providers = asRecord(auth?.providers);
  const configApiKeyProvider = asRecord(providers?.['config-api-key']);
  if (!configApiKeyProvider) return '';

  if (Object.prototype.hasOwnProperty.call(configApiKeyProvider, 'api-key-entries')) {
    return parseApiKeysText(configApiKeyProvider['api-key-entries']);
  }

  return parseApiKeysText(configApiKeyProvider['api-keys']);
}

function splitApiKeysText(value: string): string[] {
  return value
    .split('\n')
    .map((key) => key.trim())
    .filter(Boolean);
}

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlPath = string[];

function docHas(doc: YamlDocument, path: YamlPath): boolean {
  return doc.hasIn(path);
}

function ensureMapInDoc(doc: YamlDocument, path: YamlPath): void {
  const existing = doc.getIn(path, true);
  if (isMap(existing)) return;
  // Use a YAML node here; plain objects are not treated as collections by subsequent `setIn`.
  doc.setIn(path, doc.createNode({}));
}

function deleteIfMapEmpty(doc: YamlDocument, path: YamlPath): void {
  const value = doc.getIn(path, true);
  if (!isMap(value)) return;
  if (value.items.length === 0) doc.deleteIn(path);
}

function setBooleanInDoc(doc: YamlDocument, path: YamlPath, value: boolean): void {
  if (value) {
    doc.setIn(path, true);
    return;
  }
  if (docHas(doc, path)) doc.setIn(path, false);
}

function setStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed !== '') {
    doc.setIn(path, safe);
    return;
  }
  // Preserve existing empty-string keys to avoid dropping template blocks/comments.
  // Only keep the key when it already exists in the YAML.
  if (docHas(doc, path)) {
    doc.setIn(path, '');
  }
}

function syncApiKeyGroupsInDoc(
  doc: YamlDocument,
  currentYaml: string,
  baselineKeys: string[],
  nextKeys: string[]
): void {
  const parsed = asRecord(parseYaml(currentYaml));
  const rawGroups = parsed?.['api-key-groups'];
  if (!Array.isArray(rawGroups)) return;

  const baselineSet = new Set(baselineKeys);
  const nextSet = new Set(nextKeys);
  const renameByKey = new Map<string, string>();

  if (baselineKeys.length === nextKeys.length) {
    baselineKeys.forEach((previousKey, index) => {
      const nextKey = nextKeys[index];
      if (
        previousKey &&
        nextKey &&
        previousKey !== nextKey &&
        !nextSet.has(previousKey) &&
        !baselineSet.has(nextKey)
      ) {
        renameByKey.set(previousKey, nextKey);
      }
    });
  }

  const seen = new Set<string>();
  const groups = rawGroups.flatMap((rawGroup) => {
    const group = asRecord(rawGroup);
    const previousKey = extractApiKeyValue(rawGroup);
    if (!group || !previousKey) return [];

    const apiKey = renameByKey.get(previousKey) ?? previousKey;
    if (!nextSet.has(apiKey) || seen.has(apiKey)) return [];
    seen.add(apiKey);

    const normalized: Record<string, unknown> = { ...group, 'api-key': apiKey };
    delete normalized.apiKey;
    delete normalized.key;
    delete normalized.Key;
    return [normalized];
  });

  if (groups.length > 0) {
    doc.setIn(['api-key-groups'], groups);
  } else {
    doc.deleteIn(['api-key-groups']);
  }
}

function parseBooleanValue(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return false;
}

function setIntFromStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed === '') {
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    doc.setIn(path, parsed);
    return;
  }
}

function setNumberFromStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed === '') {
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) doc.setIn(path, parsed);
}

function parseIntegerList(raw: unknown): string {
  if (!Array.isArray(raw)) return '';

  return raw
    .reduce<string[]>((result, item) => {
      if (typeof item === 'number' && Number.isFinite(item) && Number.isInteger(item)) {
        result.push(String(item));
        return result;
      }

      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (/^-?\d+$/.test(trimmed)) {
          result.push(trimmed);
        }
      }

      return result;
    }, [])
    .join(', ');
}

function parseIntegerListText(value: string): { values: number[]; valid: boolean } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { values: [], valid: true };
  }

  const items = value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return { values: [], valid: false };
  }

  const seen = new Set<string>();
  const values: number[] = [];
  for (const item of items) {
    if (!/^-?\d+$/.test(item)) {
      return { values: [], valid: false };
    }

    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    values.push(Number(item));
  }

  return { values, valid: true };
}

function setIntListFromTextInDoc(
  doc: YamlDocument,
  path: YamlPath,
  value: unknown,
  options: { preserveEmpty?: boolean } = {}
): void {
  const safe = typeof value === 'string' ? value : '';
  const { values, valid } = parseIntegerListText(safe);
  if (!valid) {
    return;
  }

  if (values.length === 0) {
    if (options.preserveEmpty) {
      doc.setIn(path, []);
      return;
    }
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  doc.setIn(path, values);
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function parseIntegerStringList(raw: unknown): string[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map((item) => String(item ?? '').trim());
}

function normalizeStringListItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function setStringListInDoc(
  doc: YamlDocument,
  path: YamlPath,
  value: unknown,
  options: { preserveEmpty?: boolean } = {}
): void {
  const items = Array.isArray(value)
    ? normalizeStringListItems(value.map((item) => String(item ?? '')))
    : [];
  if (items.length > 0) {
    doc.setIn(path, items);
    return;
  }
  if (options.preserveEmpty || docHas(doc, path)) {
    doc.setIn(path, []);
  }
}

function parseNativeImageEndpoint(
  raw: unknown,
  defaults: NativeImageEndpointVisualConfig
): NativeImageEndpointVisualConfig {
  const record = asRecord(raw);
  if (!record) return { ...defaults, models: [...defaults.models], paramRules: [] };

  const statusCodeRaw =
    record['unsupported-model-status-code'] ?? record.unsupportedModelStatusCode;
  const messageRaw = record['unsupported-model-message'] ?? record.unsupportedModelMessage;

  return {
    enabled: Boolean(record.enabled),
    models:
      record.models === undefined
        ? [...defaults.models]
        : normalizeStringListItems(parseStringList(record.models)),
    paramRules: normalizeStringListItems(
      parseStringList(record['param-rules'] ?? record.paramRules)
    ),
    unsupportedModelStatusCode:
      statusCodeRaw === undefined
        ? defaults.unsupportedModelStatusCode
        : String(statusCodeRaw ?? ''),
    unsupportedModelMessage:
      typeof messageRaw === 'string' ? messageRaw : defaults.unsupportedModelMessage,
  };
}

function parseNativeImagesConfig(raw: unknown): NativeImagesVisualConfig {
  const record = asRecord(raw);
  return {
    generations: parseNativeImageEndpoint(
      record?.generations,
      DEFAULT_VISUAL_VALUES.images.native.generations
    ),
    edits: parseNativeImageEndpoint(record?.edits, DEFAULT_VISUAL_VALUES.images.native.edits),
  };
}

function writeNativeImageEndpointInDoc(
  doc: YamlDocument,
  path: YamlPath,
  values: NativeImageEndpointVisualConfig,
  defaults: NativeImageEndpointVisualConfig
): void {
  const endpointDefined = docHas(doc, path) || !areNativeImageEndpointsEqual(values, defaults);
  if (!endpointDefined) return;

  ensureMapInDoc(doc, path);
  setBooleanInDoc(doc, [...path, 'enabled'], values.enabled);
  setStringListInDoc(doc, [...path, 'models'], values.models, { preserveEmpty: true });
  setStringListInDoc(doc, [...path, 'param-rules'], values.paramRules, { preserveEmpty: true });
  setIntFromStringInDoc(
    doc,
    [...path, 'unsupported-model-status-code'],
    values.unsupportedModelStatusCode
  );
  setStringInDoc(doc, [...path, 'unsupported-model-message'], values.unsupportedModelMessage);
  deleteIfMapEmpty(doc, path);
}

function normalizeCodexCustomModelGroups(value: unknown): CodexCustomModelGroup[] {
  if (!Array.isArray(value)) return [];

  const requested = new Set(
    value
      .map((item) =>
        String(item ?? '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );

  return CODEX_CUSTOM_MODEL_GROUPS.filter((group) => requested.has(group));
}

function parseCodexCustomModels(raw: unknown): CodexCustomModelVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<CodexCustomModelVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;

    const idRaw = record.id;
    const displayNameRaw = record['display-name'] ?? record.displayName;
    result.push({
      clientId: makeClientId(),
      id: typeof idRaw === 'string' ? idRaw : String(idRaw ?? ''),
      displayName:
        typeof displayNameRaw === 'string' ? displayNameRaw : String(displayNameRaw ?? ''),
      groups: normalizeCodexCustomModelGroups(record.groups),
    });
    return result;
  }, []);
}

function serializeCodexCustomModelsForYaml(
  models: CodexCustomModelVisualEntry[]
): Array<Record<string, unknown>> {
  return models.map((model) => {
    const entry: Record<string, unknown> = {
      id: model.id,
      groups: normalizeCodexCustomModelGroups(model.groups),
    };
    const displayName = model.displayName.trim();
    if (displayName) {
      entry['display-name'] = displayName;
    }
    return entry;
  });
}

function normalizeFixedErrorCooldownScope(value: unknown): FixedErrorCooldownScope {
  return value === 'auth' ? 'auth' : 'model';
}

function formatOptionalFixedErrorStatusCode(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value === 0) return '';
  if (typeof value === 'string' && value.trim() === '0') return '';
  return String(value);
}

function parseFixedErrorCooldowns(raw: unknown): FixedErrorCooldownVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<FixedErrorCooldownVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;

    const statusCodeRaw = record['status-code'] ?? record.statusCode;
    const messageContainsRaw = record['message-contains'] ?? record.messageContains;
    const cooldownSecondsRaw = record['cooldown-seconds'] ?? record.cooldownSeconds;

    result.push({
      clientId: makeClientId(),
      statusCode: formatOptionalFixedErrorStatusCode(statusCodeRaw),
      messageContains:
        typeof messageContainsRaw === 'string'
          ? messageContainsRaw
          : messageContainsRaw === undefined || messageContainsRaw === null
            ? ''
            : String(messageContainsRaw),
      cooldownSeconds:
        cooldownSecondsRaw === undefined || cooldownSecondsRaw === null
          ? ''
          : String(cooldownSecondsRaw),
      scope: normalizeFixedErrorCooldownScope(record.scope),
    });
    return result;
  }, []);
}

function areFixedErrorCooldownsEqual(
  left: FixedErrorCooldownVisualEntry[],
  right: FixedErrorCooldownVisualEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      Boolean(other) &&
      entry.statusCode === other.statusCode &&
      entry.messageContains === other.messageContains &&
      entry.cooldownSeconds === other.cooldownSeconds &&
      entry.scope === other.scope
    );
  });
}

function parsePositiveIntegerString(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseHttpStatusCodeString(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
}

function serializeFixedErrorCooldownsForYaml(
  rules: FixedErrorCooldownVisualEntry[]
): Array<Record<string, unknown>> {
  return rules.reduce<Array<Record<string, unknown>>>((result, rule) => {
    const cooldownSeconds = parsePositiveIntegerString(rule.cooldownSeconds);
    if (cooldownSeconds === null) return result;
    const statusCode = rule.statusCode.trim() ? parseHttpStatusCodeString(rule.statusCode) : null;
    if (rule.statusCode.trim() && statusCode === null) return result;
    if (statusCode === null && !rule.messageContains.trim()) return result;

    const entry: Record<string, unknown> = {
      'message-contains': rule.messageContains,
      'cooldown-seconds': cooldownSeconds,
      scope: normalizeFixedErrorCooldownScope(rule.scope),
    };
    if (statusCode !== null) {
      entry['status-code'] = statusCode;
    }

    result.push(entry);
    return result;
  }, []);
}

function formatOptionalStatusCode(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function parseNonRetryableErrors(raw: unknown): NonRetryableErrorVisualEntry[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_VISUAL_VALUES.nonRetryableErrors.map((rule) => ({ ...rule }));
  }

  return raw.reduce<NonRetryableErrorVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;
    const statusCodeRaw = record['status-code'] ?? record.statusCode;
    const messageContainsRaw = record['message-contains'] ?? record.messageContains;

    result.push({
      clientId: makeClientId(),
      statusCode: formatOptionalStatusCode(statusCodeRaw),
      type: typeof record.type === 'string' ? record.type : String(record.type ?? ''),
      code: typeof record.code === 'string' ? record.code : String(record.code ?? ''),
      messageContains:
        typeof messageContainsRaw === 'string'
          ? messageContainsRaw
          : String(messageContainsRaw ?? ''),
    });
    return result;
  }, []);
}

function parseOptionalNonRetryableStatusCode(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '0') return 0;
  return parseHttpStatusCodeString(trimmed);
}

function parseOptionalResponseStatusCode(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '0') return 0;
  const parsed = parseHttpStatusCodeString(trimmed);
  return parsed !== null && parsed >= 400 ? parsed : null;
}

function serializeNonRetryableErrorsForYaml(
  rules: NonRetryableErrorVisualEntry[]
): Array<Record<string, unknown>> {
  return rules.reduce<Array<Record<string, unknown>>>((result, rule) => {
    const statusCode = parseOptionalNonRetryableStatusCode(rule.statusCode);
    if (rule.statusCode.trim() && statusCode === null) return result;

    const type = rule.type.trim();
    const code = rule.code.trim();
    const messageContains = rule.messageContains.trim();
    if ((statusCode === null || statusCode === 0) && !type && !code && !messageContains) {
      return result;
    }

    const entry: Record<string, unknown> = {};
    if (statusCode !== null && statusCode !== 0) entry['status-code'] = statusCode;
    if (type) entry.type = type;
    if (code) entry.code = code;
    if (messageContains) entry['message-contains'] = messageContains;
    result.push(entry);
    return result;
  }, []);
}

function areNonRetryableErrorsEqual(
  left: NonRetryableErrorVisualEntry[],
  right: NonRetryableErrorVisualEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      Boolean(other) &&
      entry.statusCode === other.statusCode &&
      entry.type === other.type &&
      entry.code === other.code &&
      entry.messageContains === other.messageContains
    );
  });
}

function parseErrorResponseRewrites(raw: unknown): ErrorResponseRewriteVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<ErrorResponseRewriteVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;
    const responseBodyKey = Object.prototype.hasOwnProperty.call(record, 'response-body')
      ? 'response-body'
      : Object.prototype.hasOwnProperty.call(record, 'responseBody')
        ? 'responseBody'
        : null;
    const responseBody = responseBodyKey ? record[responseBodyKey] : undefined;

    result.push({
      clientId: makeClientId(),
      statusCode: formatOptionalStatusCode(record['status-code'] ?? record.statusCode),
      messageContains: String(record['message-contains'] ?? record.messageContains ?? ''),
      responseStatusCode: formatOptionalStatusCode(
        record['response-status-code'] ?? record.responseStatusCode
      ),
      responseBodyEnabled: responseBodyKey !== null,
      responseBody: responseBodyKey === null ? '{}' : stringifyJsonForEditor(responseBody ?? null),
    });
    return result;
  }, []);
}

function stringifyJsonForEditor(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);
    const items = value.map(
      (item) => `${childIndent}${stringifyJsonForEditor(item ?? null, depth + 1)}`
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  const record = asRecord(value);
  if (!record) return 'null';
  const entries = Object.entries(record).filter(
    ([, item]) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol'
  );
  if (entries.length === 0) return '{}';
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  const fields = entries.map(
    ([key, item]) =>
      `${childIndent}${JSON.stringify(key)}: ${stringifyJsonForEditor(item, depth + 1)}`
  );
  return `{\n${fields.join(',\n')}\n${indent}}`;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    // Keep JSON syntax strict, then reparse integers as BigInt so YAML saves do not round them.
    const strictParsed: unknown = JSON.parse(value);
    if (!asRecord(strictParsed)) return null;
    const preciseParsed: unknown = parseYaml(value, {
      schema: 'json',
      intAsBigInt: true,
    });
    return asRecord(preciseParsed);
  } catch {
    return null;
  }
}

function serializeErrorResponseRewritesForYaml(
  rules: ErrorResponseRewriteVisualEntry[]
): Array<Record<string, unknown>> {
  return rules.reduce<Array<Record<string, unknown>>>((result, rule) => {
    const statusCode = parseOptionalNonRetryableStatusCode(rule.statusCode);
    const responseStatusCode = parseOptionalResponseStatusCode(rule.responseStatusCode);
    const messageContains = rule.messageContains.trim();
    const responseBody = rule.responseBodyEnabled ? parseJsonObject(rule.responseBody) : null;
    if (rule.statusCode.trim() && statusCode === null) return result;
    if (rule.responseStatusCode.trim() && responseStatusCode === null) return result;
    if ((statusCode === null || statusCode === 0) && !messageContains) return result;
    if ((responseStatusCode === null || responseStatusCode === 0) && !rule.responseBodyEnabled) {
      return result;
    }
    if (rule.responseBodyEnabled && responseBody === null) return result;

    const entry: Record<string, unknown> = {};
    if (statusCode !== null && statusCode !== 0) entry['status-code'] = statusCode;
    if (messageContains) entry['message-contains'] = messageContains;
    if (responseStatusCode !== null && responseStatusCode !== 0) {
      entry['response-status-code'] = responseStatusCode;
    }
    if (rule.responseBodyEnabled) entry['response-body'] = responseBody;
    result.push(entry);
    return result;
  }, []);
}

function areErrorResponseRewritesEqual(
  left: ErrorResponseRewriteVisualEntry[],
  right: ErrorResponseRewriteVisualEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      Boolean(other) &&
      entry.statusCode === other.statusCode &&
      entry.messageContains === other.messageContains &&
      entry.responseStatusCode === other.responseStatusCode &&
      entry.responseBodyEnabled === other.responseBodyEnabled &&
      entry.responseBody === other.responseBody
    );
  });
}

function normalizeRoutingPriorityOverrideStrategy(value: unknown): RoutingPriorityOverrideStrategy {
  return value === 'round-robin' || value === 'fill-first' || value === 'random' ? value : '';
}

function normalizeRoutingPlanType(value: string): string {
  const normalized = value.trim().toLowerCase();
  const compact = normalized.replace(/[-_\s]/g, '');
  switch (compact) {
    case 'chatgptfreeplan':
      return 'free';
    case 'chatgptplusplan':
      return 'plus';
    case 'chatgptproplan':
      return 'pro';
    case 'chatgptteamplan':
    case 'chatgptbusinessplan':
    case 'selfservebusiness':
    case 'selfservebusinessusagebased':
      return 'team';
    case 'chatgptenterpriseplan':
      return 'enterprise';
    default:
      return normalized;
  }
}

function normalizeRoutingProviders(values: string[]): string[] {
  return normalizeStringListItems(values.map((value) => value.toLowerCase()));
}

function normalizeRoutingPlanTypes(values: string[]): string[] {
  return normalizeStringListItems(values.map(normalizeRoutingPlanType));
}

function routingProviderScopesOverlap(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeRoutingProviders(left);
  const normalizedRight = normalizeRoutingProviders(right);
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) return true;
  const rightProviders = new Set(normalizedRight);
  return normalizedLeft.some((provider) => rightProviders.has(provider));
}

function parseRoutingSubscriptionOverrides(raw: unknown): RoutingSubscriptionOverrideVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<RoutingSubscriptionOverrideVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;
    result.push({
      clientId: makeClientId(),
      providers: normalizeRoutingProviders(parseStringList(record.providers)),
      planTypes: normalizeRoutingPlanTypes(
        parseStringList(record['plan-types'] ?? record.planTypes)
      ),
      perAuthRequestLimit:
        record['per-auth-request-limit'] === undefined && record.perAuthRequestLimit === undefined
          ? ''
          : String(record['per-auth-request-limit'] ?? record.perAuthRequestLimit ?? ''),
      perAuthRequestWindowMinutes:
        record['per-auth-request-window-minutes'] === undefined &&
        record.perAuthRequestWindowMinutes === undefined
          ? ''
          : String(
              record['per-auth-request-window-minutes'] ?? record.perAuthRequestWindowMinutes ?? ''
            ),
    });
    return result;
  }, []);
}

function parseRoutingPriorityOverrides(raw: unknown): RoutingPriorityOverrideVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<RoutingPriorityOverrideVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;

    const maxRetryCredentialsRaw = Object.prototype.hasOwnProperty.call(
      record,
      'max-retry-credentials'
    )
      ? record['max-retry-credentials']
      : record.maxRetryCredentials;

    result.push({
      clientId: makeClientId(),
      priority:
        record.priority === undefined || record.priority === null ? '' : String(record.priority),
      strategy: normalizeRoutingPriorityOverrideStrategy(record.strategy),
      maxRetryCredentials:
        maxRetryCredentialsRaw === undefined || maxRetryCredentialsRaw === null
          ? ''
          : String(maxRetryCredentialsRaw),
      fillFirstRange:
        record['fill-first-range'] === undefined && record.fillFirstRange === undefined
          ? ''
          : String(record['fill-first-range'] ?? record.fillFirstRange ?? ''),
      fillFirstPerAuthRpm:
        record['fill-first-per-auth-rpm'] === undefined && record.fillFirstPerAuthRpm === undefined
          ? ''
          : String(record['fill-first-per-auth-rpm'] ?? record.fillFirstPerAuthRpm ?? ''),
      perAuthRequestLimit:
        record['per-auth-request-limit'] === undefined && record.perAuthRequestLimit === undefined
          ? ''
          : String(record['per-auth-request-limit'] ?? record.perAuthRequestLimit ?? ''),
      perAuthRequestWindowMinutes:
        record['per-auth-request-window-minutes'] === undefined &&
        record.perAuthRequestWindowMinutes === undefined
          ? ''
          : String(
              record['per-auth-request-window-minutes'] ?? record.perAuthRequestWindowMinutes ?? ''
            ),
      subscriptionOverrides: parseRoutingSubscriptionOverrides(
        record['subscription-overrides'] ?? record.subscriptionOverrides
      ),
    });
    return result;
  }, []);
}

function areRoutingPriorityOverridesEqual(
  left: RoutingPriorityOverrideVisualEntry[],
  right: RoutingPriorityOverrideVisualEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      Boolean(other) &&
      entry.priority === other.priority &&
      entry.strategy === other.strategy &&
      entry.maxRetryCredentials === other.maxRetryCredentials &&
      entry.fillFirstRange === other.fillFirstRange &&
      entry.fillFirstPerAuthRpm === other.fillFirstPerAuthRpm &&
      entry.perAuthRequestLimit === other.perAuthRequestLimit &&
      entry.perAuthRequestWindowMinutes === other.perAuthRequestWindowMinutes &&
      entry.subscriptionOverrides.length === other.subscriptionOverrides.length &&
      entry.subscriptionOverrides.every((subscription, subscriptionIndex) => {
        const otherSubscription = other.subscriptionOverrides[subscriptionIndex];
        return (
          Boolean(otherSubscription) &&
          areStringArraysEqual(subscription.providers, otherSubscription.providers) &&
          areStringArraysEqual(subscription.planTypes, otherSubscription.planTypes) &&
          subscription.perAuthRequestLimit === otherSubscription.perAuthRequestLimit &&
          subscription.perAuthRequestWindowMinutes === otherSubscription.perAuthRequestWindowMinutes
        );
      })
    );
  });
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function parseAuthModelExclusions(raw: unknown): AuthModelExclusionVisualEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<AuthModelExclusionVisualEntry[]>((result, item) => {
    const record = asRecord(item);
    if (!record) return result;
    result.push({
      clientId: makeClientId(),
      providers: normalizeAuthModelExclusionProviders(parseStringList(record.providers)),
      models: normalizeAuthModelExclusionModels(parseStringList(record.models)),
      priorities: parseStringList(record.priorities),
      keywordContains: normalizeStringListItems(
        parseStringList(record['keyword-contains'] ?? record.keywordContains)
      ),
      disableImageGeneration: parseBooleanValue(
        record['disable-image-generation'] ?? record.disableImageGeneration
      ),
    });
    return result;
  }, []);
}

function parseDisabledImageGenerationToolAction(raw: unknown): DisabledImageGenerationToolAction {
  if (typeof raw !== 'string') return DEFAULT_VISUAL_VALUES.disabledImageGenerationToolAction;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'error' || normalized === 'remove'
    ? normalized
    : DEFAULT_VISUAL_VALUES.disabledImageGenerationToolAction;
}

function parseDisabledImageGenerationToolError(
  raw: unknown
): DisabledImageGenerationToolErrorVisualConfig {
  const record = asRecord(raw);
  const defaults = DEFAULT_VISUAL_VALUES.disabledImageGenerationToolError;
  return {
    statusCode:
      record?.['status-code'] === undefined && record?.statusCode === undefined
        ? defaults.statusCode
        : String(record?.['status-code'] ?? record?.statusCode ?? ''),
    message:
      typeof record?.message === 'string'
        ? record.message
        : String(record?.message ?? defaults.message),
    type: typeof record?.type === 'string' ? record.type : String(record?.type ?? defaults.type),
    code: typeof record?.code === 'string' ? record.code : String(record?.code ?? defaults.code),
  };
}

function serializeAuthModelExclusionsForYaml(
  rules: AuthModelExclusionVisualEntry[]
): Array<Record<string, unknown>> {
  return rules.reduce<Array<Record<string, unknown>>>((result, rule) => {
    const providers = normalizeAuthModelExclusionProviders(rule.providers);
    const models = normalizeAuthModelExclusionModels(rule.models);
    if (models.length === 0 && !rule.disableImageGeneration) return result;

    const priorities = rule.priorities.reduce<number[]>((list, item) => {
      const parsed = parseIntegerString(item);
      if (parsed !== null) list.push(parsed);
      return list;
    }, []);
    const keywordContains = normalizeStringListItems(rule.keywordContains);
    if (providers.length === 0 && priorities.length === 0 && keywordContains.length === 0) {
      return result;
    }

    const entry: Record<string, unknown> = {};
    if (providers.length > 0) entry.providers = providers;
    if (models.length > 0) entry.models = models;
    if (priorities.length > 0) entry.priorities = Array.from(new Set(priorities));
    if (keywordContains.length > 0) entry['keyword-contains'] = keywordContains;
    if (rule.disableImageGeneration) entry['disable-image-generation'] = true;
    result.push(entry);
    return result;
  }, []);
}

function areAuthModelExclusionsEqual(
  left: AuthModelExclusionVisualEntry[],
  right: AuthModelExclusionVisualEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      Boolean(other) &&
      areStringArraysEqual(entry.providers, other.providers) &&
      areStringArraysEqual(entry.models, other.models) &&
      areStringArraysEqual(entry.priorities, other.priorities) &&
      areStringArraysEqual(entry.keywordContains, other.keywordContains) &&
      entry.disableImageGeneration === other.disableImageGeneration
    );
  });
}

function areDisabledImageGenerationToolErrorsEqual(
  left: DisabledImageGenerationToolErrorVisualConfig,
  right: DisabledImageGenerationToolErrorVisualConfig
): boolean {
  return (
    left.statusCode === right.statusCode &&
    left.message === right.message &&
    left.type === right.type &&
    left.code === right.code
  );
}

function areNativeImageEndpointsEqual(
  left: NativeImageEndpointVisualConfig,
  right: NativeImageEndpointVisualConfig
): boolean {
  return (
    left.enabled === right.enabled &&
    areStringArraysEqual(left.models, right.models) &&
    areStringArraysEqual(left.paramRules, right.paramRules) &&
    left.unsupportedModelStatusCode === right.unsupportedModelStatusCode &&
    left.unsupportedModelMessage === right.unsupportedModelMessage
  );
}

function areNativeImagesEqual(left: NativeImagesVisualConfig, right: NativeImagesVisualConfig) {
  return (
    areNativeImageEndpointsEqual(left.generations, right.generations) &&
    areNativeImageEndpointsEqual(left.edits, right.edits)
  );
}

function parseIntegerString(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseNonNegativeIntegerString(value: string): number | null {
  const parsed = parseIntegerString(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function serializeRoutingPriorityOverridesForYaml(
  rules: RoutingPriorityOverrideVisualEntry[]
): Array<Record<string, unknown>> {
  return rules.reduce<Array<Record<string, unknown>>>((result, rule) => {
    const priority = parseIntegerString(rule.priority);
    if (priority === null) return result;

    const entry: Record<string, unknown> = { priority };
    if (rule.strategy) {
      entry.strategy = rule.strategy;
    }
    if (rule.maxRetryCredentials.trim()) {
      const maxRetryCredentials = parseNonNegativeIntegerString(rule.maxRetryCredentials);
      if (maxRetryCredentials === null) return result;
      entry['max-retry-credentials'] = maxRetryCredentials;
    }
    if (rule.fillFirstRange.trim()) {
      const fillFirstRange = parsePositiveIntegerString(rule.fillFirstRange);
      if (fillFirstRange === null) return result;
      entry['fill-first-range'] = fillFirstRange;
    }
    if (rule.fillFirstPerAuthRpm.trim()) {
      const fillFirstPerAuthRpm = parseNonNegativeIntegerString(rule.fillFirstPerAuthRpm);
      if (fillFirstPerAuthRpm === null) return result;
      entry['fill-first-per-auth-rpm'] = fillFirstPerAuthRpm;
    }
    if (rule.perAuthRequestLimit.trim()) {
      const perAuthRequestLimit = parseNonNegativeIntegerString(rule.perAuthRequestLimit);
      if (perAuthRequestLimit === null) return result;
      entry['per-auth-request-limit'] = perAuthRequestLimit;
    }
    if (rule.perAuthRequestWindowMinutes.trim()) {
      const perAuthRequestWindowMinutes = parsePositiveIntegerString(
        rule.perAuthRequestWindowMinutes
      );
      if (perAuthRequestWindowMinutes === null) return result;
      entry['per-auth-request-window-minutes'] = perAuthRequestWindowMinutes;
    }
    if (rule.subscriptionOverrides.length > 0) {
      entry['subscription-overrides'] = rule.subscriptionOverrides.reduce<
        Array<Record<string, unknown>>
      >((subscriptionResult, subscriptionRule) => {
        const planTypes = normalizeRoutingPlanTypes(subscriptionRule.planTypes);
        const subscriptionEntry: Record<string, unknown> = {
          'plan-types': planTypes,
        };
        const providers = normalizeRoutingProviders(subscriptionRule.providers);
        if (providers.length > 0) {
          subscriptionEntry.providers = providers;
        }
        if (subscriptionRule.perAuthRequestLimit.trim()) {
          const limit = parseNonNegativeIntegerString(subscriptionRule.perAuthRequestLimit);
          subscriptionEntry['per-auth-request-limit'] =
            limit ?? subscriptionRule.perAuthRequestLimit.trim();
        }
        if (subscriptionRule.perAuthRequestWindowMinutes.trim()) {
          const windowMinutes = parsePositiveIntegerString(
            subscriptionRule.perAuthRequestWindowMinutes
          );
          subscriptionEntry['per-auth-request-window-minutes'] =
            windowMinutes ?? subscriptionRule.perAuthRequestWindowMinutes.trim();
        }
        subscriptionResult.push(subscriptionEntry);
        return subscriptionResult;
      }, []);
    }

    result.push(entry);
    return result;
  }, []);
}

function getNonNegativeIntegerError(value: string): 'non_negative_integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'non_negative_integer';
  return Number(trimmed) >= 0 ? undefined : 'non_negative_integer';
}

function getIntegerListError(value: string): 'integer_list' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return parseIntegerListText(value).valid ? undefined : 'integer_list';
}

function getPortError(value: string): 'port_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'port_range';
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= 65535 ? undefined : 'port_range';
}

function getIntegerError(value: string): 'integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'integer';
  if (!/^-?\d+$/.test(trimmed)) return 'integer';
  return Number.isSafeInteger(Number(trimmed)) ? undefined : 'integer';
}

function getManagementAccessPathError(value: string): 'management_access_path' | undefined {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return undefined;
  if (normalized.length > 128) return 'management_access_path';
  if (normalized === '.' || normalized === '..') return 'management_access_path';
  return /^[A-Za-z0-9._-]+$/.test(normalized) ? undefined : 'management_access_path';
}

function getHttpStatusRangeError(value: string): 'http_status_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'http_status_range';
  const parsed = Number(trimmed);
  return parsed >= 400 && parsed <= 599 ? undefined : 'http_status_range';
}

function getOptionalHttpStatusCodeError(value: string): 'http_status_code' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'http_status_code';
  const parsed = Number(trimmed);
  return parsed >= 100 && parsed <= 599 ? undefined : 'http_status_code';
}

function getOptionalNonRetryableStatusCodeError(value: string): 'http_status_code' | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0') return undefined;
  return getOptionalHttpStatusCodeError(value);
}

function getOptionalResponseStatusCodeError(value: string): 'http_status_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0') return undefined;
  return getHttpStatusRangeError(value);
}

function getIntegerStringListError(values: string[]): 'integer_list' | undefined {
  return values.every((value) => {
    const trimmed = value.trim();
    return !trimmed || /^-?\d+$/.test(trimmed);
  })
    ? undefined
    : 'integer_list';
}

function getSafeIntegerStringListError(values: string[]): 'integer_list' | undefined {
  return values.every((value) => parseIntegerString(value) !== null) ? undefined : 'integer_list';
}

function getPositiveIntegerError(value: string): 'positive_integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'positive_integer';
  if (!/^\d+$/.test(trimmed)) return 'positive_integer';
  return Number(trimmed) > 0 ? undefined : 'positive_integer';
}

function getNumberRangeError(
  value: string,
  min: number,
  max: number,
  errorCode: 'number_range_0_10'
): 'number_range_0_10' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return errorCode;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? undefined : errorCode;
}

function getIntegerRangeError(
  value: string,
  min: number,
  max: number,
  errorCode: 'integer_range_1_3840' | 'integer_range_1_256'
): 'integer_range_1_3840' | 'integer_range_1_256' | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return errorCode;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? undefined : errorCode;
}

function getHttpStatusListError(value: string): 'integer_list' | 'http_status_list' | undefined {
  const parsed = parseIntegerListText(value);
  if (!parsed.valid) return 'integer_list';
  return parsed.values.every((statusCode) => statusCode >= 100 && statusCode <= 599)
    ? undefined
    : 'http_status_list';
}

export function getVisualConfigValidationErrors(
  values: VisualConfigValues
): VisualConfigValidationErrors {
  const routingFillFirstRangeValue = parsePositiveIntegerString(values.routingFillFirstRange);
  const routingFillFirstPerAuthRpmValue = parseNonNegativeIntegerString(
    values.routingFillFirstPerAuthRpm
  );
  const routingFillFirstRangeBaseError =
    values.routingStrategy === 'fill-first'
      ? getPositiveIntegerError(values.routingFillFirstRange)
      : undefined;
  const routingFillFirstPerAuthRpmBaseError =
    values.routingStrategy === 'fill-first'
      ? getNonNegativeIntegerError(values.routingFillFirstPerAuthRpm)
      : undefined;
  const routingFillFirstControlsConflict =
    values.routingStrategy === 'fill-first' &&
    !routingFillFirstRangeBaseError &&
    !routingFillFirstPerAuthRpmBaseError &&
    (routingFillFirstRangeValue ?? 1) > 1 &&
    (routingFillFirstPerAuthRpmValue ?? 0) > 0;
  const routingFillFirstRangeError = routingFillFirstControlsConflict
    ? 'fill_first_controls_conflict'
    : routingFillFirstRangeBaseError;
  const routingFillFirstPerAuthRpmError = routingFillFirstControlsConflict
    ? 'fill_first_controls_conflict'
    : routingFillFirstPerAuthRpmBaseError;
  const routingPerAuthRequestLimitError = getNonNegativeIntegerError(
    values.routingPerAuthRequestLimit
  );
  const routingPerAuthRequestWindowMinutesError = getPositiveIntegerError(
    values.routingPerAuthRequestWindowMinutes
  );
  const priorityCounts = values.routingPriorityOverrides.reduce<Map<number, number>>(
    (result, rule) => {
      const priority = parseIntegerString(rule.priority);
      if (priority !== null) {
        result.set(priority, (result.get(priority) ?? 0) + 1);
      }
      return result;
    },
    new Map()
  );
  const routingPriorityOverrideErrors =
    values.routingPriorityOverrides.reduce<VisualConfigValidationErrors>((result, rule) => {
      const priorityError = getIntegerError(rule.priority);
      const priority = parseIntegerString(rule.priority);
      if (priorityError) {
        result[`routingPriorityOverrides.${rule.clientId}.priority`] = priorityError;
      } else if (priority !== null && (priorityCounts.get(priority) ?? 0) > 1) {
        result[`routingPriorityOverrides.${rule.clientId}.priority`] = 'priority_duplicate';
      }
      const maxRetryCredentialsError = getNonNegativeIntegerError(rule.maxRetryCredentials);
      if (maxRetryCredentialsError) {
        result[`routingPriorityOverrides.${rule.clientId}.maxRetryCredentials`] =
          maxRetryCredentialsError;
      }
      const effectiveStrategy = rule.strategy || values.routingStrategy;
      const fillFirstRangeError =
        effectiveStrategy === 'fill-first' && rule.fillFirstRange.trim()
          ? getPositiveIntegerError(rule.fillFirstRange)
          : undefined;
      if (fillFirstRangeError) {
        result[`routingPriorityOverrides.${rule.clientId}.fillFirstRange`] = fillFirstRangeError;
      }
      const fillFirstPerAuthRpmError =
        effectiveStrategy === 'fill-first' && rule.fillFirstPerAuthRpm.trim()
          ? getNonNegativeIntegerError(rule.fillFirstPerAuthRpm)
          : undefined;
      if (fillFirstPerAuthRpmError) {
        result[`routingPriorityOverrides.${rule.clientId}.fillFirstPerAuthRpm`] =
          fillFirstPerAuthRpmError;
      }
      const perAuthRequestLimitError = rule.perAuthRequestLimit.trim()
        ? getNonNegativeIntegerError(rule.perAuthRequestLimit)
        : undefined;
      if (perAuthRequestLimitError) {
        result[`routingPriorityOverrides.${rule.clientId}.perAuthRequestLimit`] =
          perAuthRequestLimitError;
      }
      const perAuthRequestWindowMinutesError = rule.perAuthRequestWindowMinutes.trim()
        ? getPositiveIntegerError(rule.perAuthRequestWindowMinutes)
        : undefined;
      if (perAuthRequestWindowMinutesError) {
        result[`routingPriorityOverrides.${rule.clientId}.perAuthRequestWindowMinutes`] =
          perAuthRequestWindowMinutesError;
      }
      const hasOverrideFillControl =
        Boolean(rule.fillFirstRange.trim()) || Boolean(rule.fillFirstPerAuthRpm.trim());
      const effectiveFillFirstRange = rule.fillFirstRange.trim()
        ? parsePositiveIntegerString(rule.fillFirstRange)
        : (routingFillFirstRangeValue ?? 1);
      const effectiveFillFirstPerAuthRpm = rule.fillFirstPerAuthRpm.trim()
        ? parseNonNegativeIntegerString(rule.fillFirstPerAuthRpm)
        : (routingFillFirstPerAuthRpmValue ?? 0);
      if (
        effectiveStrategy === 'fill-first' &&
        hasOverrideFillControl &&
        !fillFirstRangeError &&
        !fillFirstPerAuthRpmError &&
        (effectiveFillFirstRange ?? 1) > 1 &&
        (effectiveFillFirstPerAuthRpm ?? 0) > 0
      ) {
        result[`routingPriorityOverrides.${rule.clientId}.fillFirstRange`] =
          'fill_first_controls_conflict';
        result[`routingPriorityOverrides.${rule.clientId}.fillFirstPerAuthRpm`] =
          'fill_first_controls_conflict';
      }
      rule.subscriptionOverrides.forEach((subscriptionRule, subscriptionIndex) => {
        const pathPrefix = `routingPriorityOverrides.${rule.clientId}.subscriptionOverrides.${subscriptionRule.clientId}`;
        const planTypes = normalizeRoutingPlanTypes(subscriptionRule.planTypes);
        if (planTypes.length === 0) {
          result[`${pathPrefix}.planTypes`] = 'routing_subscription_plan_required';
        }
        const subscriptionLimitError = subscriptionRule.perAuthRequestLimit.trim()
          ? getNonNegativeIntegerError(subscriptionRule.perAuthRequestLimit)
          : undefined;
        if (subscriptionLimitError) {
          result[`${pathPrefix}.perAuthRequestLimit`] = subscriptionLimitError;
        }
        const subscriptionWindowError = subscriptionRule.perAuthRequestWindowMinutes.trim()
          ? getPositiveIntegerError(subscriptionRule.perAuthRequestWindowMinutes)
          : undefined;
        if (subscriptionWindowError) {
          result[`${pathPrefix}.perAuthRequestWindowMinutes`] = subscriptionWindowError;
        }
        if (
          !subscriptionRule.perAuthRequestLimit.trim() &&
          !subscriptionRule.perAuthRequestWindowMinutes.trim()
        ) {
          result[`${pathPrefix}.perAuthRequestLimit`] = 'routing_subscription_limit_required';
          result[`${pathPrefix}.perAuthRequestWindowMinutes`] =
            'routing_subscription_limit_required';
        }
        const overlapsPreviousRule = rule.subscriptionOverrides
          .slice(0, subscriptionIndex)
          .some((previousRule) => {
            if (!routingProviderScopesOverlap(previousRule.providers, subscriptionRule.providers)) {
              return false;
            }
            const previousPlanTypes = new Set(normalizeRoutingPlanTypes(previousRule.planTypes));
            return planTypes.some((planType) => previousPlanTypes.has(planType));
          });
        if (overlapsPreviousRule) {
          result[`${pathPrefix}.planTypes`] = 'routing_subscription_overlap';
        }
      });
      return result;
    }, {});
  const fixedErrorCooldownErrors = values.fixedErrorCooldowns.reduce<VisualConfigValidationErrors>(
    (result, rule) => {
      const statusCodeError = getOptionalHttpStatusCodeError(rule.statusCode);
      if (statusCodeError) {
        result[`fixedErrorCooldowns.${rule.clientId}.statusCode`] = statusCodeError;
      }
      if (!rule.statusCode.trim() && !rule.messageContains.trim()) {
        result[`fixedErrorCooldowns.${rule.clientId}.statusCode`] =
          'fixed_error_cooldown_match_required';
        result[`fixedErrorCooldowns.${rule.clientId}.messageContains`] =
          'fixed_error_cooldown_match_required';
      }
      const cooldownSecondsError = getPositiveIntegerError(rule.cooldownSeconds);
      if (cooldownSecondsError) {
        result[`fixedErrorCooldowns.${rule.clientId}.cooldownSeconds`] = cooldownSecondsError;
      }
      return result;
    },
    {}
  );
  const nonRetryableErrorErrors = values.nonRetryableErrors.reduce<VisualConfigValidationErrors>(
    (result, rule) => {
      const statusCodeError = getOptionalNonRetryableStatusCodeError(rule.statusCode);
      if (statusCodeError) {
        result[`nonRetryableErrors.${rule.clientId}.statusCode`] = statusCodeError;
      }
      const hasStatusMatcher = Boolean(rule.statusCode.trim() && rule.statusCode.trim() !== '0');
      if (
        !hasStatusMatcher &&
        !rule.type.trim() &&
        !rule.code.trim() &&
        !rule.messageContains.trim()
      ) {
        result[`nonRetryableErrors.${rule.clientId}.match`] = 'non_retryable_error_match_required';
      }
      return result;
    },
    {}
  );
  const errorResponseRewriteErrors =
    values.errorResponseRewrites.reduce<VisualConfigValidationErrors>((result, rule) => {
      const statusCodeError = getOptionalNonRetryableStatusCodeError(rule.statusCode);
      if (statusCodeError) {
        result[`errorResponseRewrites.${rule.clientId}.statusCode`] = statusCodeError;
      }
      const hasStatusMatcher = Boolean(rule.statusCode.trim() && rule.statusCode.trim() !== '0');
      if (!hasStatusMatcher && !rule.messageContains.trim()) {
        result[`errorResponseRewrites.${rule.clientId}.statusCode`] =
          'error_response_rewrite_match_required';
        result[`errorResponseRewrites.${rule.clientId}.messageContains`] =
          'error_response_rewrite_match_required';
      }

      const responseStatusCodeError = getOptionalResponseStatusCodeError(rule.responseStatusCode);
      if (responseStatusCodeError) {
        result[`errorResponseRewrites.${rule.clientId}.responseStatusCode`] =
          responseStatusCodeError;
      }
      const hasResponseStatus = Boolean(
        rule.responseStatusCode.trim() && rule.responseStatusCode.trim() !== '0'
      );
      if (!hasResponseStatus && !rule.responseBodyEnabled) {
        result[`errorResponseRewrites.${rule.clientId}.responseStatusCode`] =
          'error_response_rewrite_result_required';
        result[`errorResponseRewrites.${rule.clientId}.responseBody`] =
          'error_response_rewrite_result_required';
      } else if (rule.responseBodyEnabled && parseJsonObject(rule.responseBody) === null) {
        result[`errorResponseRewrites.${rule.clientId}.responseBody`] = 'json_object';
      }
      return result;
    }, {});
  const authModelExclusionErrors = values.authModelExclusions.reduce<VisualConfigValidationErrors>(
    (result, rule) => {
      if (normalizeStringListItems(rule.models).length === 0 && !rule.disableImageGeneration) {
        result[`authModelExclusions.${rule.clientId}.models`] =
          'auth_model_exclusion_models_required';
      }
      const prioritiesError = getIntegerStringListError(rule.priorities);
      if (prioritiesError) {
        result[`authModelExclusions.${rule.clientId}.priorities`] = prioritiesError;
      }
      if (
        normalizeAuthModelExclusionProviders(rule.providers).length === 0 &&
        normalizeStringListItems(rule.priorities).length === 0 &&
        normalizeStringListItems(rule.keywordContains).length === 0
      ) {
        result[`authModelExclusions.${rule.clientId}.match`] =
          'auth_model_exclusion_match_required';
      }
      return result;
    },
    {}
  );
  const disabledImageGenerationToolStatusCodeError =
    values.disabledImageGenerationToolAction === 'error'
      ? getOptionalHttpStatusCodeError(values.disabledImageGenerationToolError.statusCode)
      : undefined;

  return {
    port: getPortError(values.port),
    rmAccessPath: getManagementAccessPathError(values.rmAccessPath),
    logsMaxTotalSizeMb: getNonNegativeIntegerError(values.logsMaxTotalSizeMb),
    usageStatisticsPersistIntervalSeconds: getNonNegativeIntegerError(
      values.usageStatisticsPersistIntervalSeconds
    ),
    requestRetry: getNonNegativeIntegerError(values.requestRetry),
    maxRetryCredentials: getNonNegativeIntegerError(values.maxRetryCredentials),
    maxRetryInterval: getNonNegativeIntegerError(values.maxRetryInterval),
    noCooldownStatusCodes: getHttpStatusListError(values.noCooldownStatusCodes),
    chatgptWebAutoDeleteDeadPriorities: getSafeIntegerStringListError(
      values.chatgptWebAutoDeleteDeadPriorities
    ),
    chatgptWebAspectRatioMaxErrorPercent: getNumberRangeError(
      values.chatgptWebAspectRatioMaxErrorPercent,
      0,
      10,
      'number_range_0_10'
    ),
    chatgptWebMaxResizeEdgePixels: getIntegerRangeError(
      values.chatgptWebMaxResizeEdgePixels,
      1,
      3840,
      'integer_range_1_3840'
    ),
    chatgptWebResizeToRequestedSize:
      values.chatgptWebResizeToRequestedSize && !values.chatgptWebAdaptSizeToAspectRatio
        ? 'resize_requires_aspect_adaptation'
        : undefined,
    chatgptWebResizeFilter: ['catmull-rom', 'approx-bilinear'].includes(
      values.chatgptWebResizeFilter
    )
      ? undefined
      : 'resize_filter',
    chatgptWebMaxImageResponseMegabytes: getIntegerRangeError(
      values.chatgptWebMaxImageResponseMegabytes,
      1,
      256,
      'integer_range_1_256'
    ),
    routingFillFirstRange: routingFillFirstRangeError,
    routingFillFirstPerAuthRpm: routingFillFirstPerAuthRpmError,
    routingPerAuthRequestLimit: routingPerAuthRequestLimitError,
    routingPerAuthRequestWindowMinutes: routingPerAuthRequestWindowMinutesError,
    ...routingPriorityOverrideErrors,
    ...fixedErrorCooldownErrors,
    ...errorResponseRewriteErrors,
    ...nonRetryableErrorErrors,
    ...authModelExclusionErrors,
    'disabledImageGenerationToolError.statusCode': disabledImageGenerationToolStatusCodeError,
    'authMaintenance.scanIntervalSeconds': getNonNegativeIntegerError(
      values.authMaintenance.scanIntervalSeconds
    ),
    'authMaintenance.deleteIntervalSeconds': getNonNegativeIntegerError(
      values.authMaintenance.deleteIntervalSeconds
    ),
    'authMaintenance.deleteStatusCodes': getIntegerListError(
      values.authMaintenance.deleteStatusCodes
    ),
    'authMaintenance.quotaStrikeThreshold': getNonNegativeIntegerError(
      values.authMaintenance.quotaStrikeThreshold
    ),
    'authMaintenance.disableQuotaStrikeThreshold': getNonNegativeIntegerError(
      values.authMaintenance.disableQuotaStrikeThreshold
    ),
    'images.unsupportedStatusCode': getHttpStatusRangeError(values.images.unsupportedStatusCode),
    'images.streamFlushIntervalMs': getNonNegativeIntegerError(values.images.streamFlushIntervalMs),
    'images.streamFlushMinBytes': getNonNegativeIntegerError(values.images.streamFlushMinBytes),
    'images.native.generations.unsupportedModelStatusCode': getHttpStatusRangeError(
      values.images.native.generations.unsupportedModelStatusCode
    ),
    'images.native.edits.unsupportedModelStatusCode': getHttpStatusRangeError(
      values.images.native.edits.unsupportedModelStatusCode
    ),
    'streaming.keepaliveSeconds': getNonNegativeIntegerError(values.streaming.keepaliveSeconds),
    'streaming.bootstrapRetries': getNonNegativeIntegerError(values.streaming.bootstrapRetries),
    'streaming.streamFlushIntervalMs': getNonNegativeIntegerError(
      values.streaming.streamFlushIntervalMs
    ),
    'streaming.streamFlushMinBytes': getNonNegativeIntegerError(
      values.streaming.streamFlushMinBytes
    ),
    'streaming.nonstreamKeepaliveInterval': getNonNegativeIntegerError(
      values.streaming.nonstreamKeepaliveInterval
    ),
  };
}

export function getPayloadParamValidationError(
  param: PayloadParamEntry
): PayloadParamValidationErrorCode | undefined {
  const trimmedValue = param.value.trim();

  switch (param.valueType) {
    case 'number': {
      if (!trimmedValue) return 'payload_invalid_number';
      const parsed = Number(trimmedValue);
      return Number.isFinite(parsed) ? undefined : 'payload_invalid_number';
    }
    case 'boolean': {
      const normalized = trimmedValue.toLowerCase();
      return normalized === 'true' || normalized === 'false'
        ? undefined
        : 'payload_invalid_boolean';
    }
    case 'json': {
      if (!trimmedValue) return 'payload_invalid_json';
      try {
        JSON.parse(param.value);
        return undefined;
      } catch {
        return 'payload_invalid_json';
      }
    }
    default:
      return undefined;
  }
}

function hasPayloadParamValidationErrors(rules: PayloadRule[]): boolean {
  return rules.some((rule) =>
    rule.params.some((param) => Boolean(getPayloadParamValidationError(param)))
  );
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function arePayloadModelEntriesEqual(
  left: PayloadRule['models'],
  right: PayloadRule['models']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.name !== b.name || a.protocol !== b.protocol) return false;
  }
  return true;
}

function arePayloadParamEntriesEqual(
  left: PayloadRule['params'],
  right: PayloadRule['params']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.path !== b.path || a.valueType !== b.valueType || a.value !== b.value) {
      return false;
    }
  }
  return true;
}

function arePayloadRulesEqual(left: PayloadRule[], right: PayloadRule[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (!arePayloadParamEntriesEqual(a.params, b.params)) return false;
  }
  return true;
}

function arePayloadFilterRulesEqual(
  left: PayloadFilterRule[],
  right: PayloadFilterRule[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (a.params.length !== b.params.length) return false;
    for (let j = 0; j < a.params.length; j += 1) {
      if (a.params[j] !== b.params[j]) return false;
    }
  }
  return true;
}

function areCodexCustomModelsEqual(
  left: CodexCustomModelVisualEntry[],
  right: CodexCustomModelVisualEntry[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.displayName !== b.displayName) return false;
    if (a.groups.length !== b.groups.length) return false;
    for (let j = 0; j < a.groups.length; j += 1) {
      if (a.groups[j] !== b.groups[j]) return false;
    }
  }

  return true;
}

export function getCodexCustomModelValidationErrors(
  models: CodexCustomModelVisualEntry[]
): CodexCustomModelValidationErrors {
  const duplicateCount = new Map<string, number>();
  models.forEach((model) => {
    const key = model.id.trim().toLowerCase();
    if (!key) return;
    duplicateCount.set(key, (duplicateCount.get(key) ?? 0) + 1);
  });

  return models.reduce<CodexCustomModelValidationErrors>((result, model) => {
    const idKey = model.id.trim().toLowerCase();
    const groups = normalizeCodexCustomModelGroups(model.groups);
    const entryErrors: CodexCustomModelValidationErrors[string] = {};

    if (!idKey) {
      entryErrors.id = 'codex_custom_model_id_required';
    } else if ((duplicateCount.get(idKey) ?? 0) > 1) {
      entryErrors.id = 'codex_custom_model_id_duplicate';
    }

    if (groups.length === 0) {
      entryErrors.groups = 'codex_custom_model_groups_required';
    }

    if (entryErrors.id || entryErrors.groups) {
      result[model.clientId] = entryErrors;
    }

    return result;
  }, {});
}

function parsePayloadParamValue(raw: unknown): { valueType: PayloadParamValueType; value: string } {
  if (typeof raw === 'number') {
    return { valueType: 'number', value: String(raw) };
  }

  if (typeof raw === 'boolean') {
    return { valueType: 'boolean', value: String(raw) };
  }

  if (raw === null || typeof raw === 'object') {
    try {
      const json = JSON.stringify(raw, null, 2);
      return { valueType: 'json', value: json ?? 'null' };
    } catch {
      return { valueType: 'json', value: String(raw) };
    }
  }

  return { valueType: 'string', value: String(raw ?? '') };
}

function parseRawPayloadParamValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;

  try {
    const json = JSON.stringify(raw, null, 2);
    return json ?? '';
  } catch {
    return String(raw ?? '');
  }
}

function parsePayloadProtocol(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return raw.trim() ? raw : undefined;
}

function deleteLegacyApiKeysProvider(doc: YamlDocument): void {
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-key-entries'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-key-entries']);
  }
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-keys'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-keys']);
  }
  deleteIfMapEmpty(doc, ['auth', 'providers', 'config-api-key']);
  deleteIfMapEmpty(doc, ['auth', 'providers']);
  deleteIfMapEmpty(doc, ['auth']);
}

function parsePayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => {
          const parsedValue = parsePayloadParamValue(value);
          return {
            id: `param-${index}-${pIndex}`,
            path,
            valueType: parsedValue.valueType,
            value: parsedValue.value,
          };
        })
      : [];

    return { id: `payload-rule-${index}`, models, params };
  });
}

function parsePayloadFilterRules(rules: unknown): PayloadFilterRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `filter-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRaw = record.params;
    const params = Array.isArray(paramsRaw) ? paramsRaw.map(String) : [];

    return { id: `payload-filter-rule-${index}`, models, params };
  });
}

function parseRawPayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `raw-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => ({
          id: `raw-param-${index}-${pIndex}`,
          path,
          valueType: 'json' as const,
          value: parseRawPayloadParamValue(value),
        }))
      : [];

    return { id: `payload-raw-rule-${index}`, models, params };
  });
}

function serializePayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        let value: unknown = param.value;
        if (param.valueType === 'number') {
          const num = Number(param.value);
          value = Number.isFinite(num) ? num : param.value;
        } else if (param.valueType === 'boolean') {
          value = param.value === 'true';
        } else if (param.valueType === 'json') {
          try {
            value = JSON.parse(param.value);
          } catch {
            value = param.value;
          }
        }
        params[param.path.trim()] = value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializePayloadFilterRulesForYaml(
  rules: PayloadFilterRule[]
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params = (Array.isArray(rule.params) ? rule.params : [])
        .map((path) => String(path).trim())
        .filter(Boolean);

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializeRawPayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        params[param.path.trim()] = param.value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

type VisualConfigState = {
  visualValues: VisualConfigValues;
  baselineValues: VisualConfigValues;
  dirtyFields: Set<string>;
  visualParseError: string | null;
};

type VisualConfigAction =
  | {
      type: 'load_success';
      values: VisualConfigValues;
    }
  | {
      type: 'load_error';
      error: string;
    }
  | {
      type: 'set_values';
      values: Partial<VisualConfigValues>;
    };

function createInitialVisualConfigState(): VisualConfigState {
  const initialValues = deepClone(DEFAULT_VISUAL_VALUES);
  return {
    visualValues: initialValues,
    baselineValues: deepClone(initialValues),
    dirtyFields: new Set(),
    visualParseError: null,
  };
}

function mergeVisualConfigValues(
  currentValues: VisualConfigValues,
  patch: Partial<VisualConfigValues>
): VisualConfigValues {
  const nextValues: VisualConfigValues = { ...currentValues, ...patch } as VisualConfigValues;
  if (patch.authMaintenance) {
    nextValues.authMaintenance = { ...currentValues.authMaintenance, ...patch.authMaintenance };
  }
  if (patch.images) {
    nextValues.images = { ...currentValues.images, ...patch.images };
    if (patch.images.native) {
      nextValues.images.native = {
        ...currentValues.images.native,
        ...patch.images.native,
        generations: patch.images.native.generations
          ? { ...currentValues.images.native.generations, ...patch.images.native.generations }
          : currentValues.images.native.generations,
        edits: patch.images.native.edits
          ? { ...currentValues.images.native.edits, ...patch.images.native.edits }
          : currentValues.images.native.edits,
      };
    }
  }
  if (patch.streaming) {
    nextValues.streaming = { ...currentValues.streaming, ...patch.streaming };
  }
  if (patch.disabledImageGenerationToolError) {
    nextValues.disabledImageGenerationToolError = {
      ...currentValues.disabledImageGenerationToolError,
      ...patch.disabledImageGenerationToolError,
    };
  }
  return nextValues;
}

function getNextDirtyFields(
  currentDirtyFields: Set<string>,
  patch: Partial<VisualConfigValues>,
  nextValues: VisualConfigValues,
  baselineValues: VisualConfigValues
): Set<string> {
  const nextDirtyFields = new Set(currentDirtyFields);
  const updateDirty = (key: string, isEqual: boolean) => {
    if (isEqual) {
      nextDirtyFields.delete(key);
    } else {
      nextDirtyFields.add(key);
    }
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'host')) {
    updateDirty('host', nextValues.host === baselineValues.host);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'port')) {
    updateDirty('port', nextValues.port === baselineValues.port);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsEnable')) {
    updateDirty('tlsEnable', nextValues.tlsEnable === baselineValues.tlsEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsCert')) {
    updateDirty('tlsCert', nextValues.tlsCert === baselineValues.tlsCert);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsKey')) {
    updateDirty('tlsKey', nextValues.tlsKey === baselineValues.tlsKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmAllowRemote')) {
    updateDirty('rmAllowRemote', nextValues.rmAllowRemote === baselineValues.rmAllowRemote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmSecretKey')) {
    updateDirty('rmSecretKey', nextValues.rmSecretKey === baselineValues.rmSecretKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableControlPanel')) {
    updateDirty(
      'rmDisableControlPanel',
      nextValues.rmDisableControlPanel === baselineValues.rmDisableControlPanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmAccessPath')) {
    updateDirty('rmAccessPath', nextValues.rmAccessPath === baselineValues.rmAccessPath);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmPanelRepo')) {
    updateDirty('rmPanelRepo', nextValues.rmPanelRepo === baselineValues.rmPanelRepo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authDir')) {
    updateDirty('authDir', nextValues.authDir === baselineValues.authDir);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'apiKeysText')) {
    updateDirty('apiKeysText', nextValues.apiKeysText === baselineValues.apiKeysText);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexCustomModels')) {
    updateDirty(
      'codexCustomModels',
      areCodexCustomModelsEqual(nextValues.codexCustomModels, baselineValues.codexCustomModels)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'debug')) {
    updateDirty('debug', nextValues.debug === baselineValues.debug);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'commercialMode')) {
    updateDirty('commercialMode', nextValues.commercialMode === baselineValues.commercialMode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'loggingToFile')) {
    updateDirty('loggingToFile', nextValues.loggingToFile === baselineValues.loggingToFile);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'logsMaxTotalSizeMb')) {
    updateDirty(
      'logsMaxTotalSizeMb',
      nextValues.logsMaxTotalSizeMb === baselineValues.logsMaxTotalSizeMb
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsEnabled')) {
    updateDirty(
      'usageStatisticsEnabled',
      nextValues.usageStatisticsEnabled === baselineValues.usageStatisticsEnabled
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsPersistIntervalSeconds')) {
    updateDirty(
      'usageStatisticsPersistIntervalSeconds',
      nextValues.usageStatisticsPersistIntervalSeconds ===
        baselineValues.usageStatisticsPersistIntervalSeconds
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pprofEnable')) {
    updateDirty('pprofEnable', nextValues.pprofEnable === baselineValues.pprofEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pprofAddr')) {
    updateDirty('pprofAddr', nextValues.pprofAddr === baselineValues.pprofAddr);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'proxyUrl')) {
    updateDirty('proxyUrl', nextValues.proxyUrl === baselineValues.proxyUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'forceModelPrefix')) {
    updateDirty(
      'forceModelPrefix',
      nextValues.forceModelPrefix === baselineValues.forceModelPrefix
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexIdentityConfuse')) {
    updateDirty(
      'codexIdentityConfuse',
      nextValues.codexIdentityConfuse === baselineValues.codexIdentityConfuse
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexFingerprintJA3')) {
    updateDirty(
      'codexFingerprintJA3',
      nextValues.codexFingerprintJA3 === baselineValues.codexFingerprintJA3
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexFingerprintForceHTTP1')) {
    updateDirty(
      'codexFingerprintForceHTTP1',
      nextValues.codexFingerprintForceHTTP1 === baselineValues.codexFingerprintForceHTTP1
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexFingerprintImagesForceHTTP1')) {
    updateDirty(
      'codexFingerprintImagesForceHTTP1',
      nextValues.codexFingerprintImagesForceHTTP1 ===
        baselineValues.codexFingerprintImagesForceHTTP1
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexHeaderDefaultsUserAgent')) {
    updateDirty(
      'codexHeaderDefaultsUserAgent',
      nextValues.codexHeaderDefaultsUserAgent === baselineValues.codexHeaderDefaultsUserAgent
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexHeaderDefaultsBetaFeatures')) {
    updateDirty(
      'codexHeaderDefaultsBetaFeatures',
      nextValues.codexHeaderDefaultsBetaFeatures === baselineValues.codexHeaderDefaultsBetaFeatures
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexHeaderDefaultsOriginator')) {
    updateDirty(
      'codexHeaderDefaultsOriginator',
      nextValues.codexHeaderDefaultsOriginator === baselineValues.codexHeaderDefaultsOriginator
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebAutoRelogin')) {
    updateDirty(
      'chatgptWebAutoRelogin',
      nextValues.chatgptWebAutoRelogin === baselineValues.chatgptWebAutoRelogin
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebForceSessionRefreshOnImport')) {
    updateDirty(
      'chatgptWebForceSessionRefreshOnImport',
      nextValues.chatgptWebForceSessionRefreshOnImport ===
        baselineValues.chatgptWebForceSessionRefreshOnImport
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebAutoDeleteDeadAuths')) {
    updateDirty(
      'chatgptWebAutoDeleteDeadAuths',
      nextValues.chatgptWebAutoDeleteDeadAuths === baselineValues.chatgptWebAutoDeleteDeadAuths
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebAutoDeleteDeadPriorities')) {
    updateDirty(
      'chatgptWebAutoDeleteDeadPriorities',
      areStringArraysEqual(
        nextValues.chatgptWebAutoDeleteDeadPriorities,
        baselineValues.chatgptWebAutoDeleteDeadPriorities
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebImageUpstreamModel')) {
    updateDirty(
      'chatgptWebImageUpstreamModel',
      nextValues.chatgptWebImageUpstreamModel === baselineValues.chatgptWebImageUpstreamModel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebIgnoreUnsupportedImageParams')) {
    updateDirty(
      'chatgptWebIgnoreUnsupportedImageParams',
      nextValues.chatgptWebIgnoreUnsupportedImageParams ===
        baselineValues.chatgptWebIgnoreUnsupportedImageParams
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebAdaptSizeToAspectRatio')) {
    updateDirty(
      'chatgptWebAdaptSizeToAspectRatio',
      nextValues.chatgptWebAdaptSizeToAspectRatio ===
        baselineValues.chatgptWebAdaptSizeToAspectRatio
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebAspectRatioMaxErrorPercent')) {
    updateDirty(
      'chatgptWebAspectRatioMaxErrorPercent',
      nextValues.chatgptWebAspectRatioMaxErrorPercent ===
        baselineValues.chatgptWebAspectRatioMaxErrorPercent
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebResizeToRequestedSize')) {
    updateDirty(
      'chatgptWebResizeToRequestedSize',
      nextValues.chatgptWebResizeToRequestedSize ===
        baselineValues.chatgptWebResizeToRequestedSize
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebResizeFilter')) {
    updateDirty(
      'chatgptWebResizeFilter',
      nextValues.chatgptWebResizeFilter === baselineValues.chatgptWebResizeFilter
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebMaxResizeEdgePixels')) {
    updateDirty(
      'chatgptWebMaxResizeEdgePixels',
      nextValues.chatgptWebMaxResizeEdgePixels === baselineValues.chatgptWebMaxResizeEdgePixels
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'chatgptWebMaxImageResponseMegabytes')) {
    updateDirty(
      'chatgptWebMaxImageResponseMegabytes',
      nextValues.chatgptWebMaxImageResponseMegabytes ===
        baselineValues.chatgptWebMaxImageResponseMegabytes
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requestRetry')) {
    updateDirty('requestRetry', nextValues.requestRetry === baselineValues.requestRetry);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryCredentials')) {
    updateDirty(
      'maxRetryCredentials',
      nextValues.maxRetryCredentials === baselineValues.maxRetryCredentials
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryInterval')) {
    updateDirty(
      'maxRetryInterval',
      nextValues.maxRetryInterval === baselineValues.maxRetryInterval
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'noCooldownStatusCodes')) {
    updateDirty(
      'noCooldownStatusCodes',
      nextValues.noCooldownStatusCodes === baselineValues.noCooldownStatusCodes
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fixedErrorCooldowns')) {
    updateDirty(
      'fixedErrorCooldowns',
      areFixedErrorCooldownsEqual(
        nextValues.fixedErrorCooldowns,
        baselineValues.fixedErrorCooldowns
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'errorResponseRewrites')) {
    updateDirty(
      'errorResponseRewrites',
      areErrorResponseRewritesEqual(
        nextValues.errorResponseRewrites,
        baselineValues.errorResponseRewrites
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nonRetryableErrors')) {
    updateDirty(
      'nonRetryableErrors',
      areNonRetryableErrorsEqual(nextValues.nonRetryableErrors, baselineValues.nonRetryableErrors)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authModelExclusions')) {
    updateDirty(
      'authModelExclusions',
      areAuthModelExclusionsEqual(
        nextValues.authModelExclusions,
        baselineValues.authModelExclusions
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disabledImageGenerationToolFallback')) {
    updateDirty(
      'disabledImageGenerationToolFallback',
      nextValues.disabledImageGenerationToolFallback ===
        baselineValues.disabledImageGenerationToolFallback
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disabledImageGenerationToolAction')) {
    updateDirty(
      'disabledImageGenerationToolAction',
      nextValues.disabledImageGenerationToolAction ===
        baselineValues.disabledImageGenerationToolAction
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disabledImageGenerationToolError')) {
    updateDirty(
      'disabledImageGenerationToolError',
      areDisabledImageGenerationToolErrorsEqual(
        nextValues.disabledImageGenerationToolError,
        baselineValues.disabledImageGenerationToolError
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'wsAuth')) {
    updateDirty('wsAuth', nextValues.wsAuth === baselineValues.wsAuth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaAntigravityCredits')) {
    updateDirty(
      'quotaAntigravityCredits',
      nextValues.quotaAntigravityCredits === baselineValues.quotaAntigravityCredits
    );
  }
  if (patch.authMaintenance) {
    const authMaintenancePatch = patch.authMaintenance;
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'enable')) {
      updateDirty(
        'authMaintenance.enable',
        nextValues.authMaintenance.enable === baselineValues.authMaintenance.enable
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'scanIntervalSeconds')) {
      updateDirty(
        'authMaintenance.scanIntervalSeconds',
        nextValues.authMaintenance.scanIntervalSeconds ===
          baselineValues.authMaintenance.scanIntervalSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'deleteIntervalSeconds')) {
      updateDirty(
        'authMaintenance.deleteIntervalSeconds',
        nextValues.authMaintenance.deleteIntervalSeconds ===
          baselineValues.authMaintenance.deleteIntervalSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'deleteStatusCodes')) {
      updateDirty(
        'authMaintenance.deleteStatusCodes',
        nextValues.authMaintenance.deleteStatusCodes ===
          baselineValues.authMaintenance.deleteStatusCodes
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'deleteQuotaExceeded')) {
      updateDirty(
        'authMaintenance.deleteQuotaExceeded',
        nextValues.authMaintenance.deleteQuotaExceeded ===
          baselineValues.authMaintenance.deleteQuotaExceeded
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'quotaStrikeThreshold')) {
      updateDirty(
        'authMaintenance.quotaStrikeThreshold',
        nextValues.authMaintenance.quotaStrikeThreshold ===
          baselineValues.authMaintenance.quotaStrikeThreshold
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'disableQuotaExceeded')) {
      updateDirty(
        'authMaintenance.disableQuotaExceeded',
        nextValues.authMaintenance.disableQuotaExceeded ===
          baselineValues.authMaintenance.disableQuotaExceeded
      );
    }
    if (Object.prototype.hasOwnProperty.call(authMaintenancePatch, 'disableQuotaStrikeThreshold')) {
      updateDirty(
        'authMaintenance.disableQuotaStrikeThreshold',
        nextValues.authMaintenance.disableQuotaStrikeThreshold ===
          baselineValues.authMaintenance.disableQuotaStrikeThreshold
      );
    }
  }
  if (patch.images) {
    const imagesPatch = patch.images;
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'codexModel')) {
      updateDirty(
        'images.codexModel',
        nextValues.images.codexModel === baselineValues.images.codexModel
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'imageModel')) {
      updateDirty(
        'images.imageModel',
        nextValues.images.imageModel === baselineValues.images.imageModel
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'enableFreePlanImageModel')) {
      updateDirty(
        'images.enableFreePlanImageModel',
        nextValues.images.enableFreePlanImageModel ===
          baselineValues.images.enableFreePlanImageModel
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'enableNAggregation')) {
      updateDirty(
        'images.enableNAggregation',
        nextValues.images.enableNAggregation === baselineValues.images.enableNAggregation
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'enableStreamFlush')) {
      updateDirty(
        'images.enableStreamFlush',
        nextValues.images.enableStreamFlush === baselineValues.images.enableStreamFlush
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'overrideResponseFormatUrl')) {
      updateDirty(
        'images.overrideResponseFormatUrl',
        nextValues.images.overrideResponseFormatUrl ===
          baselineValues.images.overrideResponseFormatUrl
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'responseFormatUrlDataUrl')) {
      updateDirty(
        'images.responseFormatUrlDataUrl',
        nextValues.images.responseFormatUrlDataUrl ===
          baselineValues.images.responseFormatUrlDataUrl
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'overrideTransparentBackground')) {
      updateDirty(
        'images.overrideTransparentBackground',
        nextValues.images.overrideTransparentBackground ===
          baselineValues.images.overrideTransparentBackground
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'overrideInputFidelity')) {
      updateDirty(
        'images.overrideInputFidelity',
        nextValues.images.overrideInputFidelity === baselineValues.images.overrideInputFidelity
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'unsupportedStatusCode')) {
      updateDirty(
        'images.unsupportedStatusCode',
        nextValues.images.unsupportedStatusCode === baselineValues.images.unsupportedStatusCode
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'streamFlushIntervalMs')) {
      updateDirty(
        'images.streamFlushIntervalMs',
        nextValues.images.streamFlushIntervalMs === baselineValues.images.streamFlushIntervalMs
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'streamFlushMinBytes')) {
      updateDirty(
        'images.streamFlushMinBytes',
        nextValues.images.streamFlushMinBytes === baselineValues.images.streamFlushMinBytes
      );
    }
    if (Object.prototype.hasOwnProperty.call(imagesPatch, 'native')) {
      updateDirty(
        'images.native',
        areNativeImagesEqual(nextValues.images.native, baselineValues.images.native)
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingStrategy')) {
    updateDirty('routingStrategy', nextValues.routingStrategy === baselineValues.routingStrategy);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingFillFirstRange')) {
    updateDirty(
      'routingFillFirstRange',
      nextValues.routingFillFirstRange === baselineValues.routingFillFirstRange
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingFillFirstPerAuthRpm')) {
    updateDirty(
      'routingFillFirstPerAuthRpm',
      nextValues.routingFillFirstPerAuthRpm === baselineValues.routingFillFirstPerAuthRpm
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingPerAuthRequestLimit')) {
    updateDirty(
      'routingPerAuthRequestLimit',
      nextValues.routingPerAuthRequestLimit === baselineValues.routingPerAuthRequestLimit
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingPerAuthRequestWindowMinutes')) {
    updateDirty(
      'routingPerAuthRequestWindowMinutes',
      nextValues.routingPerAuthRequestWindowMinutes ===
        baselineValues.routingPerAuthRequestWindowMinutes
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingPriorityOverrides')) {
    updateDirty(
      'routingPriorityOverrides',
      areRoutingPriorityOverridesEqual(
        nextValues.routingPriorityOverrides,
        baselineValues.routingPriorityOverrides
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinity')) {
    updateDirty(
      'routingSessionAffinity',
      nextValues.routingSessionAffinity === baselineValues.routingSessionAffinity
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinityFailover')) {
    updateDirty(
      'routingSessionAffinityFailover',
      nextValues.routingSessionAffinityFailover === baselineValues.routingSessionAffinityFailover
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinityTTL')) {
    updateDirty(
      'routingSessionAffinityTTL',
      nextValues.routingSessionAffinityTTL === baselineValues.routingSessionAffinityTTL
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRules')) {
    updateDirty(
      'payloadDefaultRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRules, baselineValues.payloadDefaultRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRawRules')) {
    updateDirty(
      'payloadDefaultRawRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRawRules, baselineValues.payloadDefaultRawRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRules')) {
    updateDirty(
      'payloadOverrideRules',
      arePayloadRulesEqual(nextValues.payloadOverrideRules, baselineValues.payloadOverrideRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRawRules')) {
    updateDirty(
      'payloadOverrideRawRules',
      arePayloadRulesEqual(
        nextValues.payloadOverrideRawRules,
        baselineValues.payloadOverrideRawRules
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadFilterRules')) {
    updateDirty(
      'payloadFilterRules',
      arePayloadFilterRulesEqual(nextValues.payloadFilterRules, baselineValues.payloadFilterRules)
    );
  }
  if (patch.streaming) {
    const streamingPatch = patch.streaming;
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'keepaliveSeconds')) {
      updateDirty(
        'streaming.keepaliveSeconds',
        nextValues.streaming.keepaliveSeconds === baselineValues.streaming.keepaliveSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'bootstrapRetries')) {
      updateDirty(
        'streaming.bootstrapRetries',
        nextValues.streaming.bootstrapRetries === baselineValues.streaming.bootstrapRetries
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'enableStreamFlush')) {
      updateDirty(
        'streaming.enableStreamFlush',
        nextValues.streaming.enableStreamFlush === baselineValues.streaming.enableStreamFlush
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'streamFlushIntervalMs')) {
      updateDirty(
        'streaming.streamFlushIntervalMs',
        nextValues.streaming.streamFlushIntervalMs ===
          baselineValues.streaming.streamFlushIntervalMs
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'streamFlushMinBytes')) {
      updateDirty(
        'streaming.streamFlushMinBytes',
        nextValues.streaming.streamFlushMinBytes === baselineValues.streaming.streamFlushMinBytes
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'trustUpstreamSSE')) {
      updateDirty(
        'streaming.trustUpstreamSSE',
        nextValues.streaming.trustUpstreamSSE === baselineValues.streaming.trustUpstreamSSE
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'nonstreamKeepaliveInterval')) {
      updateDirty(
        'streaming.nonstreamKeepaliveInterval',
        nextValues.streaming.nonstreamKeepaliveInterval ===
          baselineValues.streaming.nonstreamKeepaliveInterval
      );
    }
  }

  return nextDirtyFields;
}

function visualConfigReducer(
  state: VisualConfigState,
  action: VisualConfigAction
): VisualConfigState {
  switch (action.type) {
    case 'load_success':
      return {
        visualValues: action.values,
        baselineValues: deepClone(action.values),
        dirtyFields: new Set(),
        visualParseError: null,
      };
    case 'load_error':
      return {
        ...state,
        visualParseError: action.error,
      };
    case 'set_values': {
      const nextValues = mergeVisualConfigValues(state.visualValues, action.values);
      const nextDirtyFields = getNextDirtyFields(
        state.dirtyFields,
        action.values,
        nextValues,
        state.baselineValues
      );

      return {
        ...state,
        visualValues: nextValues,
        dirtyFields: nextDirtyFields,
      };
    }
    default:
      return state;
  }
}

export function useVisualConfig() {
  const [state, dispatch] = useReducer(
    visualConfigReducer,
    undefined,
    createInitialVisualConfigState
  );
  const { visualValues, baselineValues, visualParseError } = state;
  const visualDirty = state.dirtyFields.size > 0;
  const visualValidationErrors = useMemo(
    () => getVisualConfigValidationErrors(visualValues),
    [visualValues]
  );
  const visualCodexCustomModelValidationErrors = useMemo(
    () => getCodexCustomModelValidationErrors(visualValues.codexCustomModels),
    [visualValues.codexCustomModels]
  );
  const visualHasCodexCustomModelValidationErrors = useMemo(
    () =>
      Object.values(visualCodexCustomModelValidationErrors).some((entry) =>
        Boolean(entry.id || entry.groups)
      ),
    [visualCodexCustomModelValidationErrors]
  );
  const visualHasPayloadValidationErrors = useMemo(
    () =>
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRawRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRawRules),
    [
      visualValues.payloadDefaultRules,
      visualValues.payloadDefaultRawRules,
      visualValues.payloadOverrideRules,
      visualValues.payloadOverrideRawRules,
    ]
  );

  const loadVisualValuesFromYaml = useCallback((yamlContent: string) => {
    try {
      const document = parseDocument(yamlContent);
      if (document.errors.length > 0) {
        throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
      }

      const parsedRaw: unknown = parseYaml(yamlContent) || {};
      const preciseParsedRaw: unknown = parseYaml(yamlContent, { intAsBigInt: true }) || {};
      const parsed = asRecord(parsedRaw) ?? {};
      const preciseParsed = asRecord(preciseParsedRaw) ?? parsed;
      const tls = asRecord(parsed.tls);
      const remoteManagement = asRecord(parsed['remote-management']);
      const codex = asRecord(parsed.codex);
      const codexFingerprint = asRecord(parsed['codex-fingerprint'] ?? parsed.codexFingerprint);
      const codexHeaderDefaults = asRecord(
        parsed['codex-header-defaults'] ?? parsed.codexHeaderDefaults
      );
      const chatgptWeb = asRecord(parsed['chatgpt-web'] ?? parsed.chatgptWeb);
      const chatgptWebAutoDeleteDeadPrioritiesRaw =
        chatgptWeb &&
        Object.prototype.hasOwnProperty.call(chatgptWeb, 'auto-delete-dead-priorities')
          ? chatgptWeb['auto-delete-dead-priorities']
          : chatgptWeb?.autoDeleteDeadPriorities;
      const quotaExceeded = asRecord(parsed['quota-exceeded']);
      const authMaintenance = asRecord(parsed['auth-maintenance']);
      const images = asRecord(parsed.images);
      const imagesChatGPTWeb = asRecord(images?.['chatgpt-web'] ?? images?.chatgptWeb);
      const pprof = asRecord(parsed.pprof);
      const routing = asRecord(parsed.routing);
      const payload = asRecord(parsed.payload);
      const streaming = asRecord(parsed.streaming);
      const legacyImagesOverrideUnsupportedParams = Boolean(
        images?.['override-unsupported-params'] ?? images?.overrideUnsupportedParams
      );
      const imagesOverrideResponseFormatUrl =
        images?.['override-response-format-url'] === undefined &&
        images?.overrideResponseFormatUrl === undefined &&
        images?.overrideResponseFormatURL === undefined
          ? legacyImagesOverrideUnsupportedParams
          : Boolean(
              images?.['override-response-format-url'] ??
              images?.overrideResponseFormatUrl ??
              images?.overrideResponseFormatURL
            );
      const imagesResponseFormatUrlDataUrl =
        images?.['response-format-url-data-url'] === undefined &&
        images?.responseFormatUrlDataUrl === undefined &&
        images?.responseFormatURLDataURL === undefined
          ? DEFAULT_VISUAL_VALUES.images.responseFormatUrlDataUrl
          : Boolean(
              images?.['response-format-url-data-url'] ??
              images?.responseFormatUrlDataUrl ??
              images?.responseFormatURLDataURL
            );
      const imagesOverrideTransparentBackground =
        images?.['override-transparent-background'] === undefined &&
        images?.overrideTransparentBackground === undefined
          ? legacyImagesOverrideUnsupportedParams
          : Boolean(
              images?.['override-transparent-background'] ?? images?.overrideTransparentBackground
            );
      const imagesOverrideInputFidelity =
        images?.['override-input-fidelity'] === undefined &&
        images?.overrideInputFidelity === undefined
          ? legacyImagesOverrideUnsupportedParams
          : Boolean(images?.['override-input-fidelity'] ?? images?.overrideInputFidelity);
      const imagesEnableFreePlanImageModel =
        images?.['enable-free-plan-image-model'] === undefined &&
        images?.enableFreePlanImageModel === undefined
          ? DEFAULT_VISUAL_VALUES.images.enableFreePlanImageModel
          : Boolean(images?.['enable-free-plan-image-model'] ?? images?.enableFreePlanImageModel);
      const imagesEnableStreamFlush =
        images?.['enable-stream-flush'] === undefined && images?.enableStreamFlush === undefined
          ? DEFAULT_VISUAL_VALUES.images.enableStreamFlush
          : Boolean(images?.['enable-stream-flush'] ?? images?.enableStreamFlush);
      const routingSessionAffinityFailoverRaw =
        routing?.['session-affinity-failover'] ??
        routing?.sessionAffinityFailover ??
        routing?.['sessionAffinityFailover'];
      const codexFingerprintJA3 = Boolean(codexFingerprint?.ja3 ?? codexFingerprint?.JA3);
      const codexFingerprintForceHTTP1 = codexFingerprintJA3
        ? false
        : Boolean(
            codexFingerprint?.['force-http1'] ??
            codexFingerprint?.forceHTTP1 ??
            codexFingerprint?.forceHttp1
          );
      const codexFingerprintImagesForceHTTP1 = codexFingerprintJA3
        ? false
        : Boolean(
            codexFingerprint?.['images-force-http1'] ??
            codexFingerprint?.imagesForceHTTP1 ??
            codexFingerprint?.imagesForceHttp1
          );

      const newValues: VisualConfigValues = {
        host: typeof parsed.host === 'string' ? parsed.host : '',
        port: String(parsed.port ?? ''),

        tlsEnable: Boolean(tls?.enable),
        tlsCert: typeof tls?.cert === 'string' ? tls.cert : '',
        tlsKey: typeof tls?.key === 'string' ? tls.key : '',

        rmAllowRemote: Boolean(remoteManagement?.['allow-remote']),
        rmSecretKey:
          typeof remoteManagement?.['secret-key'] === 'string'
            ? remoteManagement['secret-key']
            : '',
        rmDisableControlPanel: Boolean(remoteManagement?.['disable-control-panel']),
        rmAccessPath:
          typeof remoteManagement?.['access-path'] === 'string'
            ? remoteManagement['access-path']
            : typeof remoteManagement?.accessPath === 'string'
              ? remoteManagement.accessPath
              : '',
        rmPanelRepo:
          typeof remoteManagement?.['panel-github-repository'] === 'string'
            ? remoteManagement['panel-github-repository']
            : typeof remoteManagement?.['panel-repo'] === 'string'
              ? remoteManagement['panel-repo']
              : '',

        authDir: typeof parsed['auth-dir'] === 'string' ? parsed['auth-dir'] : '',
        apiKeysText: resolveApiKeysText(parsed),
        codexCustomModels: parseCodexCustomModels(
          parsed['codex-custom-models'] ?? parsed.codexCustomModels
        ),

        debug: Boolean(parsed.debug),
        commercialMode: Boolean(parsed['commercial-mode']),
        loggingToFile: Boolean(parsed['logging-to-file']),
        logsMaxTotalSizeMb: String(parsed['logs-max-total-size-mb'] ?? ''),
        usageStatisticsEnabled: Boolean(parsed['usage-statistics-enabled']),
        usageStatisticsPersistIntervalSeconds: String(
          parsed['usage-statistics-persist-interval-seconds'] ?? ''
        ),
        pprofEnable: Boolean(pprof?.enable),
        pprofAddr: typeof pprof?.addr === 'string' ? pprof.addr : '',

        proxyUrl: typeof parsed['proxy-url'] === 'string' ? parsed['proxy-url'] : '',
        forceModelPrefix: Boolean(parsed['force-model-prefix']),
        codexIdentityConfuse: Boolean(codex?.['identity-confuse'] ?? codex?.identityConfuse),
        codexFingerprintJA3,
        codexFingerprintForceHTTP1,
        codexFingerprintImagesForceHTTP1,
        codexHeaderDefaultsUserAgent:
          typeof codexHeaderDefaults?.['user-agent'] === 'string'
            ? codexHeaderDefaults['user-agent']
            : typeof codexHeaderDefaults?.userAgent === 'string'
              ? codexHeaderDefaults.userAgent
              : '',
        codexHeaderDefaultsBetaFeatures:
          typeof codexHeaderDefaults?.['beta-features'] === 'string'
            ? codexHeaderDefaults['beta-features']
            : typeof codexHeaderDefaults?.betaFeatures === 'string'
              ? codexHeaderDefaults.betaFeatures
              : '',
        codexHeaderDefaultsOriginator:
          typeof codexHeaderDefaults?.originator === 'string' ? codexHeaderDefaults.originator : '',
        chatgptWebAutoRelogin: Boolean(chatgptWeb?.['auto-relogin'] ?? chatgptWeb?.autoRelogin),
        chatgptWebForceSessionRefreshOnImport:
          (chatgptWeb?.['force-session-refresh-on-import'] ??
            chatgptWeb?.forceSessionRefreshOnImport) !== false,
        chatgptWebAutoDeleteDeadAuths: parseBooleanValue(
          chatgptWeb?.['auto-delete-dead-auths'] ?? chatgptWeb?.autoDeleteDeadAuths
        ),
        chatgptWebAutoDeleteDeadPriorities: parseIntegerStringList(
          chatgptWebAutoDeleteDeadPrioritiesRaw
        ),
        chatgptWebImageUpstreamModel:
          typeof imagesChatGPTWeb?.['upstream-model'] === 'string'
            ? imagesChatGPTWeb['upstream-model']
            : typeof imagesChatGPTWeb?.upstreamModel === 'string'
              ? imagesChatGPTWeb.upstreamModel
              : DEFAULT_VISUAL_VALUES.chatgptWebImageUpstreamModel,
        chatgptWebIgnoreUnsupportedImageParams: Boolean(
          imagesChatGPTWeb?.['ignore-unsupported-params'] ??
          imagesChatGPTWeb?.ignoreUnsupportedParams
        ),
        chatgptWebAdaptSizeToAspectRatio: parseBooleanValue(
          imagesChatGPTWeb?.['adapt-size-to-aspect-ratio'] ??
          imagesChatGPTWeb?.adaptSizeToAspectRatio
        ),
        chatgptWebAspectRatioMaxErrorPercent: String(
          imagesChatGPTWeb?.['aspect-ratio-max-error-percent'] ??
            imagesChatGPTWeb?.aspectRatioMaxErrorPercent ??
            DEFAULT_VISUAL_VALUES.chatgptWebAspectRatioMaxErrorPercent
        ),
        chatgptWebResizeToRequestedSize: parseBooleanValue(
          imagesChatGPTWeb?.['resize-to-requested-size'] ??
          imagesChatGPTWeb?.resizeToRequestedSize
        ),
        chatgptWebResizeFilter: String(
          imagesChatGPTWeb?.['resize-filter'] ??
            imagesChatGPTWeb?.resizeFilter ??
            DEFAULT_VISUAL_VALUES.chatgptWebResizeFilter
        ),
        chatgptWebMaxResizeEdgePixels: String(
          imagesChatGPTWeb?.['max-resize-edge-pixels'] ??
            imagesChatGPTWeb?.maxResizeEdgePixels ??
            DEFAULT_VISUAL_VALUES.chatgptWebMaxResizeEdgePixels
        ),
        chatgptWebMaxImageResponseMegabytes: String(
          imagesChatGPTWeb?.['max-image-response-megabytes'] ??
            imagesChatGPTWeb?.maxImageResponseMegabytes ??
            DEFAULT_VISUAL_VALUES.chatgptWebMaxImageResponseMegabytes
        ),
        requestRetry: String(parsed['request-retry'] ?? ''),
        maxRetryCredentials: String(parsed['max-retry-credentials'] ?? ''),
        maxRetryInterval: String(parsed['max-retry-interval'] ?? ''),
        noCooldownStatusCodes:
          parsed['no-cooldown-status-codes'] === undefined
            ? DEFAULT_VISUAL_VALUES.noCooldownStatusCodes
            : parseIntegerList(parsed['no-cooldown-status-codes']),
        fixedErrorCooldowns: parseFixedErrorCooldowns(
          parsed['fixed-error-cooldowns'] ?? parsed.fixedErrorCooldowns
        ),
        errorResponseRewrites: parseErrorResponseRewrites(
          preciseParsed['error-response-rewrites'] ?? preciseParsed.errorResponseRewrites
        ),
        nonRetryableErrors: Object.prototype.hasOwnProperty.call(parsed, 'non-retryable-errors')
          ? parseNonRetryableErrors(parsed['non-retryable-errors'])
          : Object.prototype.hasOwnProperty.call(parsed, 'nonRetryableErrors')
            ? parseNonRetryableErrors(parsed.nonRetryableErrors)
            : DEFAULT_VISUAL_VALUES.nonRetryableErrors.map((rule) => ({ ...rule })),
        authModelExclusions: parseAuthModelExclusions(
          parsed['auth-model-exclusions'] ?? parsed.authModelExclusions
        ),
        disabledImageGenerationToolFallback: parseBooleanValue(
          parsed['disabled-image-generation-tool-fallback'] ??
            parsed.disabledImageGenerationToolFallback
        ),
        disabledImageGenerationToolAction: parseDisabledImageGenerationToolAction(
          parsed['disabled-image-generation-tool-action'] ??
            parsed.disabledImageGenerationToolAction
        ),
        disabledImageGenerationToolError: parseDisabledImageGenerationToolError(
          parsed['disabled-image-generation-tool-error'] ?? parsed.disabledImageGenerationToolError
        ),
        wsAuth: Boolean(parsed['ws-auth']),

        quotaAntigravityCredits: Boolean(quotaExceeded?.['antigravity-credits'] ?? true),

        authMaintenance: {
          enable: Boolean(authMaintenance?.enable),
          scanIntervalSeconds:
            authMaintenance?.['scan-interval-seconds'] === undefined
              ? DEFAULT_VISUAL_VALUES.authMaintenance.scanIntervalSeconds
              : String(authMaintenance['scan-interval-seconds'] ?? ''),
          deleteIntervalSeconds:
            authMaintenance?.['delete-interval-seconds'] === undefined
              ? DEFAULT_VISUAL_VALUES.authMaintenance.deleteIntervalSeconds
              : String(authMaintenance['delete-interval-seconds'] ?? ''),
          deleteStatusCodes:
            authMaintenance?.['delete-status-codes'] === undefined
              ? DEFAULT_VISUAL_VALUES.authMaintenance.deleteStatusCodes
              : parseIntegerList(authMaintenance['delete-status-codes']),
          deleteQuotaExceeded: Boolean(authMaintenance?.['delete-quota-exceeded']),
          quotaStrikeThreshold:
            authMaintenance?.['quota-strike-threshold'] === undefined
              ? DEFAULT_VISUAL_VALUES.authMaintenance.quotaStrikeThreshold
              : String(authMaintenance['quota-strike-threshold'] ?? ''),
          disableQuotaExceeded: Boolean(authMaintenance?.['disable-quota-exceeded']),
          disableQuotaStrikeThreshold:
            authMaintenance?.['disable-quota-strike-threshold'] === undefined
              ? DEFAULT_VISUAL_VALUES.authMaintenance.disableQuotaStrikeThreshold
              : String(authMaintenance['disable-quota-strike-threshold'] ?? ''),
        },

        images: {
          codexModel:
            typeof images?.['codex-model'] === 'string'
              ? images['codex-model']
              : typeof images?.codexModel === 'string'
                ? images.codexModel
                : DEFAULT_VISUAL_VALUES.images.codexModel,
          imageModel:
            typeof images?.['image-model'] === 'string'
              ? images['image-model']
              : typeof images?.imageModel === 'string'
                ? images.imageModel
                : DEFAULT_VISUAL_VALUES.images.imageModel,
          enableFreePlanImageModel: imagesEnableFreePlanImageModel,
          enableNAggregation:
            images?.['enable-n-aggregation'] === undefined &&
            images?.enableNAggregation === undefined
              ? DEFAULT_VISUAL_VALUES.images.enableNAggregation
              : Boolean(images?.['enable-n-aggregation'] ?? images?.enableNAggregation),
          enableStreamFlush: imagesEnableStreamFlush,
          overrideResponseFormatUrl: imagesOverrideResponseFormatUrl,
          responseFormatUrlDataUrl: imagesResponseFormatUrlDataUrl,
          overrideTransparentBackground: imagesOverrideTransparentBackground,
          overrideInputFidelity: imagesOverrideInputFidelity,
          unsupportedStatusCode:
            images?.['unsupported-status-code'] === undefined &&
            images?.unsupportedStatusCode === undefined
              ? DEFAULT_VISUAL_VALUES.images.unsupportedStatusCode
              : String(images?.['unsupported-status-code'] ?? images?.unsupportedStatusCode ?? ''),
          streamFlushIntervalMs:
            images?.['stream-flush-interval-ms'] === undefined &&
            images?.streamFlushIntervalMs === undefined &&
            images?.streamFlushIntervalMS === undefined
              ? DEFAULT_VISUAL_VALUES.images.streamFlushIntervalMs
              : String(
                  images?.['stream-flush-interval-ms'] ??
                    images?.streamFlushIntervalMs ??
                    images?.streamFlushIntervalMS ??
                    ''
                ),
          streamFlushMinBytes:
            images?.['stream-flush-min-bytes'] === undefined &&
            images?.streamFlushMinBytes === undefined
              ? DEFAULT_VISUAL_VALUES.images.streamFlushMinBytes
              : String(images?.['stream-flush-min-bytes'] ?? images?.streamFlushMinBytes ?? ''),
          native: parseNativeImagesConfig(images?.native),
        },

        routingStrategy:
          routing?.strategy === 'fill-first'
            ? 'fill-first'
            : routing?.strategy === 'random'
              ? 'random'
              : 'round-robin',
        routingFillFirstRange: String(
          routing?.['fill-first-range'] ??
            routing?.fillFirstRange ??
            DEFAULT_VISUAL_VALUES.routingFillFirstRange
        ),
        routingFillFirstPerAuthRpm: String(
          routing?.['fill-first-per-auth-rpm'] ??
            routing?.fillFirstPerAuthRpm ??
            DEFAULT_VISUAL_VALUES.routingFillFirstPerAuthRpm
        ),
        routingPerAuthRequestLimit: String(
          routing?.['per-auth-request-limit'] ??
            routing?.perAuthRequestLimit ??
            DEFAULT_VISUAL_VALUES.routingPerAuthRequestLimit
        ),
        routingPerAuthRequestWindowMinutes: String(
          routing?.['per-auth-request-window-minutes'] ??
            routing?.perAuthRequestWindowMinutes ??
            DEFAULT_VISUAL_VALUES.routingPerAuthRequestWindowMinutes
        ),
        routingPriorityOverrides: parseRoutingPriorityOverrides(
          routing?.['priority-overrides'] ?? routing?.priorityOverrides
        ),
        routingSessionAffinity: Boolean(
          routing?.['session-affinity'] ?? routing?.sessionAffinity ?? routing?.['sessionAffinity']
        ),
        routingSessionAffinityFailover:
          routingSessionAffinityFailoverRaw === undefined ||
          routingSessionAffinityFailoverRaw === null
            ? DEFAULT_VISUAL_VALUES.routingSessionAffinityFailover
            : Boolean(routingSessionAffinityFailoverRaw),
        routingSessionAffinityTTL:
          typeof routing?.['session-affinity-ttl'] === 'string'
            ? routing['session-affinity-ttl']
            : typeof routing?.sessionAffinityTTL === 'string'
              ? routing.sessionAffinityTTL
              : typeof routing?.['sessionAffinityTTL'] === 'string'
                ? routing['sessionAffinityTTL']
                : '',

        payloadDefaultRules: parsePayloadRules(payload?.default),
        payloadDefaultRawRules: parseRawPayloadRules(payload?.['default-raw']),
        payloadOverrideRules: parsePayloadRules(payload?.override),
        payloadOverrideRawRules: parseRawPayloadRules(payload?.['override-raw']),
        payloadFilterRules: parsePayloadFilterRules(payload?.filter),

        streaming: {
          keepaliveSeconds: String(streaming?.['keepalive-seconds'] ?? ''),
          bootstrapRetries: String(streaming?.['bootstrap-retries'] ?? ''),
          enableStreamFlush: Boolean(
            streaming?.['enable-stream-flush'] ?? streaming?.enableStreamFlush
          ),
          streamFlushIntervalMs:
            streaming?.['stream-flush-interval-ms'] === undefined &&
            streaming?.streamFlushIntervalMs === undefined &&
            streaming?.streamFlushIntervalMS === undefined
              ? DEFAULT_VISUAL_VALUES.streaming.streamFlushIntervalMs
              : String(
                  streaming?.['stream-flush-interval-ms'] ??
                    streaming?.streamFlushIntervalMs ??
                    streaming?.streamFlushIntervalMS ??
                    ''
                ),
          streamFlushMinBytes:
            streaming?.['stream-flush-min-bytes'] === undefined &&
            streaming?.streamFlushMinBytes === undefined
              ? DEFAULT_VISUAL_VALUES.streaming.streamFlushMinBytes
              : String(
                  streaming?.['stream-flush-min-bytes'] ?? streaming?.streamFlushMinBytes ?? ''
                ),
          trustUpstreamSSE: Boolean(
            streaming?.['trust-upstream-sse'] ??
            streaming?.trustUpstreamSSE ??
            streaming?.trustUpstreamSse
          ),
          nonstreamKeepaliveInterval: String(parsed['nonstream-keepalive-interval'] ?? ''),
        },
      };

      dispatch({ type: 'load_success', values: newValues });
      return { ok: true as const };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid YAML';
      dispatch({ type: 'load_error', error: message });
      return { ok: false as const, error: message };
    }
  }, []);

  const applyVisualChangesToYaml = useCallback(
    (currentYaml: string): string => {
      try {
        const doc = parseDocument(currentYaml);
        if (doc.errors.length > 0) return currentYaml;
        if (!isMap(doc.contents)) {
          doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
        }
        const values = visualValues;

        setStringInDoc(doc, ['host'], values.host);
        setIntFromStringInDoc(doc, ['port'], values.port);

        if (
          docHas(doc, ['tls']) ||
          values.tlsEnable ||
          values.tlsCert.trim() ||
          values.tlsKey.trim()
        ) {
          ensureMapInDoc(doc, ['tls']);
          setBooleanInDoc(doc, ['tls', 'enable'], values.tlsEnable);
          setStringInDoc(doc, ['tls', 'cert'], values.tlsCert);
          setStringInDoc(doc, ['tls', 'key'], values.tlsKey);
          deleteIfMapEmpty(doc, ['tls']);
        }

        if (
          docHas(doc, ['remote-management']) ||
          values.rmAllowRemote ||
          values.rmSecretKey.trim() ||
          values.rmDisableControlPanel ||
          values.rmAccessPath.trim() ||
          values.rmPanelRepo.trim()
        ) {
          ensureMapInDoc(doc, ['remote-management']);
          setBooleanInDoc(doc, ['remote-management', 'allow-remote'], values.rmAllowRemote);
          setStringInDoc(doc, ['remote-management', 'secret-key'], values.rmSecretKey);
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-control-panel'],
            values.rmDisableControlPanel
          );
          setStringInDoc(doc, ['remote-management', 'access-path'], values.rmAccessPath);
          setStringInDoc(doc, ['remote-management', 'panel-github-repository'], values.rmPanelRepo);
          if (docHas(doc, ['remote-management', 'panel-repo'])) {
            doc.deleteIn(['remote-management', 'panel-repo']);
          }
          deleteIfMapEmpty(doc, ['remote-management']);
        }

        setStringInDoc(doc, ['auth-dir'], values.authDir);
        const apiKeys = splitApiKeysText(values.apiKeysText);
        if (apiKeys.length > 0) {
          doc.setIn(['api-keys'], apiKeys);
        } else if (docHas(doc, ['api-keys'])) {
          doc.deleteIn(['api-keys']);
        }
        if (values.apiKeysText !== baselineValues.apiKeysText) {
          syncApiKeyGroupsInDoc(
            doc,
            currentYaml,
            splitApiKeysText(baselineValues.apiKeysText),
            apiKeys
          );
        }
        deleteLegacyApiKeysProvider(doc);

        if (
          docHas(doc, ['codex-custom-models']) ||
          docHas(doc, ['codexCustomModels']) ||
          values.codexCustomModels.length > 0
        ) {
          if (values.codexCustomModels.length > 0) {
            doc.setIn(
              ['codex-custom-models'],
              serializeCodexCustomModelsForYaml(values.codexCustomModels)
            );
          } else if (docHas(doc, ['codex-custom-models'])) {
            doc.deleteIn(['codex-custom-models']);
          }

          if (docHas(doc, ['codexCustomModels'])) {
            doc.deleteIn(['codexCustomModels']);
          }
        }

        setBooleanInDoc(doc, ['debug'], values.debug);

        setBooleanInDoc(doc, ['commercial-mode'], values.commercialMode);
        setBooleanInDoc(doc, ['logging-to-file'], values.loggingToFile);
        setIntFromStringInDoc(doc, ['logs-max-total-size-mb'], values.logsMaxTotalSizeMb);
        setBooleanInDoc(doc, ['usage-statistics-enabled'], values.usageStatisticsEnabled);
        if (
          docHas(doc, ['usage-statistics-persist-interval-seconds']) ||
          values.usageStatisticsPersistIntervalSeconds.trim()
        ) {
          setIntFromStringInDoc(
            doc,
            ['usage-statistics-persist-interval-seconds'],
            values.usageStatisticsPersistIntervalSeconds
          );
        }
        if (docHas(doc, ['pprof']) || values.pprofEnable || values.pprofAddr.trim()) {
          ensureMapInDoc(doc, ['pprof']);
          doc.setIn(['pprof', 'enable'], values.pprofEnable);
          setStringInDoc(doc, ['pprof', 'addr'], values.pprofAddr);
          deleteIfMapEmpty(doc, ['pprof']);
        }

        setStringInDoc(doc, ['proxy-url'], values.proxyUrl);
        setBooleanInDoc(doc, ['force-model-prefix'], values.forceModelPrefix);
        setIntFromStringInDoc(doc, ['request-retry'], values.requestRetry);
        setIntFromStringInDoc(doc, ['max-retry-credentials'], values.maxRetryCredentials);
        setIntFromStringInDoc(doc, ['max-retry-interval'], values.maxRetryInterval);
        if (docHas(doc, ['codex']) || values.codexIdentityConfuse) {
          ensureMapInDoc(doc, ['codex']);
          doc.setIn(['codex', 'identity-confuse'], values.codexIdentityConfuse);
          deleteIfMapEmpty(doc, ['codex']);
        }
        if (
          docHas(doc, ['codex-fingerprint']) ||
          values.codexFingerprintJA3 ||
          values.codexFingerprintForceHTTP1 ||
          values.codexFingerprintImagesForceHTTP1
        ) {
          const codexFingerprintForceHTTP1 = values.codexFingerprintJA3
            ? false
            : values.codexFingerprintForceHTTP1;
          const codexFingerprintImagesForceHTTP1 = values.codexFingerprintJA3
            ? false
            : values.codexFingerprintImagesForceHTTP1;
          ensureMapInDoc(doc, ['codex-fingerprint']);
          doc.setIn(['codex-fingerprint', 'ja3'], values.codexFingerprintJA3);
          doc.deleteIn(['codex-fingerprint', 'browser-headers']);
          doc.deleteIn(['codex-fingerprint', 'stabilize-per-account']);
          doc.setIn(['codex-fingerprint', 'force-http1'], codexFingerprintForceHTTP1);
          doc.setIn(['codex-fingerprint', 'images-force-http1'], codexFingerprintImagesForceHTTP1);
          deleteIfMapEmpty(doc, ['codex-fingerprint']);
        }
        if (
          docHas(doc, ['codex-header-defaults']) ||
          values.codexHeaderDefaultsUserAgent.trim() ||
          values.codexHeaderDefaultsBetaFeatures.trim() ||
          values.codexHeaderDefaultsOriginator.trim()
        ) {
          ensureMapInDoc(doc, ['codex-header-defaults']);
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'user-agent'],
            values.codexHeaderDefaultsUserAgent
          );
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'beta-features'],
            values.codexHeaderDefaultsBetaFeatures
          );
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'originator'],
            values.codexHeaderDefaultsOriginator
          );
          deleteIfMapEmpty(doc, ['codex-header-defaults']);
        }
        if (
          docHas(doc, ['chatgpt-web']) ||
          values.chatgptWebAutoRelogin ||
          !values.chatgptWebForceSessionRefreshOnImport ||
          values.chatgptWebAutoDeleteDeadAuths ||
          values.chatgptWebAutoDeleteDeadPriorities.length > 0
        ) {
          ensureMapInDoc(doc, ['chatgpt-web']);
          doc.setIn(['chatgpt-web', 'auto-relogin'], values.chatgptWebAutoRelogin);
          if (
            docHas(doc, ['chatgpt-web', 'force-session-refresh-on-import']) ||
            !values.chatgptWebForceSessionRefreshOnImport
          ) {
            doc.setIn(
              ['chatgpt-web', 'force-session-refresh-on-import'],
              values.chatgptWebForceSessionRefreshOnImport
            );
          }
          const autoDeleteConfigured =
            docHas(doc, ['chatgpt-web', 'auto-delete-dead-auths']) ||
            docHas(doc, ['chatgpt-web', 'auto-delete-dead-priorities']) ||
            values.chatgptWebAutoDeleteDeadAuths ||
            values.chatgptWebAutoDeleteDeadPriorities.length > 0;
          if (autoDeleteConfigured) {
            const parsedPriorities =
              values.chatgptWebAutoDeleteDeadPriorities.map(parseIntegerString);
            if (parsedPriorities.every((priority): priority is number => priority !== null)) {
              doc.setIn(
                ['chatgpt-web', 'auto-delete-dead-auths'],
                values.chatgptWebAutoDeleteDeadAuths
              );
              doc.setIn(
                ['chatgpt-web', 'auto-delete-dead-priorities'],
                Array.from(new Set(parsedPriorities))
              );
            }
          }
          deleteIfMapEmpty(doc, ['chatgpt-web']);
        }
        if (docHas(doc, ['no-cooldown-status-codes']) || values.noCooldownStatusCodes.trim()) {
          setIntListFromTextInDoc(doc, ['no-cooldown-status-codes'], values.noCooldownStatusCodes, {
            preserveEmpty: docHas(doc, ['no-cooldown-status-codes']),
          });
        }
        if (values.fixedErrorCooldowns.length > 0) {
          doc.setIn(
            ['fixed-error-cooldowns'],
            serializeFixedErrorCooldownsForYaml(values.fixedErrorCooldowns)
          );
        } else if (docHas(doc, ['fixed-error-cooldowns'])) {
          doc.deleteIn(['fixed-error-cooldowns']);
        }
        if (
          !areErrorResponseRewritesEqual(
            values.errorResponseRewrites,
            baselineValues.errorResponseRewrites
          )
        ) {
          if (values.errorResponseRewrites.length > 0) {
            doc.setIn(
              ['error-response-rewrites'],
              serializeErrorResponseRewritesForYaml(values.errorResponseRewrites)
            );
          } else if (docHas(doc, ['error-response-rewrites'])) {
            doc.deleteIn(['error-response-rewrites']);
          }
        }
        if (
          docHas(doc, ['non-retryable-errors']) ||
          !areNonRetryableErrorsEqual(
            values.nonRetryableErrors,
            DEFAULT_VISUAL_VALUES.nonRetryableErrors
          )
        ) {
          doc.setIn(
            ['non-retryable-errors'],
            serializeNonRetryableErrorsForYaml(values.nonRetryableErrors)
          );
        }
        if (docHas(doc, ['auth-model-exclusions']) || values.authModelExclusions.length > 0) {
          doc.setIn(
            ['auth-model-exclusions'],
            serializeAuthModelExclusionsForYaml(values.authModelExclusions)
          );
        }
        const disabledImageGenerationToolDefaults = DEFAULT_VISUAL_VALUES;
        if (
          docHas(doc, ['disabled-image-generation-tool-fallback']) ||
          values.disabledImageGenerationToolFallback !==
            disabledImageGenerationToolDefaults.disabledImageGenerationToolFallback
        ) {
          doc.setIn(
            ['disabled-image-generation-tool-fallback'],
            values.disabledImageGenerationToolFallback
          );
        }
        if (
          docHas(doc, ['disabled-image-generation-tool-action']) ||
          values.disabledImageGenerationToolAction !==
            disabledImageGenerationToolDefaults.disabledImageGenerationToolAction
        ) {
          doc.setIn(
            ['disabled-image-generation-tool-action'],
            values.disabledImageGenerationToolAction
          );
        }
        if (
          docHas(doc, ['disabled-image-generation-tool-error']) ||
          values.disabledImageGenerationToolAction === 'error' ||
          !areDisabledImageGenerationToolErrorsEqual(
            values.disabledImageGenerationToolError,
            disabledImageGenerationToolDefaults.disabledImageGenerationToolError
          )
        ) {
          ensureMapInDoc(doc, ['disabled-image-generation-tool-error']);
          setIntFromStringInDoc(
            doc,
            ['disabled-image-generation-tool-error', 'status-code'],
            values.disabledImageGenerationToolError.statusCode
          );
          setStringInDoc(
            doc,
            ['disabled-image-generation-tool-error', 'message'],
            values.disabledImageGenerationToolError.message
          );
          setStringInDoc(
            doc,
            ['disabled-image-generation-tool-error', 'type'],
            values.disabledImageGenerationToolError.type
          );
          setStringInDoc(
            doc,
            ['disabled-image-generation-tool-error', 'code'],
            values.disabledImageGenerationToolError.code
          );
          deleteIfMapEmpty(doc, ['disabled-image-generation-tool-error']);
        }
        setBooleanInDoc(doc, ['ws-auth'], values.wsAuth);

        if (
          docHas(doc, ['quota-exceeded', 'antigravity-credits']) ||
          !values.quotaAntigravityCredits
        ) {
          ensureMapInDoc(doc, ['quota-exceeded']);
          doc.setIn(['quota-exceeded', 'antigravity-credits'], values.quotaAntigravityCredits);
          deleteIfMapEmpty(doc, ['quota-exceeded']);
        }

        const authMaintenanceDefaults = DEFAULT_VISUAL_VALUES.authMaintenance;
        const authMaintenanceDefined =
          docHas(doc, ['auth-maintenance']) ||
          values.authMaintenance.enable !== authMaintenanceDefaults.enable ||
          values.authMaintenance.scanIntervalSeconds !==
            authMaintenanceDefaults.scanIntervalSeconds ||
          values.authMaintenance.deleteIntervalSeconds !==
            authMaintenanceDefaults.deleteIntervalSeconds ||
          values.authMaintenance.deleteStatusCodes !== authMaintenanceDefaults.deleteStatusCodes ||
          values.authMaintenance.deleteQuotaExceeded !==
            authMaintenanceDefaults.deleteQuotaExceeded ||
          values.authMaintenance.quotaStrikeThreshold !==
            authMaintenanceDefaults.quotaStrikeThreshold ||
          values.authMaintenance.disableQuotaExceeded !==
            authMaintenanceDefaults.disableQuotaExceeded ||
          values.authMaintenance.disableQuotaStrikeThreshold !==
            authMaintenanceDefaults.disableQuotaStrikeThreshold;
        if (authMaintenanceDefined) {
          ensureMapInDoc(doc, ['auth-maintenance']);
          doc.setIn(['auth-maintenance', 'enable'], values.authMaintenance.enable);
          setIntFromStringInDoc(
            doc,
            ['auth-maintenance', 'scan-interval-seconds'],
            values.authMaintenance.scanIntervalSeconds
          );
          setIntFromStringInDoc(
            doc,
            ['auth-maintenance', 'delete-interval-seconds'],
            values.authMaintenance.deleteIntervalSeconds
          );
          setIntListFromTextInDoc(
            doc,
            ['auth-maintenance', 'delete-status-codes'],
            values.authMaintenance.deleteStatusCodes
          );
          doc.setIn(
            ['auth-maintenance', 'delete-quota-exceeded'],
            values.authMaintenance.deleteQuotaExceeded
          );
          setIntFromStringInDoc(
            doc,
            ['auth-maintenance', 'quota-strike-threshold'],
            values.authMaintenance.quotaStrikeThreshold
          );
          doc.setIn(
            ['auth-maintenance', 'disable-quota-exceeded'],
            values.authMaintenance.disableQuotaExceeded
          );
          setIntFromStringInDoc(
            doc,
            ['auth-maintenance', 'disable-quota-strike-threshold'],
            values.authMaintenance.disableQuotaStrikeThreshold
          );
          deleteIfMapEmpty(doc, ['auth-maintenance']);
        }

        const imagesDefaults = DEFAULT_VISUAL_VALUES.images;
        const imagesDefined =
          docHas(doc, ['images']) ||
          values.images.codexModel !== imagesDefaults.codexModel ||
          values.images.imageModel !== imagesDefaults.imageModel ||
          values.images.enableFreePlanImageModel !== imagesDefaults.enableFreePlanImageModel ||
          values.images.enableNAggregation !== imagesDefaults.enableNAggregation ||
          values.images.enableStreamFlush !== imagesDefaults.enableStreamFlush ||
          values.images.overrideResponseFormatUrl !== imagesDefaults.overrideResponseFormatUrl ||
          values.images.responseFormatUrlDataUrl !== imagesDefaults.responseFormatUrlDataUrl ||
          values.images.overrideTransparentBackground !==
            imagesDefaults.overrideTransparentBackground ||
          values.images.overrideInputFidelity !== imagesDefaults.overrideInputFidelity ||
          values.images.unsupportedStatusCode !== imagesDefaults.unsupportedStatusCode ||
          values.images.streamFlushIntervalMs !== imagesDefaults.streamFlushIntervalMs ||
          values.images.streamFlushMinBytes !== imagesDefaults.streamFlushMinBytes ||
          values.chatgptWebImageUpstreamModel !==
            DEFAULT_VISUAL_VALUES.chatgptWebImageUpstreamModel ||
          values.chatgptWebIgnoreUnsupportedImageParams !==
            DEFAULT_VISUAL_VALUES.chatgptWebIgnoreUnsupportedImageParams ||
          values.chatgptWebAdaptSizeToAspectRatio !==
            DEFAULT_VISUAL_VALUES.chatgptWebAdaptSizeToAspectRatio ||
          values.chatgptWebAspectRatioMaxErrorPercent !==
            DEFAULT_VISUAL_VALUES.chatgptWebAspectRatioMaxErrorPercent ||
          values.chatgptWebResizeToRequestedSize !==
            DEFAULT_VISUAL_VALUES.chatgptWebResizeToRequestedSize ||
          values.chatgptWebResizeFilter !== DEFAULT_VISUAL_VALUES.chatgptWebResizeFilter ||
          values.chatgptWebMaxResizeEdgePixels !==
            DEFAULT_VISUAL_VALUES.chatgptWebMaxResizeEdgePixels ||
          values.chatgptWebMaxImageResponseMegabytes !==
            DEFAULT_VISUAL_VALUES.chatgptWebMaxImageResponseMegabytes ||
          docHas(doc, ['images', 'chatgpt-web']) ||
          docHas(doc, ['images', 'native']) ||
          !areNativeImagesEqual(values.images.native, imagesDefaults.native);
        if (imagesDefined) {
          ensureMapInDoc(doc, ['images']);
          setStringInDoc(doc, ['images', 'codex-model'], values.images.codexModel);
          setStringInDoc(doc, ['images', 'image-model'], values.images.imageModel);
          doc.setIn(
            ['images', 'enable-free-plan-image-model'],
            values.images.enableFreePlanImageModel
          );
          doc.setIn(['images', 'enable-n-aggregation'], values.images.enableNAggregation);
          doc.setIn(['images', 'enable-stream-flush'], values.images.enableStreamFlush);
          doc.setIn(
            ['images', 'override-response-format-url'],
            values.images.overrideResponseFormatUrl
          );
          doc.setIn(
            ['images', 'response-format-url-data-url'],
            values.images.responseFormatUrlDataUrl
          );
          doc.setIn(
            ['images', 'override-transparent-background'],
            values.images.overrideTransparentBackground
          );
          doc.setIn(['images', 'override-input-fidelity'], values.images.overrideInputFidelity);
          setIntFromStringInDoc(
            doc,
            ['images', 'unsupported-status-code'],
            values.images.unsupportedStatusCode
          );
          setIntFromStringInDoc(
            doc,
            ['images', 'stream-flush-interval-ms'],
            values.images.streamFlushIntervalMs
          );
          setIntFromStringInDoc(
            doc,
            ['images', 'stream-flush-min-bytes'],
            values.images.streamFlushMinBytes
          );
          if (
            docHas(doc, ['images', 'chatgpt-web']) ||
            values.chatgptWebImageUpstreamModel !==
              DEFAULT_VISUAL_VALUES.chatgptWebImageUpstreamModel ||
            values.chatgptWebIgnoreUnsupportedImageParams !==
              DEFAULT_VISUAL_VALUES.chatgptWebIgnoreUnsupportedImageParams ||
            values.chatgptWebAdaptSizeToAspectRatio !==
              DEFAULT_VISUAL_VALUES.chatgptWebAdaptSizeToAspectRatio ||
            values.chatgptWebAspectRatioMaxErrorPercent !==
              DEFAULT_VISUAL_VALUES.chatgptWebAspectRatioMaxErrorPercent ||
            values.chatgptWebResizeToRequestedSize !==
              DEFAULT_VISUAL_VALUES.chatgptWebResizeToRequestedSize ||
            values.chatgptWebResizeFilter !== DEFAULT_VISUAL_VALUES.chatgptWebResizeFilter ||
            values.chatgptWebMaxResizeEdgePixels !==
              DEFAULT_VISUAL_VALUES.chatgptWebMaxResizeEdgePixels ||
            values.chatgptWebMaxImageResponseMegabytes !==
              DEFAULT_VISUAL_VALUES.chatgptWebMaxImageResponseMegabytes
          ) {
            ensureMapInDoc(doc, ['images', 'chatgpt-web']);
            setStringInDoc(
              doc,
              ['images', 'chatgpt-web', 'upstream-model'],
              values.chatgptWebImageUpstreamModel
            );
            doc.setIn(
              ['images', 'chatgpt-web', 'ignore-unsupported-params'],
              values.chatgptWebIgnoreUnsupportedImageParams
            );
            doc.setIn(
              ['images', 'chatgpt-web', 'adapt-size-to-aspect-ratio'],
              values.chatgptWebAdaptSizeToAspectRatio
            );
            setNumberFromStringInDoc(
              doc,
              ['images', 'chatgpt-web', 'aspect-ratio-max-error-percent'],
              values.chatgptWebAspectRatioMaxErrorPercent
            );
            doc.setIn(
              ['images', 'chatgpt-web', 'resize-to-requested-size'],
              values.chatgptWebResizeToRequestedSize
            );
            setStringInDoc(
              doc,
              ['images', 'chatgpt-web', 'resize-filter'],
              values.chatgptWebResizeFilter
            );
            setIntFromStringInDoc(
              doc,
              ['images', 'chatgpt-web', 'max-resize-edge-pixels'],
              values.chatgptWebMaxResizeEdgePixels
            );
            setIntFromStringInDoc(
              doc,
              ['images', 'chatgpt-web', 'max-image-response-megabytes'],
              values.chatgptWebMaxImageResponseMegabytes
            );
            deleteIfMapEmpty(doc, ['images', 'chatgpt-web']);
          }
          if (
            docHas(doc, ['images', 'native']) ||
            !areNativeImagesEqual(values.images.native, imagesDefaults.native)
          ) {
            ensureMapInDoc(doc, ['images', 'native']);
            writeNativeImageEndpointInDoc(
              doc,
              ['images', 'native', 'generations'],
              values.images.native.generations,
              imagesDefaults.native.generations
            );
            writeNativeImageEndpointInDoc(
              doc,
              ['images', 'native', 'edits'],
              values.images.native.edits,
              imagesDefaults.native.edits
            );
            deleteIfMapEmpty(doc, ['images', 'native']);
          }
          deleteIfMapEmpty(doc, ['images']);
        }

        if (
          docHas(doc, ['routing']) ||
          values.routingStrategy !== 'round-robin' ||
          values.routingPerAuthRequestLimit !== DEFAULT_VISUAL_VALUES.routingPerAuthRequestLimit ||
          values.routingPerAuthRequestWindowMinutes !==
            DEFAULT_VISUAL_VALUES.routingPerAuthRequestWindowMinutes ||
          values.routingPriorityOverrides.length > 0 ||
          values.routingSessionAffinity ||
          values.routingSessionAffinityFailover !==
            DEFAULT_VISUAL_VALUES.routingSessionAffinityFailover ||
          values.routingSessionAffinityTTL.trim()
        ) {
          ensureMapInDoc(doc, ['routing']);
          doc.setIn(['routing', 'strategy'], values.routingStrategy);
          if (values.routingStrategy === 'fill-first') {
            const fillFirstRange =
              parsePositiveIntegerString(values.routingFillFirstRange) ??
              Number(DEFAULT_VISUAL_VALUES.routingFillFirstRange);
            const fillFirstPerAuthRpm =
              parseNonNegativeIntegerString(values.routingFillFirstPerAuthRpm) ??
              Number(DEFAULT_VISUAL_VALUES.routingFillFirstPerAuthRpm);
            doc.setIn(['routing', 'fill-first-range'], fillFirstRange);
            doc.setIn(['routing', 'fill-first-per-auth-rpm'], fillFirstPerAuthRpm);
          }
          doc.setIn(
            ['routing', 'per-auth-request-limit'],
            parseNonNegativeIntegerString(values.routingPerAuthRequestLimit) ??
              Number(DEFAULT_VISUAL_VALUES.routingPerAuthRequestLimit)
          );
          doc.setIn(
            ['routing', 'per-auth-request-window-minutes'],
            parsePositiveIntegerString(values.routingPerAuthRequestWindowMinutes) ??
              Number(DEFAULT_VISUAL_VALUES.routingPerAuthRequestWindowMinutes)
          );
          if (values.routingPriorityOverrides.length > 0) {
            doc.setIn(
              ['routing', 'priority-overrides'],
              serializeRoutingPriorityOverridesForYaml(values.routingPriorityOverrides)
            );
          } else if (docHas(doc, ['routing', 'priority-overrides'])) {
            doc.deleteIn(['routing', 'priority-overrides']);
          }
          setBooleanInDoc(doc, ['routing', 'session-affinity'], values.routingSessionAffinity);
          if (
            docHas(doc, ['routing', 'session-affinity-failover']) ||
            values.routingSessionAffinityFailover !==
              DEFAULT_VISUAL_VALUES.routingSessionAffinityFailover
          ) {
            doc.setIn(
              ['routing', 'session-affinity-failover'],
              values.routingSessionAffinityFailover
            );
          }
          setStringInDoc(
            doc,
            ['routing', 'session-affinity-ttl'],
            values.routingSessionAffinityTTL
          );
          deleteIfMapEmpty(doc, ['routing']);
        }

        const keepaliveSeconds =
          typeof values.streaming?.keepaliveSeconds === 'string'
            ? values.streaming.keepaliveSeconds
            : '';
        const bootstrapRetries =
          typeof values.streaming?.bootstrapRetries === 'string'
            ? values.streaming.bootstrapRetries
            : '';
        const streamFlushIntervalMs =
          typeof values.streaming?.streamFlushIntervalMs === 'string'
            ? values.streaming.streamFlushIntervalMs
            : '';
        const streamFlushMinBytes =
          typeof values.streaming?.streamFlushMinBytes === 'string'
            ? values.streaming.streamFlushMinBytes
            : '';
        const nonstreamKeepaliveInterval =
          typeof values.streaming?.nonstreamKeepaliveInterval === 'string'
            ? values.streaming.nonstreamKeepaliveInterval
            : '';
        const streamingDefaults = DEFAULT_VISUAL_VALUES.streaming;

        const streamingDefined =
          docHas(doc, ['streaming']) ||
          keepaliveSeconds.trim() ||
          bootstrapRetries.trim() ||
          values.streaming.enableStreamFlush !== streamingDefaults.enableStreamFlush ||
          streamFlushIntervalMs !== streamingDefaults.streamFlushIntervalMs ||
          streamFlushMinBytes !== streamingDefaults.streamFlushMinBytes ||
          values.streaming.trustUpstreamSSE !== streamingDefaults.trustUpstreamSSE;
        if (streamingDefined) {
          ensureMapInDoc(doc, ['streaming']);
          setIntFromStringInDoc(doc, ['streaming', 'keepalive-seconds'], keepaliveSeconds);
          setIntFromStringInDoc(doc, ['streaming', 'bootstrap-retries'], bootstrapRetries);
          setBooleanInDoc(
            doc,
            ['streaming', 'enable-stream-flush'],
            values.streaming.enableStreamFlush
          );
          setIntFromStringInDoc(
            doc,
            ['streaming', 'stream-flush-interval-ms'],
            streamFlushIntervalMs
          );
          setIntFromStringInDoc(doc, ['streaming', 'stream-flush-min-bytes'], streamFlushMinBytes);
          setBooleanInDoc(
            doc,
            ['streaming', 'trust-upstream-sse'],
            values.streaming.trustUpstreamSSE
          );
          deleteIfMapEmpty(doc, ['streaming']);
        }

        setIntFromStringInDoc(doc, ['nonstream-keepalive-interval'], nonstreamKeepaliveInterval);

        if (
          docHas(doc, ['payload']) ||
          values.payloadDefaultRules.length > 0 ||
          values.payloadDefaultRawRules.length > 0 ||
          values.payloadOverrideRules.length > 0 ||
          values.payloadOverrideRawRules.length > 0 ||
          values.payloadFilterRules.length > 0
        ) {
          ensureMapInDoc(doc, ['payload']);
          if (values.payloadDefaultRules.length > 0) {
            doc.setIn(
              ['payload', 'default'],
              serializePayloadRulesForYaml(values.payloadDefaultRules)
            );
          } else if (docHas(doc, ['payload', 'default'])) {
            doc.deleteIn(['payload', 'default']);
          }
          if (values.payloadDefaultRawRules.length > 0) {
            doc.setIn(
              ['payload', 'default-raw'],
              serializeRawPayloadRulesForYaml(values.payloadDefaultRawRules)
            );
          } else if (docHas(doc, ['payload', 'default-raw'])) {
            doc.deleteIn(['payload', 'default-raw']);
          }
          if (values.payloadOverrideRules.length > 0) {
            doc.setIn(
              ['payload', 'override'],
              serializePayloadRulesForYaml(values.payloadOverrideRules)
            );
          } else if (docHas(doc, ['payload', 'override'])) {
            doc.deleteIn(['payload', 'override']);
          }
          if (values.payloadOverrideRawRules.length > 0) {
            doc.setIn(
              ['payload', 'override-raw'],
              serializeRawPayloadRulesForYaml(values.payloadOverrideRawRules)
            );
          } else if (docHas(doc, ['payload', 'override-raw'])) {
            doc.deleteIn(['payload', 'override-raw']);
          }
          if (values.payloadFilterRules.length > 0) {
            doc.setIn(
              ['payload', 'filter'],
              serializePayloadFilterRulesForYaml(values.payloadFilterRules)
            );
          } else if (docHas(doc, ['payload', 'filter'])) {
            doc.deleteIn(['payload', 'filter']);
          }
          deleteIfMapEmpty(doc, ['payload']);
        }

        return doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
      } catch {
        return currentYaml;
      }
    },
    [baselineValues.apiKeysText, baselineValues.errorResponseRewrites, visualValues]
  );

  const setVisualValues = useCallback((newValues: Partial<VisualConfigValues>) => {
    dispatch({ type: 'set_values', values: newValues });
  }, []);

  return {
    visualValues,
    baselineValues,
    visualDirty,
    visualDirtyFields: Array.from(state.dirtyFields),
    visualParseError,
    visualValidationErrors,
    visualCodexCustomModelValidationErrors,
    visualHasCodexCustomModelValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  };
}

export const VISUAL_CONFIG_PROTOCOL_OPTIONS = [
  {
    value: '',
    labelKey: 'config_management.visual.payload_rules.provider_default',
    defaultLabel: 'Default',
  },
  {
    value: 'openai',
    labelKey: 'config_management.visual.payload_rules.provider_openai',
    defaultLabel: 'OpenAI',
  },
  {
    value: 'openai-response',
    labelKey: 'config_management.visual.payload_rules.provider_openai_response',
    defaultLabel: 'OpenAI Response',
  },
  {
    value: 'gemini',
    labelKey: 'config_management.visual.payload_rules.provider_gemini',
    defaultLabel: 'Gemini',
  },
  {
    value: 'claude',
    labelKey: 'config_management.visual.payload_rules.provider_claude',
    defaultLabel: 'Claude',
  },
  {
    value: 'codex',
    labelKey: 'config_management.visual.payload_rules.provider_codex',
    defaultLabel: 'Codex',
  },
  {
    value: 'antigravity',
    labelKey: 'config_management.visual.payload_rules.provider_antigravity',
    defaultLabel: 'Antigravity',
  },
] as const;

export const VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS = [
  {
    value: 'string',
    labelKey: 'config_management.visual.payload_rules.value_type_string',
    defaultLabel: 'String',
  },
  {
    value: 'number',
    labelKey: 'config_management.visual.payload_rules.value_type_number',
    defaultLabel: 'Number',
  },
  {
    value: 'boolean',
    labelKey: 'config_management.visual.payload_rules.value_type_boolean',
    defaultLabel: 'Boolean',
  },
  {
    value: 'json',
    labelKey: 'config_management.visual.payload_rules.value_type_json',
    defaultLabel: 'JSON',
  },
] as const satisfies ReadonlyArray<{
  value: PayloadParamValueType;
  labelKey: string;
  defaultLabel: string;
}>;
