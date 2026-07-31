import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw } from '@/components/ui/icons';
import { chatGptWebApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { ChatGptWebLoginProxyConfig } from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './ChatGptWebLoginProxyPanel.module.scss';

type LoginProxyDraft = {
  enabled: boolean;
  urlTemplate: string;
  placeholderCharset: string;
  rotateOnRetry: boolean;
  requestAttempts: string;
  flowAttempts: string;
  retryDelayMilliseconds: string;
  acquisitionTimeoutSeconds: string;
};

export type ChatGptWebLoginProxyPanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebLoginProxyPanelProps = {
  active?: boolean;
  disabled?: boolean;
  connectionGenerationKey?: string;
  externalSaving?: boolean;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-login-proxy-expanded';
const ALLOWED_SCHEMES = new Set(['http', 'https', 'socks5', 'socks5h']);

const DEFAULT_DRAFT: LoginProxyDraft = {
  enabled: false,
  urlTemplate: '',
  placeholderCharset: '',
  rotateOnRetry: true,
  requestAttempts: '3',
  flowAttempts: '2',
  retryDelayMilliseconds: '800',
  acquisitionTimeoutSeconds: '90',
};

const NUMERIC_FIELDS = [
  {
    field: 'requestAttempts',
    configKey: 'request-attempts',
    labelKey: 'request_attempts',
    min: 1,
    max: 10,
  },
  {
    field: 'flowAttempts',
    configKey: 'flow-attempts',
    labelKey: 'flow_attempts',
    min: 1,
    max: 5,
  },
  {
    field: 'retryDelayMilliseconds',
    configKey: 'retry-delay-milliseconds',
    labelKey: 'retry_delay',
    min: 0,
    max: 10_000,
  },
  {
    field: 'acquisitionTimeoutSeconds',
    configKey: 'acquisition-timeout-seconds',
    labelKey: 'acquisition_timeout',
    min: 30,
    max: 600,
  },
] as const;

const toDraft = (config: ChatGptWebLoginProxyConfig): LoginProxyDraft => ({
  enabled: config.enabled,
  urlTemplate: config['url-template'],
  placeholderCharset: config['placeholder-charset'],
  rotateOnRetry: config['rotate-on-retry'],
  requestAttempts: String(config['request-attempts']),
  flowAttempts: String(config['flow-attempts']),
  retryDelayMilliseconds: String(config['retry-delay-milliseconds']),
  acquisitionTimeoutSeconds: String(config['acquisition-timeout-seconds']),
});

const parseInteger = (value: string, min: number, max: number): number | null => {
  const normalized = value.trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const validateTemplate = (value: string, required: boolean): string | null => {
  const template = value.trim();
  if (!template) {
    return required ? 'chatgpt_web.login_proxy.validation_template_required' : null;
  }
  const schemeMatch = template.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (!schemeMatch || !ALLOWED_SCHEMES.has(schemeMatch[1].toLowerCase())) {
    return 'chatgpt_web.login_proxy.validation_template_scheme';
  }
  const authorityStart = schemeMatch[0].length;
  const suffixOffset = template.slice(authorityStart).search(/[/?#]/);
  const authorityEnd = suffixOffset < 0 ? template.length : authorityStart + suffixOffset;
  if (authorityEnd !== template.length) {
    return 'chatgpt_web.login_proxy.validation_template_url';
  }
  const authority = template.slice(authorityStart, authorityEnd);
  const userInfoEnd = authority.lastIndexOf('@');
  const placeholderPattern = /\{([^{}]*)\}/g;
  const matchedRanges: Array<[number, number]> = [];
  let placeholderMatch: RegExpExecArray | null;
  while ((placeholderMatch = placeholderPattern.exec(template)) !== null) {
    const length = Number(placeholderMatch[1]);
    if (
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > 128 ||
      userInfoEnd < 0 ||
      placeholderMatch.index < authorityStart ||
      placeholderMatch.index >= authorityStart + userInfoEnd
    ) {
      return 'chatgpt_web.login_proxy.validation_template_url';
    }
    matchedRanges.push([placeholderMatch.index, placeholderPattern.lastIndex]);
  }
  for (let index = 0; index < template.length; index += 1) {
    if (
      (template[index] === '{' || template[index] === '}') &&
      !matchedRanges.some(([start, end]) => index >= start && index < end)
    ) {
      return 'chatgpt_web.login_proxy.validation_template_url';
    }
  }
  try {
    const expanded = template.replace(/\{\d+\}/g, 'x');
    const parsed = new URL(expanded);
    const expandedAuthority = expanded.slice(authorityStart);
    const hostPort = expandedAuthority.slice(expandedAuthority.lastIndexOf('@') + 1);
    const portMatch = hostPort.match(/:(\d+)$/);
    const port = portMatch ? Number(portMatch[1]) : 0;
    if (!parsed.hostname || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      return 'chatgpt_web.login_proxy.validation_template_url';
    }
  } catch {
    return 'chatgpt_web.login_proxy.validation_template_url';
  }
  return null;
};

const validatePlaceholderCharset = (value: string): string | null => {
  const charset = value.trim();
  if (!charset) return null;
  return /^[A-Za-z0-9._~-]+$/.test(charset)
    ? null
    : 'chatgpt_web.login_proxy.validation_placeholder_charset';
};

const readConfig = (
  draft: LoginProxyDraft
): { config: ChatGptWebLoginProxyConfig | null; errors: string[] } => {
  const errors: string[] = [];
  const templateError = validateTemplate(draft.urlTemplate, draft.enabled);
  if (templateError) errors.push(templateError);
  const charsetError = validatePlaceholderCharset(draft.placeholderCharset);
  if (charsetError) errors.push(charsetError);
  const parsedNumbers = new Map<string, number>();
  for (const definition of NUMERIC_FIELDS) {
    const parsed = parseInteger(draft[definition.field], definition.min, definition.max);
    if (parsed === null) {
      errors.push(`chatgpt_web.login_proxy.validation_${definition.labelKey}`);
    } else {
      parsedNumbers.set(definition.configKey, parsed);
    }
  }
  if (errors.length > 0) return { config: null, errors };
  return {
    config: {
      enabled: draft.enabled,
      'url-template': draft.urlTemplate.trim(),
      'placeholder-charset': draft.placeholderCharset.trim(),
      'rotate-on-retry': draft.rotateOnRetry,
      'request-attempts': parsedNumbers.get('request-attempts') ?? 3,
      'flow-attempts': parsedNumbers.get('flow-attempts') ?? 2,
      'retry-delay-milliseconds': parsedNumbers.get('retry-delay-milliseconds') ?? 800,
      'acquisition-timeout-seconds': parsedNumbers.get('acquisition-timeout-seconds') ?? 90,
    },
    errors,
  };
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

export const ChatGptWebLoginProxyPanel = forwardRef<
  ChatGptWebLoginProxyPanelHandle,
  ChatGptWebLoginProxyPanelProps
>(function ChatGptWebLoginProxyPanel(
  {
    active = true,
    disabled = false,
    connectionGenerationKey = '',
    externalSaving = false,
    focusTarget,
    onDirtyChange,
    onErrorCountChange,
  },
  ref
) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const requestSequenceRef = useRef(0);
  const connectionGenerationKeyRef = useRef(connectionGenerationKey);
  const previousConnectionGenerationKeyRef = useRef(connectionGenerationKey);
  const snapshotGenerationKeyRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const snapshotRef = useRef<ChatGptWebLoginProxyConfig | null>(null);
  const draftVersionRef = useRef(0);
  if (connectionGenerationKeyRef.current !== connectionGenerationKey) {
    connectionGenerationKeyRef.current = connectionGenerationKey;
    requestSequenceRef.current += 1;
  }

  const [snapshot, setSnapshot] = useState<ChatGptWebLoginProxyConfig | null>(null);
  const [draft, setDraftState] = useState<LoginProxyDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [connectionConflict, setConnectionConflict] = useState(false);
  const [serverConfigConflict, setServerConfigConflict] = useState(false);
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const setDraft = useCallback(
    (next: LoginProxyDraft | ((current: LoginProxyDraft) => LoginProxyDraft)) => {
      setDraftState((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        draftVersionRef.current += 1;
        return resolved;
      });
    },
    []
  );

  const loadSnapshot = useCallback(
    async (options: { notify?: boolean; preserveDraft?: boolean } = {}) => {
      const requestSequence = ++requestSequenceRef.current;
      const requestGenerationKey = connectionGenerationKeyRef.current;
      const draftVersion = draftVersionRef.current;
      setLoading(true);
      try {
        const next = await chatGptWebApi.getLoginProxy();
        if (
          requestSequence !== requestSequenceRef.current ||
          requestGenerationKey !== connectionGenerationKeyRef.current
        ) {
          return null;
        }
        const previousSnapshot = snapshotRef.current;
        const preserveDraft = options.preserveDraft || draftVersion !== draftVersionRef.current;
        if (
          preserveDraft &&
          previousSnapshot &&
          JSON.stringify(toDraft(previousSnapshot)) !== JSON.stringify(toDraft(next))
        ) {
          setServerConfigConflict(true);
        }
        snapshotRef.current = next;
        setSnapshot(next);
        snapshotGenerationKeyRef.current = requestGenerationKey;
        if (!preserveDraft) {
          setDraft(toDraft(next));
          setConnectionConflict(false);
          setServerConfigConflict(false);
        }
        setUnsupported(false);
        setLoadError('');
        return next;
      } catch (error) {
        if (
          requestSequence !== requestSequenceRef.current ||
          requestGenerationKey !== connectionGenerationKeyRef.current
        ) {
          return null;
        }
        if (getErrorStatus(error) === 404) {
          setUnsupported(true);
          setLoadError('');
          return null;
        }
        const message = getChatGptWebErrorMessage(error, t);
        setLoadError(message);
        if (options.notify !== false) {
          showNotification(`${t('chatgpt_web.login_proxy.load_failed')}: ${message}`, 'error');
        }
        return null;
      } finally {
        if (
          requestSequence === requestSequenceRef.current &&
          requestGenerationKey === connectionGenerationKeyRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [setDraft, showNotification, t]
  );

  const parsedDraft = useMemo(() => readConfig(draft), [draft]);
  const snapshotDirty = snapshot
    ? JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot))
    : false;
  const dirty = connectionConflict || serverConfigConflict || snapshotDirty;
  const errorCount =
    parsedDraft.errors.length +
    (loadError ? 1 : 0) +
    (connectionConflict ? 1 : 0) +
    (serverConfigConflict ? 1 : 0);
  const controlsDisabled =
    disabled || externalSaving || loading || saving || unsupported || !snapshot;

  useEffect(() => {
    if (previousConnectionGenerationKeyRef.current !== connectionGenerationKey) {
      previousConnectionGenerationKeyRef.current = connectionGenerationKey;
      hasLoadedRef.current = false;
      snapshotRef.current = null;
      setSnapshot(null);
      snapshotGenerationKeyRef.current = null;
      if (!dirty) setDraft(DEFAULT_DRAFT);
      setLoading(false);
      setLoadError('');
      setUnsupported(false);
      setConnectionConflict(dirty);
      setServerConfigConflict(false);
    }
    if (disabled || !active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadSnapshot({ preserveDraft: dirty });
  }, [active, connectionGenerationKey, dirty, disabled, loadSnapshot, setDraft]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    []
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onErrorCountChange?.(errorCount);
    return () => onErrorCountChange?.(0);
  }, [errorCount, onErrorCountChange]);

  useEffect(() => {
    if (!focusTarget?.startsWith('config-chatgpt-web-login-proxy')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target = document.getElementById('config-chatgpt-web-login-proxy');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (
      connectionConflict ||
      serverConfigConflict ||
      snapshotGenerationKeyRef.current !== connectionGenerationKeyRef.current ||
      !snapshot ||
      !parsedDraft.config ||
      saving
    ) {
      return false;
    }
    const saveGenerationKey = connectionGenerationKeyRef.current;
    setSaving(true);
    try {
      await chatGptWebApi.patchLoginProxy(parsedDraft.config);
      if (saveGenerationKey !== connectionGenerationKeyRef.current) return false;
      const refreshed = await loadSnapshot({ notify: false });
      if (saveGenerationKey !== connectionGenerationKeyRef.current) return false;
      if (!refreshed) {
        snapshotRef.current = parsedDraft.config;
        setSnapshot(parsedDraft.config);
        setDraft(toDraft(parsedDraft.config));
        setServerConfigConflict(false);
        showNotification(t('chatgpt_web.login_proxy.saved_refresh_failed'), 'warning');
      }
      return true;
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.login_proxy.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    connectionConflict,
    dirty,
    loadSnapshot,
    parsedDraft.config,
    saving,
    serverConfigConflict,
    setDraft,
    showNotification,
    snapshot,
    t,
  ]);

  const handleReset = useCallback(() => {
    if (!snapshot) return;
    setDraft(toDraft(snapshot));
    setConnectionConflict(false);
    setServerConfigConflict(false);
  }, [setDraft, snapshot]);

  const runValidation = useCallback(() => {
    const valid =
      parsedDraft.config !== null && !connectionConflict && !serverConfigConflict && !unsupported;
    if (!valid) setExpanded(true);
    return valid;
  }, [connectionConflict, parsedDraft.config, serverConfigConflict, unsupported]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: async () => {
        if (disabled || (!active && !hasLoadedRef.current)) return;
        hasLoadedRef.current = true;
        await loadSnapshot({ notify: false, preserveDraft: dirty });
      },
      reset: handleReset,
      validate: runValidation,
    }),
    [active, dirty, disabled, handleReset, handleSave, loadSnapshot, runValidation]
  );

  const handleCopy = useCallback(async () => {
    const copied = await copyToClipboard(draft.urlTemplate);
    showNotification(
      t(copied ? 'chatgpt_web.login_proxy.copy_success' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  }, [draft.urlTemplate, showNotification, t]);

  const handleExpandedChange = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    localStorage.setItem(DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  return (
    <ConfigDisclosure
      id="config-chatgpt-web-login-proxy"
      title={t('chatgpt_web.login_proxy.title')}
      description={t('chatgpt_web.login_proxy.description')}
      summary={
        unsupported
          ? t('chatgpt_web.login_proxy.summary_unsupported')
          : draft.enabled
            ? t('chatgpt_web.login_proxy.summary_enabled')
            : t('chatgpt_web.login_proxy.summary_disabled')
      }
      expanded={dirty || expanded || errorCount > 0 || unsupported}
      onExpandedChange={handleExpandedChange}
      dirty={dirty}
      errorCount={errorCount}
      actions={
        dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={externalSaving || loading || saving || !snapshot}
            onClick={handleReset}
          >
            {t('chatgpt_web.login_proxy.reset')}
          </Button>
        ) : undefined
      }
    >
      <div className={styles.content}>
        {unsupported ? (
          <div className={styles.unsupported} role="status">
            <span>{t('chatgpt_web.login_proxy.unsupported')}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadSnapshot()}
              loading={loading}
              disabled={disabled || externalSaving}
            >
              <IconRefreshCw size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.toggleRow}>
              <div>
                <strong>{t('chatgpt_web.login_proxy.enabled')}</strong>
                <span>{t('chatgpt_web.login_proxy.enabled_description')}</span>
              </div>
              <ToggleSwitch
                checked={draft.enabled}
                onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
                disabled={controlsDisabled}
                ariaLabel={t('chatgpt_web.login_proxy.enabled')}
              />
            </div>

            <label className={styles.templateField} htmlFor="chatgpt-web-login-proxy-template">
              <span>{t('chatgpt_web.login_proxy.url_template')}</span>
              <div className={styles.templateInputRow}>
                <input
                  id="chatgpt-web-login-proxy-template"
                  type="text"
                  value={draft.urlTemplate}
                  placeholder={t('chatgpt_web.login_proxy.url_template_placeholder')}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, urlTemplate: event.target.value }))
                  }
                  disabled={controlsDisabled}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopy()}
                  disabled={controlsDisabled || !draft.urlTemplate}
                >
                  {t('chatgpt_web.login_proxy.copy')}
                </Button>
              </div>
              <small>{t('chatgpt_web.login_proxy.url_template_hint')}</small>
            </label>

            <div className={styles.toggleRow}>
              <div>
                <strong>{t('chatgpt_web.login_proxy.rotate_on_retry')}</strong>
                <span>{t('chatgpt_web.login_proxy.rotate_on_retry_description')}</span>
              </div>
              <ToggleSwitch
                checked={draft.rotateOnRetry}
                onChange={(rotateOnRetry) => setDraft((current) => ({ ...current, rotateOnRetry }))}
                disabled={controlsDisabled}
                ariaLabel={t('chatgpt_web.login_proxy.rotate_on_retry')}
              />
            </div>

            <div className={styles.settingsGrid}>
              <label htmlFor="chatgpt-web-login-proxy-charset">
                <span>{t('chatgpt_web.login_proxy.placeholder_charset')}</span>
                <input
                  id="chatgpt-web-login-proxy-charset"
                  type="text"
                  value={draft.placeholderCharset}
                  placeholder={t('chatgpt_web.login_proxy.placeholder_charset_placeholder')}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      placeholderCharset: event.target.value,
                    }))
                  }
                  disabled={controlsDisabled}
                  autoComplete="off"
                  spellCheck={false}
                />
                <small>{t('chatgpt_web.login_proxy.placeholder_charset_hint')}</small>
              </label>
              {NUMERIC_FIELDS.map((definition) => (
                <label
                  key={definition.field}
                  htmlFor={`chatgpt-web-login-proxy-${definition.field}`}
                >
                  <span>{t(`chatgpt_web.login_proxy.${definition.labelKey}`)}</span>
                  <input
                    id={`chatgpt-web-login-proxy-${definition.field}`}
                    type="number"
                    min={definition.min}
                    max={definition.max}
                    step={1}
                    value={draft[definition.field]}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [definition.field]: event.target.value,
                      }))
                    }
                    disabled={controlsDisabled}
                  />
                  <small>
                    {t(`chatgpt_web.login_proxy.${definition.labelKey}_hint`, {
                      min: definition.min,
                      max: definition.max,
                    })}
                  </small>
                </label>
              ))}
            </div>

            <p className={styles.securityNotice}>{t('chatgpt_web.login_proxy.security_notice')}</p>
          </>
        )}

        {parsedDraft.errors.map((errorKey) => (
          <p key={errorKey} className={styles.validationError} role="alert">
            {t(errorKey)}
          </p>
        ))}
        {connectionConflict ? (
          <p className={styles.validationError} role="alert">
            {t('chatgpt_web.login_proxy.connection_changed_draft_retained')}
          </p>
        ) : null}
        {serverConfigConflict ? (
          <p className={styles.validationError} role="alert">
            {t('chatgpt_web.login_proxy.server_configuration_changed_draft_retained')}
          </p>
        ) : null}
        {loadError ? (
          <p className={styles.validationError} role="alert">
            {t('chatgpt_web.login_proxy.load_failed')}: {loadError}
          </p>
        ) : null}
        {!snapshot && loading && !unsupported ? (
          <div className={styles.loading}>
            <LoadingSpinner size={18} />
            <span>{t('chatgpt_web.login_proxy.loading')}</span>
          </div>
        ) : null}
      </div>
    </ConfigDisclosure>
  );
});
