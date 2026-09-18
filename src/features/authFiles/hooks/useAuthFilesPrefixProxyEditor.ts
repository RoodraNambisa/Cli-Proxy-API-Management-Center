import {
  emptyGrokModelRouting,
  readGrokModelRouting,
  serializeGrokCatalogSources,
  serializeGrokModelRoutes,
  grokModelRoutingError,
  type GrokModelRoutingDraft,
  type GrokModelRoute,
} from '@/utils/grokModelRouting';
import {
  isValidCredentialWeight,
  normalizeCredentialWeight,
  serializeCredentialWeight,
} from '@/utils/credentialWeight';
import { useRef, useState } from 'react';
import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';
import { parseProxyBindingText, type CredentialProxyBinding } from '@/utils/proxyBinding';
import {
  grokAccountUpstream,
  GROK_UPSTREAM_URLS,
  normalizeGrokBaseUrl,
  type GrokAccountUpstream,
  type GrokUpstreamMode,
} from '@/utils/grokUpstream';
import type { RequestScopedErrorRule } from '@/types/requestScopedErrors';
import {
  normalizeRequestScopedErrors,
  serializeRequestScopedErrors,
  validateRequestScopedErrorRule,
} from '@/utils/requestScopedErrors';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, CodexFingerprintMode } from '@/types';
import { useNotificationStore } from '@/stores';
import type { AuthFileFieldsPatch } from '@/services/api/authFiles';
import {
  applyCodexAuthFileWebsockets,
  normalizeCodexFingerprintMode,
  normalizeExcludedModels,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
  readCodexAuthFileWebsockets,
  resolveCodexAuthModeSummary,
} from '@/features/authFiles/constants';

export type AuthFileHeaders = Record<string, string>;
export type AuthFileHeadersErrorKey =
  | 'auth_files.headers_invalid_json'
  | 'auth_files.headers_invalid_object'
  | 'auth_files.headers_invalid_value';

export type ChatGptWebLoginMethod = 'auto' | 'passkey' | 'password_totp' | 'api798';

export type PrefixProxyEditorField =
  | 'rawText'
  | 'proxyBindingText'
  | 'grokRouting'
  | 'grokUpstream'
  | 'baseUrl'
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'weight'
  | 'requestScopedErrors'
  | 'excludedModelsText'
  | 'disableCooling'
  | 'websockets'
  | 'codexFingerprintMode'
  | 'note'
  | 'headersText'
  | 'loginMethod'
  | 'api798Url';

export type PrefixProxyEditorFieldValue =
  | string
  | boolean
  | RequestScopedErrorRule[]
  | GrokModelRoutingDraft;

export type PrefixProxyEditorState = {
  fileName: string;
  fileInfoText: string;
  isCodexFile: boolean;
  isChatGptWebFile: boolean;
  isXaiFile: boolean;
  grokUpstream: GrokAccountUpstream;
  grokRouting?: GrokModelRoutingDraft;
  grokRoutingTouched?: boolean;
  baseUrl: string;
  baseUrlTouched: boolean;
  readOnly: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  originalText: string;
  rawText: string;
  jsonError?: string | null;
  sourceEdited?: boolean;
  connection?: ApiClientConnectionSnapshot;
  touchedFields?: PrefixProxyEditorField[];
  proxyBindingText?: string;
  proxyBindingError?: string | null;
  json: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
  priority: string;
  weight: string;
  weightTouched: boolean;
  requestScopedErrors: RequestScopedErrorRule[];
  requestScopedErrorsTouched: boolean;
  excludedModelsText: string;
  disableCooling: string;
  websockets: boolean;
  codexFingerprintMode: CodexFingerprintMode;
  codexFingerprintModeTouched: boolean;
  note: string;
  noteTouched: boolean;
  headersText: string;
  headersTouched: boolean;
  headersError: string | null;
  loginMethod: ChatGptWebLoginMethod;
  api798Url: string;
};

export type UseAuthFilesPrefixProxyEditorOptions = {
  disableControls: boolean;
  loadFiles: () => Promise<void>;
};

export type UseAuthFilesPrefixProxyEditorResult = {
  prefixProxyEditor: PrefixProxyEditorState | null;
  prefixProxyUpdatedText: string;
  prefixProxyDirty: boolean;
  openPrefixProxyEditor: (file: AuthFileItem) => Promise<void>;
  closePrefixProxyEditor: () => void;
  handlePrefixProxyChange: (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => void;
  handlePrefixProxySave: () => Promise<void>;
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isChatGptWebLoginMethod = (value: unknown): value is ChatGptWebLoginMethod =>
  value === 'auto' || value === 'passkey' || value === 'password_totp' || value === 'api798';

const validateHeadersValue = (value: unknown): AuthFileHeadersErrorKey | null => {
  if (!isRecordObject(value)) {
    return 'auth_files.headers_invalid_object';
  }
  return Object.values(value).every((item) => typeof item === 'string')
    ? null
    : 'auth_files.headers_invalid_value';
};

const jsonValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const buildAuthFileFieldsPatch = (
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  isCodexFile: boolean,
  isChatGptWebFile: boolean,
  isXaiFile = false
): AuthFileFieldsPatch => {
  const patch: AuthFileFieldsPatch = {};
  if (
    isXaiFile &&
    (!jsonValuesEqual(previous.base_url, next.base_url) ||
      !jsonValuesEqual(previous.using_api, next.using_api))
  ) {
    patch.base_url = typeof next.base_url === 'string' ? next.base_url : '';
  }

  if (isXaiFile) {
    if (!jsonValuesEqual(previous.xai_model_catalog_sources, next.xai_model_catalog_sources))
      patch.xai_model_catalog_sources =
        (next.xai_model_catalog_sources as string[] | undefined) ?? [];
    if (!jsonValuesEqual(previous.xai_model_routes, next.xai_model_routes))
      patch.xai_model_routes = (next.xai_model_routes as GrokModelRoute[] | undefined) ?? [];
  }
  if (!jsonValuesEqual(previous.prefix, next.prefix)) {
    patch.prefix = typeof next.prefix === 'string' ? next.prefix : '';
  }
  if (!jsonValuesEqual(previous.proxy_binding, next.proxy_binding)) {
    patch.proxy_binding = (next.proxy_binding as CredentialProxyBinding | undefined) ?? null;
  }
  if (!jsonValuesEqual(previous.proxy_url, next.proxy_url)) {
    patch.proxy_url = typeof next.proxy_url === 'string' ? next.proxy_url : '';
  }
  if (!jsonValuesEqual(previous.weight, next.weight)) {
    patch.weight = serializeCredentialWeight(normalizeCredentialWeight(next.weight)) ?? null;
  }
  if (
    !jsonValuesEqual(previous.request_scoped_errors, next.request_scoped_errors) ||
    !jsonValuesEqual(previous['request-scoped-errors'], next['request-scoped-errors'])
  ) {
    const value = Object.prototype.hasOwnProperty.call(next, 'request_scoped_errors')
      ? next.request_scoped_errors
      : next['request-scoped-errors'];
    patch.request_scoped_errors =
      serializeRequestScopedErrors(normalizeRequestScopedErrors(value)) ?? null;
  }
  if (!jsonValuesEqual(previous.priority, next.priority)) {
    patch.priority = Object.prototype.hasOwnProperty.call(next, 'priority')
      ? (parsePriorityValue(next.priority) ?? null)
      : null;
  }
  if (!jsonValuesEqual(previous.note, next.note)) {
    patch.note = typeof next.note === 'string' ? next.note : '';
  }
  if (!jsonValuesEqual(previous.headers, next.headers)) {
    patch.headers = isRecordObject(next.headers) ? (next.headers as AuthFileHeaders) : {};
  }
  if (!jsonValuesEqual(previous.excluded_models, next.excluded_models)) {
    patch.excluded_models = normalizeExcludedModels(next.excluded_models);
  }
  if (!jsonValuesEqual(previous.disable_cooling, next.disable_cooling)) {
    patch.disable_cooling = parseDisableCoolingValue(next.disable_cooling) ?? false;
  }
  if (isCodexFile && !jsonValuesEqual(previous.websockets, next.websockets)) {
    patch.websockets = readCodexAuthFileWebsockets(next);
  }
  if (
    isCodexFile &&
    !jsonValuesEqual(previous.codex_fingerprint_mode, next.codex_fingerprint_mode)
  ) {
    patch.codex_fingerprint_mode = normalizeCodexFingerprintMode(next.codex_fingerprint_mode);
  }
  if (isChatGptWebFile && !jsonValuesEqual(previous.login_method, next.login_method)) {
    patch.login_method =
      typeof next.login_method === 'string' ? (next.login_method as ChatGptWebLoginMethod) : 'auto';
  }
  if (isChatGptWebFile && !jsonValuesEqual(previous.api798_url, next.api798_url)) {
    patch.api798_url = typeof next.api798_url === 'string' ? next.api798_url : '';
  }

  return patch;
};

export const parseHeadersText = (
  text: string
): { value: AuthFileHeaders | null; errorKey: AuthFileHeadersErrorKey | null } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, errorKey: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { value: null, errorKey: 'auth_files.headers_invalid_json' };
  }

  const errorKey = validateHeadersValue(parsed);
  if (errorKey) {
    return { value: null, errorKey };
  }

  return { value: parsed as AuthFileHeaders, errorKey: null };
};

const buildPrefixProxyUpdatedText = (
  editor: PrefixProxyEditorState | null,
  resolveHeadersError: (key: AuthFileHeadersErrorKey) => string
): string => {
  if (!editor?.json) return editor?.rawText ?? '';
  const next: Record<string, unknown> = { ...editor.json };
  if (editor.isXaiFile && editor.baseUrlTouched) {
    const baseUrl = normalizeGrokBaseUrl(editor.baseUrl) ?? editor.baseUrl.trim();
    next.base_url = baseUrl;
    next.using_api = Boolean(baseUrl && baseUrl !== GROK_UPSTREAM_URLS.cli);
  }
  if (editor.isXaiFile && editor.grokRoutingTouched && editor.grokRouting) {
    const previous = readGrokModelRouting(
      editor.json.xai_model_catalog_sources,
      editor.json.xai_model_routes
    );
    if (!jsonValuesEqual(previous.catalogSources, editor.grokRouting.catalogSources))
      next.xai_model_catalog_sources = serializeGrokCatalogSources(editor.grokRouting);
    if (!jsonValuesEqual(previous.modelRoutes, editor.grokRouting.modelRoutes))
      next.xai_model_routes = serializeGrokModelRoutes(editor.grokRouting);
  }
  if (editor.touchedFields?.includes('prefix')) {
    next.prefix = editor.prefix;
  }
  if (editor.touchedFields?.includes('proxyUrl')) {
    next.proxy_url = editor.proxyUrl;
  }

  if (editor.weightTouched) {
    if (editor.weight.trim()) next.weight = Number(editor.weight);
    else delete next.weight;
  }
  if (editor.requestScopedErrorsTouched) {
    next.request_scoped_errors = serializeRequestScopedErrors(editor.requestScopedErrors) ?? [];
    delete next['request-scoped-errors'];
  }
  if (editor.touchedFields?.includes('proxyBindingText')) {
    const { value, invalid } = parseProxyBindingText(editor.proxyBindingText ?? '');
    if (!invalid) {
      if (value) next.proxy_binding = value;
      else delete next.proxy_binding;
    }
  }
  if (editor.touchedFields?.includes('priority')) {
    const parsedPriority = parsePriorityValue(editor.priority);
    if (parsedPriority !== undefined) {
      next.priority = parsedPriority;
    } else if ('priority' in next) {
      delete next.priority;
    }
  }
  if (editor.touchedFields?.includes('excludedModelsText')) {
    const excludedModels = parseExcludedModelsText(editor.excludedModelsText);
    if (excludedModels.length > 0) {
      next.excluded_models = excludedModels;
    } else if ('excluded_models' in next) {
      delete next.excluded_models;
    }
  }
  if (editor.touchedFields?.includes('disableCooling')) {
    const parsedDisableCooling = parseDisableCoolingValue(editor.disableCooling);
    if (parsedDisableCooling !== undefined) {
      next.disable_cooling = parsedDisableCooling;
    } else if ('disable_cooling' in next) {
      delete next.disable_cooling;
    }
  }
  if (editor.noteTouched) {
    const noteValue = editor.note.trim();
    if (noteValue) {
      next.note = editor.note;
    } else if ('note' in next) {
      delete next.note;
    }
  }

  if (editor.headersTouched) {
    const { value: parsedHeaders, errorKey } = parseHeadersText(editor.headersText);
    if (errorKey) {
      throw new Error(resolveHeadersError(errorKey));
    }
    if (parsedHeaders) {
      next.headers = parsedHeaders;
    } else {
      delete next.headers;
    }
  }

  if (editor.isChatGptWebFile) {
    if (editor.touchedFields?.includes('loginMethod')) {
      next.login_method = editor.loginMethod;
    }
    if (editor.touchedFields?.includes('api798Url')) {
      if (editor.api798Url) {
        next.api798_url = editor.api798Url;
      } else if ('api798_url' in next) {
        delete next.api798_url;
      }
    }
  }
  if (editor.isCodexFile && editor.codexFingerprintModeTouched) {
    next.codex_fingerprint_mode = editor.codexFingerprintMode;
  }

  return JSON.stringify(
    editor.isCodexFile && editor.touchedFields?.includes('websockets')
      ? applyCodexAuthFileWebsockets(next, editor.websockets)
      : next
  );
};

const readEditorFields = (json: Record<string, unknown>, t: (key: string) => string) => {
  const requestScopedErrors =
    normalizeRequestScopedErrors(
      Object.prototype.hasOwnProperty.call(json, 'request_scoped_errors')
        ? json.request_scoped_errors
        : json['request-scoped-errors']
    ) ?? [];
  const prefix = typeof json.prefix === 'string' ? json.prefix : '';
  const proxyUrl = typeof json.proxy_url === 'string' ? json.proxy_url : '';
  const priority = parsePriorityValue(json.priority);
  const excludedModels = normalizeExcludedModels(json.excluded_models);
  const disableCoolingValue = parseDisableCoolingValue(json.disable_cooling);
  const websocketsValue = readCodexAuthFileWebsockets(json);
  const codexFingerprintMode = normalizeCodexFingerprintMode(json.codex_fingerprint_mode);
  const note = typeof json.note === 'string' ? json.note : '';
  const loginMethod = isChatGptWebLoginMethod(json.login_method) ? json.login_method : 'auto';
  const api798Url = typeof json.api798_url === 'string' ? json.api798_url : '';
  const headers = json.headers;
  let headersText = '';
  let headersError: string | null = null;
  if (headers !== undefined) {
    headersText = JSON.stringify(headers, null, 2);
    const { errorKey } = parseHeadersText(headersText);
    headersError = errorKey ? t(errorKey) : null;
  }

  const proxyBindingText =
    json.proxy_binding == null ? '' : JSON.stringify(json.proxy_binding, null, 2);
  return {
    prefix,
    proxyUrl,
    grokUpstream: grokAccountUpstream(json.base_url),
    grokRouting: readGrokModelRouting(json.xai_model_catalog_sources, json.xai_model_routes),
    grokRoutingTouched: false,
    baseUrl: typeof json.base_url === 'string' ? json.base_url : '',
    baseUrlTouched: false,
    priority: priority !== undefined ? String(priority) : '',
    weight: json.weight === undefined ? '' : String(normalizeCredentialWeight(json.weight) ?? ''),
    weightTouched: false,
    requestScopedErrors,
    requestScopedErrorsTouched: false,
    excludedModelsText: excludedModels.join('\n'),
    disableCooling: disableCoolingValue === undefined ? '' : disableCoolingValue ? 'true' : 'false',
    websockets: websocketsValue,
    codexFingerprintMode,
    codexFingerprintModeTouched: false,
    note,
    noteTouched: false,
    headersText,
    headersTouched: false,
    headersError,
    loginMethod,
    api798Url,
    proxyBindingText,
    proxyBindingError: parseProxyBindingText(proxyBindingText).invalid
      ? t('auth_files.proxy_binding_invalid')
      : null,
    touchedFields: [] as PrefixProxyEditorField[],
  };
};

export function useAuthFilesPrefixProxyEditor(
  options: UseAuthFilesPrefixProxyEditorOptions
): UseAuthFilesPrefixProxyEditorResult {
  const { disableControls, loadFiles } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState | null>(null);
  const editorRequest = useRef(0);

  const hasBlockingWeightError = Boolean(
    prefixProxyEditor?.weightTouched &&
    !isValidCredentialWeight(
      prefixProxyEditor.weight.trim() === '' ? undefined : Number(prefixProxyEditor.weight)
    )
  );
  const hasBlockingValidationError = Boolean(
    prefixProxyEditor?.jsonError ||
    prefixProxyEditor?.proxyBindingError ||
    hasBlockingWeightError ||
    (prefixProxyEditor?.grokRoutingTouched &&
      prefixProxyEditor.grokRouting &&
      grokModelRoutingError(prefixProxyEditor.grokRouting)) ||
    (prefixProxyEditor?.isXaiFile &&
      prefixProxyEditor.baseUrlTouched &&
      (normalizeGrokBaseUrl(prefixProxyEditor.baseUrl) === null ||
        (prefixProxyEditor.grokUpstream === 'custom' && !prefixProxyEditor.baseUrl.trim()))) ||
    prefixProxyEditor?.requestScopedErrors.some((rule) => validateRequestScopedErrorRule(rule)) ||
    (prefixProxyEditor?.headersTouched && prefixProxyEditor.headersError) ||
    (prefixProxyEditor?.isChatGptWebFile &&
      prefixProxyEditor.loginMethod === 'api798' &&
      !prefixProxyEditor.api798Url.trim())
  );
  const prefixProxyUpdatedText = prefixProxyEditor?.jsonError
    ? (prefixProxyEditor.rawText ?? '')
    : prefixProxyEditor?.json && !hasBlockingValidationError
      ? prefixProxyEditor.sourceEdited && !prefixProxyEditor.touchedFields?.length
        ? prefixProxyEditor.rawText
        : buildPrefixProxyUpdatedText(prefixProxyEditor, (key) => t(key))
      : '';

  const prefixProxyDirty =
    Boolean(prefixProxyEditor?.json) &&
    Boolean(prefixProxyEditor?.originalText) &&
    (prefixProxyUpdatedText === '' ||
      Boolean(prefixProxyEditor?.jsonError) ||
      (Boolean(prefixProxyUpdatedText) &&
        JSON.stringify(JSON.parse(prefixProxyUpdatedText)) !== prefixProxyEditor?.originalText));

  const closePrefixProxyEditor = () => {
    editorRequest.current += 1;
    setPrefixProxyEditor(null);
  };

  const openPrefixProxyEditor = async (file: AuthFileItem) => {
    const name = file.name;
    const normalizedType = String(file.type ?? '')
      .trim()
      .toLowerCase();
    const normalizedProvider = String(file.provider ?? '')
      .trim()
      .toLowerCase();
    const isCodexFile =
      (normalizedType === 'codex' || normalizedProvider === 'codex') &&
      resolveCodexAuthModeSummary(file) !== null;
    const isChatGptWebFile =
      normalizedType === 'chatgpt-web' || normalizedProvider === 'chatgpt-web';
    const isXaiFile = [normalizedType, normalizedProvider].some((value) =>
      ['xai', 'x-ai', 'grok'].includes(value)
    );
    const readOnly = normalizedType === 'gemini-cli' || normalizedProvider === 'gemini-cli';

    if (disableControls) return;
    if (prefixProxyEditor?.fileName === name) {
      setPrefixProxyEditor(null);
      return;
    }

    const request = ++editorRequest.current;
    const connection = apiClient.captureConnection();
    setPrefixProxyEditor({
      connection,
      sourceEdited: false,
      jsonError: null,
      touchedFields: [],
      proxyBindingText: '',
      proxyBindingError: null,
      fileName: name,
      fileInfoText: JSON.stringify(file, null, 2),
      isCodexFile,
      isChatGptWebFile,
      isXaiFile,
      grokUpstream: 'inherit',
      grokRouting: emptyGrokModelRouting(),
      grokRoutingTouched: false,
      baseUrl: '',
      baseUrlTouched: false,
      readOnly,
      loading: true,
      saving: false,
      error: null,
      originalText: '',
      rawText: '',
      json: null,
      prefix: '',
      proxyUrl: '',
      priority: '',
      weight: '',
      weightTouched: false,
      requestScopedErrors: [],
      requestScopedErrorsTouched: false,
      excludedModelsText: '',
      disableCooling: '',
      websockets: false,
      codexFingerprintMode: 'device',
      codexFingerprintModeTouched: false,
      note: '',
      noteTouched: false,
      headersText: '',
      headersTouched: false,
      headersError: null,
      loginMethod: 'auto',
      api798Url: '',
    });

    try {
      const rawText = await authFilesApi.downloadText(name);
      const activeConnection = apiClient.captureConnection();
      if (
        editorRequest.current !== request ||
        activeConnection.apiBase !== connection.apiBase ||
        activeConnection.managementKey !== connection.managementKey
      )
        return;
      const trimmed = rawText.trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name || editorRequest.current !== request) return prev;
          return {
            ...prev,
            loading: false,
            error: t('auth_files.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name || editorRequest.current !== request) return prev;
          return {
            ...prev,
            loading: false,
            error: t('auth_files.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      const json = { ...(parsed as Record<string, unknown>) };
      const originalText = JSON.stringify(json);

      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name || editorRequest.current !== request) return prev;
        return {
          ...prev,
          loading: false,
          originalText,
          rawText: originalText,
          json,
          ...readEditorFields(json, t),
          error: null,
        };
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.download_failed');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name || editorRequest.current !== request) return prev;
        return { ...prev, loading: false, error: errorMessage, rawText: '' };
      });
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    }
  };

  const handlePrefixProxyChange = (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => {
    const changeFields = (prev: PrefixProxyEditorState): PrefixProxyEditorState => {
      if (field === 'proxyBindingText') {
        const proxyBindingText = String(value);
        return {
          ...prev,
          proxyBindingText,
          proxyBindingError: parseProxyBindingText(proxyBindingText).invalid
            ? t('auth_files.proxy_binding_invalid')
            : null,
        };
      }
      if (field === 'grokRouting' && typeof value === 'object' && 'catalogSources' in value)
        return { ...prev, grokRouting: value, grokRoutingTouched: true };
      if (field === 'grokUpstream') {
        const mode = String(value) as GrokAccountUpstream;
        if (!['inherit', 'custom', ...Object.keys(GROK_UPSTREAM_URLS)].includes(mode)) return prev;
        return {
          ...prev,
          grokUpstream: mode,
          baseUrlTouched: true,
          baseUrl:
            mode === 'inherit'
              ? ''
              : mode === 'custom'
                ? prev.baseUrl
                : GROK_UPSTREAM_URLS[mode as GrokUpstreamMode],
        };
      }
      if (field === 'baseUrl') return { ...prev, baseUrl: String(value), baseUrlTouched: true };
      if (field === 'prefix') return { ...prev, prefix: String(value) };
      if (field === 'requestScopedErrors')
        return Array.isArray(value)
          ? { ...prev, requestScopedErrors: value, requestScopedErrorsTouched: true }
          : prev;
      if (field === 'proxyUrl') return { ...prev, proxyUrl: String(value) };
      if (field === 'weight') return { ...prev, weight: String(value), weightTouched: true };
      if (field === 'priority') return { ...prev, priority: String(value) };
      if (field === 'excludedModelsText') return { ...prev, excludedModelsText: String(value) };
      if (field === 'disableCooling') return { ...prev, disableCooling: String(value) };
      if (field === 'note') return { ...prev, note: String(value), noteTouched: true };
      if (field === 'headersText') {
        const headersText = String(value);
        const { errorKey } = parseHeadersText(headersText);
        return {
          ...prev,
          headersText,
          headersTouched: true,
          headersError: errorKey ? t(errorKey) : null,
        };
      }
      if (field === 'loginMethod') {
        return isChatGptWebLoginMethod(value) ? { ...prev, loginMethod: value } : prev;
      }
      if (field === 'api798Url') return { ...prev, api798Url: String(value) };
      if (field === 'codexFingerprintMode') {
        return {
          ...prev,
          codexFingerprintMode: normalizeCodexFingerprintMode(value),
          codexFingerprintModeTouched: true,
        };
      }
      return { ...prev, websockets: Boolean(value) };
    };
    setPrefixProxyEditor((prev) => {
      if (!prev || prev.saving || prev.readOnly || disableControls) return prev;
      if (field === 'rawText') {
        const rawText = String(value);
        try {
          const json = JSON.parse(rawText) as unknown;
          if (!isRecordObject(json)) throw new Error('object required');
          return {
            ...prev,
            ...readEditorFields(json, t),
            json,
            rawText,
            sourceEdited: true,
            jsonError: null,
            error: null,
          };
        } catch {
          return {
            ...prev,
            rawText,
            sourceEdited: true,
            jsonError: t('auth_files.prefix_proxy_invalid_json'),
          };
        }
      }
      if (prev.jsonError) return prev;
      const next = changeFields(prev);
      return { ...next, touchedFields: [...new Set([...(prev.touchedFields ?? []), field])] };
    });
  };

  const handlePrefixProxySave = async () => {
    if (
      !prefixProxyEditor ||
      prefixProxyEditor.saving ||
      prefixProxyEditor.readOnly ||
      disableControls
    )
      return;
    if (prefixProxyEditor.jsonError || prefixProxyEditor.proxyBindingError) return;
    const connection = prefixProxyEditor.connection ?? apiClient.captureConnection();
    const currentConnection = apiClient.captureConnection();
    if (
      connection.apiBase !== currentConnection.apiBase ||
      connection.managementKey !== currentConnection.managementKey
    ) {
      showNotification(t('auth_files.json_connection_changed'), 'error');
      return;
    }
    const request = editorRequest.current;
    if (prefixProxyEditor?.grokRoutingTouched && prefixProxyEditor.grokRouting) {
      const issue = grokModelRoutingError(prefixProxyEditor.grokRouting);
      if (issue) {
        showNotification(t(`grok_routing.invalid_${issue}`), 'error');
        return;
      }
    }
    if (
      prefixProxyEditor?.isXaiFile &&
      prefixProxyEditor.baseUrlTouched &&
      (normalizeGrokBaseUrl(prefixProxyEditor.baseUrl) === null ||
        (prefixProxyEditor.grokUpstream === 'custom' && !prefixProxyEditor.baseUrl.trim()))
    ) {
      showNotification(t('grok_upstream.invalid_url'), 'error');
      return;
    }
    const ruleIssue = prefixProxyEditor?.requestScopedErrors
      .map(validateRequestScopedErrorRule)
      .find(Boolean);
    if (ruleIssue) {
      showNotification(t(`request_scoped_errors.invalid_${ruleIssue}`), 'error');
      return;
    }
    if (hasBlockingWeightError) {
      showNotification(t('ai_providers.weight_invalid'), 'error');
      return;
    }
    if (!prefixProxyEditor?.json) return;
    if (!prefixProxyDirty) return;

    const name = prefixProxyEditor.fileName;
    let payload = '';
    try {
      payload = buildPrefixProxyUpdatedText(prefixProxyEditor, (key) => t(key));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid format';
      showNotification(errorMessage, 'error');
      return;
    }

    setPrefixProxyEditor((prev) => {
      if (!prev || prev.fileName !== name) return prev;
      return { ...prev, saving: true };
    });

    try {
      const nextJson = JSON.parse(payload) as Record<string, unknown>;
      if (prefixProxyEditor.sourceEdited) {
        await authFilesApi.replaceContent(
          name,
          JSON.parse(prefixProxyEditor.originalText) as Record<string, unknown>,
          nextJson,
          connection
        );
      } else {
        const fieldsPatch = buildAuthFileFieldsPatch(
          JSON.parse(prefixProxyEditor.originalText) as Record<string, unknown>,
          nextJson,
          prefixProxyEditor.isCodexFile,
          prefixProxyEditor.isChatGptWebFile,
          prefixProxyEditor.isXaiFile
        );
        const result = await authFilesApi.patchFieldsBatch([name], fieldsPatch);
        if (result.failed.length > 0 || result.updated !== 1) {
          throw new Error(result.failed[0]?.error || t('notification.upload_failed'));
        }
      }
      if (editorRequest.current !== request) return;
      showNotification(t('auth_files.prefix_proxy_saved_success', { name }), 'success');
      setPrefixProxyEditor(null);
      void loadFiles().catch(() => {});
    } catch (err: unknown) {
      if (editorRequest.current !== request) return;
      const errorMessage =
        (err as { status?: number })?.status === 409
          ? t('auth_files.json_conflict')
          : err instanceof Error
            ? err.message
            : '';
      showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name) return prev;
        return { ...prev, saving: false, error: errorMessage };
      });
    }
  };

  return {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  };
}
