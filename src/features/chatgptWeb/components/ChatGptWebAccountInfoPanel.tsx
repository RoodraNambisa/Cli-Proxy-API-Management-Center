import {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw, IconTrash2 } from '@/components/ui/icons';
import { apiClient, chatGptWebApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type {
  ChatGptWebAccountInfoConfig,
  ChatGptWebAccountInfoConfigPatch,
  ChatGptWebAccountInfoDiagnosticRecord,
  ChatGptWebAccountInfoDiagnosticsSnapshot,
  ChatGptWebAccountInfoRawQuotaRecord,
  ChatGptWebAccountInfoRawQuotaSnapshot,
  ChatGptWebAccountInfoSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import { formatDateTime } from '@/utils/format';
import {
  clearChatGptWebAccountInfoUnsupported,
  isChatGptWebAccountInfoUnsupported,
  markChatGptWebAccountInfoUnsupported,
  subscribeChatGptWebAccountInfoCapability,
} from '../accountInfoCapability';
import styles from './ChatGptWebSentinelPanel.module.scss';

type AccountInfoDraft = {
  autoRefreshEnabled: boolean;
  diagnosticsEnabled: boolean;
  rawQuotaResponseEnabled: boolean;
  periodicMinutes: string;
  workers: string;
  queueSize: string;
  ttlMinutes: string;
  jitterSeconds: string;
  maxRetries: string;
};

type AccountInfoField = keyof AccountInfoDraft;
type AccountInfoNumericField = Exclude<
  AccountInfoField,
  'autoRefreshEnabled' | 'diagnosticsEnabled' | 'rawQuotaResponseEnabled'
>;
type AccountInfoValidationErrors = Partial<Record<AccountInfoNumericField, string>>;

type ConnectionGeneration = {
  key: string;
  version: number;
};

export type ChatGptWebAccountInfoPanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebAccountInfoPanelProps = {
  active?: boolean;
  disabled?: boolean;
  connectionGenerationKey?: string;
  externalSaving?: boolean;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-account-info-expanded';
const DIAGNOSTICS_DISCLOSURE_STORAGE_KEY =
  'config-management:chatgpt-web-account-info-diagnostics-expanded';
const RAW_QUOTA_DISCLOSURE_STORAGE_KEY =
  'config-management:chatgpt-web-account-info-raw-quota-expanded';
const POLL_INTERVAL_MS = 5000;

const safeRuntimeCount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
};

const safeRuntimeLimit = (value: unknown): string => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed).toLocaleString() : '—';
};

const ACCOUNT_INFO_FIELDS = [
  {
    field: 'periodicMinutes',
    labelKey: 'periodic_refresh_minutes',
    configKey: 'periodic-refresh-minutes',
    min: 0,
    max: 10080,
    errorKey: 'chatgpt_web.account_info.validation_periodic',
  },
  {
    field: 'workers',
    labelKey: 'refresh_workers',
    configKey: 'refresh-workers',
    min: 1,
    max: 32,
    errorKey: 'chatgpt_web.account_info.validation_workers',
  },
  {
    field: 'queueSize',
    labelKey: 'refresh_queue_size',
    configKey: 'refresh-queue-size',
    min: 0,
    max: 10000,
    errorKey: 'chatgpt_web.account_info.validation_queue_size',
  },
  {
    field: 'ttlMinutes',
    labelKey: 'refresh_ttl_minutes',
    configKey: 'refresh-ttl-minutes',
    min: 1,
    max: 1440,
    errorKey: 'chatgpt_web.account_info.validation_ttl',
  },
  {
    field: 'jitterSeconds',
    labelKey: 'recovery_jitter_seconds',
    configKey: 'recovery-jitter-seconds',
    min: 0,
    max: 300,
    errorKey: 'chatgpt_web.account_info.validation_jitter',
  },
  {
    field: 'maxRetries',
    labelKey: 'max_retries',
    configKey: 'max-retries',
    min: 0,
    max: 10,
    errorKey: 'chatgpt_web.account_info.validation_retries',
  },
] as const satisfies ReadonlyArray<{
  field: AccountInfoNumericField;
  labelKey: string;
  configKey: keyof ChatGptWebAccountInfoConfig;
  min: number;
  max: number;
  errorKey: string;
}>;

const DEFAULT_DRAFT: AccountInfoDraft = {
  autoRefreshEnabled: true,
  diagnosticsEnabled: false,
  rawQuotaResponseEnabled: false,
  periodicMinutes: '',
  workers: '4',
  queueSize: '256',
  ttlMinutes: '15',
  jitterSeconds: '30',
  maxRetries: '3',
};

const toDraft = (snapshot: ChatGptWebAccountInfoSnapshot): AccountInfoDraft => {
  const periodicMinutes = snapshot.config['periodic-refresh-minutes'];
  return {
    autoRefreshEnabled: snapshot.config['auto-refresh-enabled'] !== false,
    diagnosticsEnabled: snapshot.config['diagnostics-enabled'] === true,
    rawQuotaResponseEnabled: snapshot.config['raw-quota-response-enabled'] === true,
    periodicMinutes:
      typeof periodicMinutes === 'number' && periodicMinutes > 0 ? String(periodicMinutes) : '',
    workers: String(snapshot.config['refresh-workers']),
    queueSize: String(snapshot.config['refresh-queue-size']),
    ttlMinutes: String(snapshot.config['refresh-ttl-minutes']),
    jitterSeconds: String(snapshot.config['recovery-jitter-seconds']),
    maxRetries: String(snapshot.config['max-retries']),
  };
};

const parseInteger = (value: string, min: number, max: number): number | null => {
  const normalized = value.trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const readConfig = (
  draft: AccountInfoDraft
): {
  config: ChatGptWebAccountInfoConfig | null;
  errors: AccountInfoValidationErrors;
} => {
  const errors: AccountInfoValidationErrors = {};
  const parsed = {
    'auto-refresh-enabled': draft.autoRefreshEnabled,
    'diagnostics-enabled': draft.diagnosticsEnabled,
    'raw-quota-response-enabled': draft.rawQuotaResponseEnabled,
  } as ChatGptWebAccountInfoConfig;
  for (const definition of ACCOUNT_INFO_FIELDS) {
    const rawValue = draft[definition.field];
    const value =
      definition.field === 'periodicMinutes' && rawValue.trim() === ''
        ? 0
        : parseInteger(rawValue, definition.min, definition.max);
    if (value === null) {
      errors[definition.field] = definition.errorKey;
    } else {
      parsed[definition.configKey] = value;
    }
  }
  return {
    config: Object.keys(errors).length === 0 ? parsed : null,
    errors,
  };
};

const buildPatch = (
  next: ChatGptWebAccountInfoConfig,
  dirtyFields: ReadonlySet<AccountInfoField>
): ChatGptWebAccountInfoConfigPatch => {
  const patch: ChatGptWebAccountInfoConfigPatch = {};
  if (dirtyFields.has('autoRefreshEnabled')) {
    patch['auto-refresh-enabled'] = next['auto-refresh-enabled'];
  }
  if (dirtyFields.has('diagnosticsEnabled')) {
    patch['diagnostics-enabled'] = next['diagnostics-enabled'];
  }
  if (dirtyFields.has('rawQuotaResponseEnabled')) {
    patch['raw-quota-response-enabled'] = next['raw-quota-response-enabled'];
  }
  for (const definition of ACCOUNT_INFO_FIELDS) {
    if (dirtyFields.has(definition.field)) {
      patch[definition.configKey] = next[definition.configKey];
    }
  }
  return patch;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

type DiagnosticContentBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: unknown;
};

class DiagnosticContentBoundary extends Component<
  DiagnosticContentBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: DiagnosticContentBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const isSameGeneration = (
  left: ConnectionGeneration | null,
  right: ConnectionGeneration | null
): boolean =>
  left !== null && right !== null && left.key === right.key && left.version === right.version;

function DiagnosticRecord({ record }: { record: ChatGptWebAccountInfoDiagnosticRecord }) {
  const { t } = useTranslation();
  const remainingRange = (() => {
    if (typeof record.last_remaining !== 'number') return '';
    if (
      typeof record.min_remaining === 'number' &&
      typeof record.max_remaining === 'number' &&
      record.min_remaining !== record.max_remaining
    ) {
      return `${record.min_remaining} – ${record.max_remaining} (${t(
        'chatgpt_web.account_info.diagnostics.latest_value',
        { value: record.last_remaining }
      )})`;
    }
    return String(record.last_remaining);
  })();
  const candidateFields: Array<[string, string | number]> = [
    ['phase', record.phase],
    ['stage', record.stage],
    ['reason', record.reason],
    ['error_type', record.error_type ?? ''],
    ['http_status', record.http_status ?? ''],
    ['content_type', record.content_type ?? ''],
    [
      'cloudflare',
      typeof record.cloudflare === 'boolean'
        ? t(record.cloudflare ? 'common.yes' : 'common.no')
        : '',
    ],
    ['body_kind', record.body_kind ?? ''],
    ['accounts_kind', record.accounts_kind ?? ''],
    [
      'limits_progress',
      record.limits_progress_kind
        ? `${record.limits_progress_kind} (${record.limits_progress_count ?? 0})`
        : '',
    ],
    [
      'image_quota_feature_present',
      typeof record.image_quota_feature_present === 'boolean'
        ? t(record.image_quota_feature_present ? 'common.yes' : 'common.no')
        : '',
    ],
    ['image_quota_remaining_kind', record.image_quota_remaining_kind ?? ''],
    ['remaining_range', remainingRange],
    [
      'image_quota_reset_after',
      record.image_quota_reset_after ? formatDateTime(record.image_quota_reset_after) : '',
    ],
    ['error_envelope_kind', record.error_envelope_kind ?? ''],
    ['response_bytes', record.response_bytes],
    ['content_length', record.content_length ?? ''],
    ['upstream_error_code', record.upstream_error_code ?? ''],
    ['error_message', record.error_message ?? ''],
    ['first_seen', formatDateTime(record.first_seen)],
    ['last_seen', formatDateTime(record.last_seen)],
    ['last_auth_index', record.last_auth_index ?? ''],
    ['last_attempt', record.last_attempt ?? ''],
  ];
  const fields = candidateFields.filter(([, value]) => value !== '');

  return (
    <article className={styles.diagnosticRecord}>
      <header>
        <div>
          <strong>{record.reason}</strong>
          <span>
            {record.phase} · {record.stage}
          </span>
        </div>
        <span className={styles.diagnosticCount}>
          {t('chatgpt_web.account_info.diagnostics.count', { count: record.count })}
        </span>
      </header>
      <dl className={styles.diagnosticDetails}>
        {fields.map(([key, value]) => (
          <div key={key} data-field={key}>
            <dt>{t(`chatgpt_web.account_info.diagnostics.fields.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {record.response_body ? (
        <>
          <div className={styles.diagnosticBodyLabel}>
            {t('chatgpt_web.account_info.diagnostics.fields.response_body')}
            {record.response_body_truncated
              ? ` · ${t('chatgpt_web.account_info.diagnostics.response_body_truncated')}`
              : ''}
          </div>
          <pre className={styles.rawQuotaBody}>{record.response_body}</pre>
        </>
      ) : null}
    </article>
  );
}

function RawQuotaRecord({ record }: { record: ChatGptWebAccountInfoRawQuotaRecord }) {
  const { t } = useTranslation();
  const parsedQuota = record.parsed_quota;
  return (
    <article className={styles.diagnosticRecord}>
      <header>
        <div>
          <strong>{record.auth_index}</strong>
          <span>{formatDateTime(record.captured_at)}</span>
        </div>
        <span className={styles.diagnosticCount}>
          {record.http_status ?? t('chatgpt_web.account_info.raw_quota.unknown_status')}
        </span>
      </header>
      <dl className={styles.diagnosticDetails}>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.attempt')}</dt>
          <dd>{record.attempt ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.content_type')}</dt>
          <dd>{record.content_type || '—'}</dd>
        </div>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.response_bytes')}</dt>
          <dd>{record.response_bytes}</dd>
        </div>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.remaining')}</dt>
          <dd>{parsedQuota ? parsedQuota.remaining : '—'}</dd>
        </div>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.reset_at')}</dt>
          <dd>{parsedQuota?.reset_at ? formatDateTime(parsedQuota.reset_at) : '—'}</dd>
        </div>
        <div>
          <dt>{t('chatgpt_web.account_info.raw_quota.fields.parse_error')}</dt>
          <dd>{record.parse_error || '—'}</dd>
        </div>
      </dl>
      <pre className={styles.rawQuotaBody}>{record.body}</pre>
      {record.truncated ? (
        <p className={styles.rawQuotaNotice}>{t('chatgpt_web.account_info.raw_quota.truncated')}</p>
      ) : null}
    </article>
  );
}

export const ChatGptWebAccountInfoPanel = forwardRef<
  ChatGptWebAccountInfoPanelHandle,
  ChatGptWebAccountInfoPanelProps
>(function ChatGptWebAccountInfoPanel(
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
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionGenerationKeyRef = useRef(connectionGenerationKey);
  const connectionGenerationVersionRef = useRef(0);
  if (connectionGenerationKeyRef.current !== connectionGenerationKey) {
    connectionGenerationKeyRef.current = connectionGenerationKey;
    connectionGenerationVersionRef.current += 1;
  }
  const connectionGenerationVersion = connectionGenerationVersionRef.current;
  const availabilityGenerationRef = useRef({ active, disabled, version: 0 });
  if (
    availabilityGenerationRef.current.active !== active ||
    availabilityGenerationRef.current.disabled !== disabled
  ) {
    availabilityGenerationRef.current = {
      active,
      disabled,
      version: availabilityGenerationRef.current.version + 1,
    };
  }
  const requestSequenceRef = useRef(0);
  const requestInFlightRef = useRef<{
    background: boolean;
    preserveDirty: boolean;
    generation: ConnectionGeneration;
    abortController: AbortController;
    promise: Promise<ChatGptWebAccountInfoSnapshot | null>;
  } | null>(null);
  const saveRefreshAbortRef = useRef<AbortController | null>(null);
  const diagnosticsAbortRef = useRef<AbortController | null>(null);
  const diagnosticsLoadedRef = useRef(false);
  const rawQuotaAbortRef = useRef<AbortController | null>(null);
  const rawQuotaLoadedRef = useRef(false);
  const savingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const initiallyUnsupported = isChatGptWebAccountInfoUnsupported(connectionGenerationKey);
  const unsupportedRef = useRef(initiallyUnsupported);
  const snapshotRef = useRef<ChatGptWebAccountInfoSnapshot | null>(null);
  const snapshotGenerationRef = useRef<ConnectionGeneration | null>(null);
  const dirtyFieldsRef = useRef(new Set<AccountInfoField>());
  const generationConflictRef = useRef(false);
  const previousAvailabilityRef = useRef({
    active,
    disabled,
    connectionGenerationKey,
    connectionGenerationVersion,
  });
  const [snapshot, setSnapshot] = useState<ChatGptWebAccountInfoSnapshot | null>(null);
  const [snapshotGeneration, setSnapshotGeneration] = useState<ConnectionGeneration | null>(null);
  const [draft, setDraft] = useState<AccountInfoDraft>(DEFAULT_DRAFT);
  const [dirtyFields, setDirtyFields] = useState<Set<AccountInfoField>>(() => new Set());
  const [generationConflict, setGenerationConflict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [unsupported, setUnsupported] = useState(initiallyUnsupported);
  const [liveMessage, setLiveMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState<ChatGptWebAccountInfoDiagnosticsSnapshot | null>(
    null
  );
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsClearing, setDiagnosticsClearing] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [diagnosticsEndpointUnsupported, setDiagnosticsEndpointUnsupported] = useState(false);
  const [rawQuota, setRawQuota] = useState<ChatGptWebAccountInfoRawQuotaSnapshot | null>(null);
  const [rawQuotaLoading, setRawQuotaLoading] = useState(false);
  const [rawQuotaClearing, setRawQuotaClearing] = useState(false);
  const [rawQuotaError, setRawQuotaError] = useState('');
  const [rawQuotaEndpointUnsupported, setRawQuotaEndpointUnsupported] = useState(false);
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(
    () => localStorage.getItem(DIAGNOSTICS_DISCLOSURE_STORAGE_KEY) === 'true'
  );
  const [rawQuotaExpanded, setRawQuotaExpanded] = useState(
    () => localStorage.getItem(RAW_QUOTA_DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const replaceDirtyFields = useCallback((next: Set<AccountInfoField>) => {
    dirtyFieldsRef.current = next;
    setDirtyFields(next);
  }, []);

  const setUnsupportedState = useCallback((next: boolean) => {
    const generationKey = connectionGenerationKeyRef.current;
    if (next) {
      markChatGptWebAccountInfoUnsupported(generationKey);
    } else {
      clearChatGptWebAccountInfoUnsupported(generationKey);
    }
    unsupportedRef.current = next;
    setUnsupported(next);
  }, []);

  const setGenerationConflictState = useCallback((next: boolean) => {
    generationConflictRef.current = next;
    setGenerationConflict(next);
  }, []);

  const abortSnapshotRequest = useCallback(() => {
    const inFlight = requestInFlightRef.current;
    if (!inFlight) return;
    requestInFlightRef.current = null;
    inFlight.abortController.abort();
  }, []);

  const abortSaveRefresh = useCallback(() => {
    const abortController = saveRefreshAbortRef.current;
    if (!abortController) return;
    saveRefreshAbortRef.current = null;
    abortController.abort();
  }, []);

  const abortDiagnosticsRequest = useCallback(() => {
    const abortController = diagnosticsAbortRef.current;
    if (!abortController) return;
    diagnosticsAbortRef.current = null;
    abortController.abort();
  }, []);

  const abortRawQuotaRequest = useCallback(() => {
    const abortController = rawQuotaAbortRef.current;
    if (!abortController) return;
    rawQuotaAbortRef.current = null;
    abortController.abort();
  }, []);

  const readConnectionGeneration = useCallback(
    (): ConnectionGeneration => ({
      key: connectionGenerationKeyRef.current,
      version: connectionGenerationVersionRef.current,
    }),
    []
  );

  const isConnectionGenerationCurrent = useCallback(
    (generation: ConnectionGeneration): boolean =>
      isSameGeneration(generation, readConnectionGeneration()),
    [readConnectionGeneration]
  );

  const commitSnapshot = useCallback(
    (
      next: ChatGptWebAccountInfoSnapshot,
      generation: ConnectionGeneration,
      preserveDirty: boolean
    ): boolean => {
      if (!isConnectionGenerationCurrent(generation)) return false;
      const nextDraft = toDraft(next);
      snapshotRef.current = next;
      snapshotGenerationRef.current = generation;
      setSnapshot(next);
      setSnapshotGeneration(generation);
      setDiagnostics((current) =>
        current ? { ...current, enabled: nextDraft.diagnosticsEnabled } : current
      );
      setRawQuota((current) =>
        current ? { ...current, enabled: nextDraft.rawQuotaResponseEnabled } : current
      );
      if (preserveDirty && dirtyFieldsRef.current.size > 0) {
        setDraft((current) => {
          const merged = { ...current };
          for (const definition of ACCOUNT_INFO_FIELDS) {
            if (!dirtyFieldsRef.current.has(definition.field)) {
              merged[definition.field] = nextDraft[definition.field];
            }
          }
          if (!dirtyFieldsRef.current.has('autoRefreshEnabled')) {
            merged.autoRefreshEnabled = nextDraft.autoRefreshEnabled;
          }
          if (!dirtyFieldsRef.current.has('diagnosticsEnabled')) {
            merged.diagnosticsEnabled = nextDraft.diagnosticsEnabled;
          }
          if (!dirtyFieldsRef.current.has('rawQuotaResponseEnabled')) {
            merged.rawQuotaResponseEnabled = nextDraft.rawQuotaResponseEnabled;
          }
          return merged;
        });
      } else {
        replaceDirtyFields(new Set());
        setGenerationConflictState(false);
        setDraft(nextDraft);
      }
      return true;
    },
    [isConnectionGenerationCurrent, replaceDirtyFields, setGenerationConflictState]
  );

  const loadSnapshot = useCallback(
    async (
      options: {
        notify?: boolean;
        background?: boolean;
        retryUnsupported?: boolean;
        preserveDirty?: boolean;
      } = {}
    ): Promise<ChatGptWebAccountInfoSnapshot | null> => {
      const background = options.background === true;
      const preserveDirty = options.preserveDirty ?? background;
      const generation = readConnectionGeneration();
      if (options.retryUnsupported) {
        clearChatGptWebAccountInfoUnsupported(generation.key);
        if (unsupportedRef.current) setUnsupportedState(false);
      } else {
        const cachedUnsupported = isChatGptWebAccountInfoUnsupported(generation.key);
        if (cachedUnsupported && !unsupportedRef.current) setUnsupportedState(true);
        if (unsupportedRef.current || cachedUnsupported) return null;
      }
      const connection = apiClient.captureConnection();
      while (requestInFlightRef.current) {
        const inFlight = requestInFlightRef.current;
        if (!isSameGeneration(inFlight.generation, generation)) {
          abortSnapshotRequest();
          continue;
        }
        if (background || (!inFlight.background && inFlight.preserveDirty === preserveDirty)) {
          return inFlight.promise;
        }
        await inFlight.promise;
        if (!isConnectionGenerationCurrent(generation)) return null;
      }

      const abortController = new AbortController();
      const request = (async (): Promise<ChatGptWebAccountInfoSnapshot | null> => {
        const requestSequence = ++requestSequenceRef.current;
        if (!background) {
          setLoading(true);
          setLiveMessage(t('chatgpt_web.account_info.loading'));
        }
        try {
          const next = await chatGptWebApi.getAccountInfo(connection, abortController.signal);
          if (
            requestSequence !== requestSequenceRef.current ||
            !isConnectionGenerationCurrent(generation) ||
            !commitSnapshot(next, generation, preserveDirty)
          ) {
            return null;
          }
          setLoadError('');
          setUnsupportedState(false);
          if (!background) setLiveMessage(t('chatgpt_web.account_info.loaded'));
          return next;
        } catch (error) {
          if (abortController.signal.aborted) return null;
          if (
            requestSequence !== requestSequenceRef.current ||
            !isConnectionGenerationCurrent(generation)
          ) {
            return null;
          }
          if (getErrorStatus(error) === 404) {
            setUnsupportedState(true);
            setLoadError('');
            setLiveMessage(
              [
                t('chatgpt_web.account_info.unsupported'),
                snapshotRef.current ? t('chatgpt_web.account_info.unsupported_stale') : '',
              ]
                .filter(Boolean)
                .join(' ')
            );
            return null;
          }
          const message = getChatGptWebErrorMessage(error, t);
          setLoadError(message);
          setLiveMessage(
            [
              `${t('chatgpt_web.account_info.load_failed')}: ${message}`,
              snapshotRef.current ? t('chatgpt_web.account_info.stale') : '',
            ]
              .filter(Boolean)
              .join(' ')
          );
          if (options.notify !== false) {
            showNotification(`${t('chatgpt_web.account_info.load_failed')}: ${message}`, 'error');
          }
          return null;
        } finally {
          if (
            requestSequence === requestSequenceRef.current &&
            isConnectionGenerationCurrent(generation) &&
            !background
          ) {
            setLoading(false);
          }
        }
      })();

      requestInFlightRef.current = {
        background,
        preserveDirty,
        generation,
        abortController,
        promise: request,
      };
      try {
        return await request;
      } finally {
        if (requestInFlightRef.current?.promise === request) {
          requestInFlightRef.current = null;
        }
      }
    },
    [
      commitSnapshot,
      abortSnapshotRequest,
      isConnectionGenerationCurrent,
      readConnectionGeneration,
      setUnsupportedState,
      showNotification,
      t,
    ]
  );

  const loadDiagnostics = useCallback(
    async (notify = true): Promise<ChatGptWebAccountInfoDiagnosticsSnapshot | null> => {
      if (snapshotRef.current?.config['diagnostics-enabled'] === undefined) return null;
      const generation = readConnectionGeneration();
      const connection = apiClient.captureConnection();
      abortDiagnosticsRequest();
      const abortController = new AbortController();
      diagnosticsAbortRef.current = abortController;
      diagnosticsLoadedRef.current = true;
      setDiagnosticsLoading(true);
      setDiagnosticsError('');
      try {
        const next = await chatGptWebApi.getAccountInfoDiagnostics(
          connection,
          abortController.signal
        );
        if (abortController.signal.aborted || !isConnectionGenerationCurrent(generation)) {
          return null;
        }
        setDiagnostics(next);
        setDiagnosticsEndpointUnsupported(false);
        setLiveMessage(t('chatgpt_web.account_info.diagnostics.loaded'));
        return next;
      } catch (error) {
        if (abortController.signal.aborted || !isConnectionGenerationCurrent(generation)) {
          return null;
        }
        if (getErrorStatus(error) === 404) {
          setDiagnosticsEndpointUnsupported(true);
          setDiagnosticsError('');
          return null;
        }
        const message = getChatGptWebErrorMessage(error, t);
        setDiagnosticsError(message);
        if (notify) {
          showNotification(
            `${t('chatgpt_web.account_info.diagnostics.load_failed')}: ${message}`,
            'error'
          );
        }
        return null;
      } finally {
        if (diagnosticsAbortRef.current === abortController) {
          diagnosticsAbortRef.current = null;
          if (mountedRef.current && isConnectionGenerationCurrent(generation)) {
            setDiagnosticsLoading(false);
          }
        }
      }
    },
    [
      abortDiagnosticsRequest,
      isConnectionGenerationCurrent,
      readConnectionGeneration,
      showNotification,
      t,
    ]
  );

  const loadRawQuota = useCallback(
    async (notify = true): Promise<ChatGptWebAccountInfoRawQuotaSnapshot | null> => {
      if (snapshotRef.current?.config['raw-quota-response-enabled'] === undefined) return null;
      const generation = readConnectionGeneration();
      const connection = apiClient.captureConnection();
      abortRawQuotaRequest();
      const abortController = new AbortController();
      rawQuotaAbortRef.current = abortController;
      rawQuotaLoadedRef.current = true;
      setRawQuotaLoading(true);
      setRawQuotaError('');
      try {
        const next = await chatGptWebApi.getAccountInfoRawQuotaResponses(
          connection,
          abortController.signal
        );
        if (abortController.signal.aborted || !isConnectionGenerationCurrent(generation)) {
          return null;
        }
        setRawQuota(next);
        setRawQuotaEndpointUnsupported(false);
        setLiveMessage(t('chatgpt_web.account_info.raw_quota.loaded'));
        return next;
      } catch (error) {
        if (abortController.signal.aborted || !isConnectionGenerationCurrent(generation)) {
          return null;
        }
        if ([404, 501].includes(getErrorStatus(error) ?? 0)) {
          setRawQuotaEndpointUnsupported(true);
          setRawQuotaError('');
          return null;
        }
        const message = getChatGptWebErrorMessage(error, t);
        setRawQuotaError(message);
        if (notify) {
          showNotification(
            `${t('chatgpt_web.account_info.raw_quota.load_failed')}: ${message}`,
            'error'
          );
        }
        return null;
      } finally {
        if (rawQuotaAbortRef.current === abortController) {
          rawQuotaAbortRef.current = null;
          if (mountedRef.current && isConnectionGenerationCurrent(generation)) {
            setRawQuotaLoading(false);
          }
        }
      }
    },
    [
      abortRawQuotaRequest,
      isConnectionGenerationCurrent,
      readConnectionGeneration,
      showNotification,
      t,
    ]
  );

  useEffect(() => {
    const previous = previousAvailabilityRef.current;
    const connectionChanged = previous.connectionGenerationVersion !== connectionGenerationVersion;
    previousAvailabilityRef.current = {
      active,
      disabled,
      connectionGenerationKey,
      connectionGenerationVersion,
    };

    if (connectionChanged) {
      requestSequenceRef.current += 1;
      abortSnapshotRequest();
      abortSaveRefresh();
      abortDiagnosticsRequest();
      abortRawQuotaRequest();
      hasLoadedRef.current = false;
      diagnosticsLoadedRef.current = false;
      rawQuotaLoadedRef.current = false;
      snapshotGenerationRef.current = null;
      setSnapshotGeneration(null);
      setLoading(false);
      setLoadError('');
      setDiagnostics(null);
      setDiagnosticsError('');
      setDiagnosticsEndpointUnsupported(false);
      setDiagnosticsLoading(false);
      setDiagnosticsClearing(false);
      setRawQuota(null);
      setRawQuotaError('');
      setRawQuotaEndpointUnsupported(false);
      setRawQuotaLoading(false);
      setRawQuotaClearing(false);
      setUnsupportedState(isChatGptWebAccountInfoUnsupported(connectionGenerationKey));
      const retainedDirty = dirtyFieldsRef.current.size > 0 || savingRef.current;
      setGenerationConflictState(retainedDirty);
      setLiveMessage(
        retainedDirty
          ? t('chatgpt_web.account_info.connection_changed_draft_retained')
          : t('chatgpt_web.account_info.connection_changed_loading')
      );
    }
    if (!active || disabled) {
      requestSequenceRef.current += 1;
      abortSnapshotRequest();
      abortSaveRefresh();
      abortDiagnosticsRequest();
      abortRawQuotaRequest();
      setLoading(false);
      setDiagnosticsLoading(false);
      setRawQuotaLoading(false);
      return;
    }
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadSnapshot({
        notify: !connectionChanged,
        preserveDirty: dirtyFieldsRef.current.size > 0,
        retryUnsupported: false,
      });
      return;
    }
  }, [
    active,
    abortSaveRefresh,
    abortDiagnosticsRequest,
    abortRawQuotaRequest,
    abortSnapshotRequest,
    connectionGenerationKey,
    connectionGenerationVersion,
    disabled,
    loadSnapshot,
    readConnectionGeneration,
    setGenerationConflictState,
    setUnsupportedState,
    t,
  ]);

  const parsedDraft = useMemo(() => readConfig(draft), [draft]);
  const dirty = dirtyFields.size > 0;
  const generationReady = isSameGeneration(snapshotGeneration, {
    key: connectionGenerationKey,
    version: connectionGenerationVersion,
  });
  const errorCount =
    Object.keys(parsedDraft.errors).length + (loadError ? 1 : 0) + (generationConflict ? 1 : 0);
  const controlsDisabled =
    disabled ||
    externalSaving ||
    loading ||
    saving ||
    unsupported ||
    !snapshot ||
    !generationReady ||
    generationConflict;
  const periodicRefreshSupported = snapshot?.config['periodic-refresh-minutes'] !== undefined;
  const diagnosticsConfigSupported = snapshot?.config['diagnostics-enabled'] !== undefined;
  const diagnosticsSupported = diagnosticsConfigSupported && !diagnosticsEndpointUnsupported;
  const rawQuotaConfigSupported = snapshot?.config['raw-quota-response-enabled'] !== undefined;
  const rawQuotaSupported = rawQuotaConfigSupported && !rawQuotaEndpointUnsupported;
  const periodicMinutes = parseInteger(draft.periodicMinutes, 0, 10080);
  const periodicSummary =
    periodicMinutes !== null && periodicMinutes > 0
      ? t('chatgpt_web.account_info.periodic_every', { minutes: periodicMinutes })
      : t('chatgpt_web.account_info.periodic_off');
  const resetDisabled = externalSaving || saving;
  const diagnosticRecords = Array.isArray(diagnostics?.records) ? diagnostics.records : [];
  const rawQuotaRecords = Array.isArray(rawQuota?.records) ? rawQuota.records : [];
  const diagnosticsSummary = diagnostics
    ? t('chatgpt_web.account_info.diagnostics.summary_counts', {
        unique: diagnostics.unique_count,
        total: diagnostics.total_count,
        evicted: diagnostics.evicted_count,
      })
    : t(
        diagnosticsSupported
          ? draft.diagnosticsEnabled
            ? 'chatgpt_web.account_info.diagnostics.summary_enabled'
            : 'chatgpt_web.account_info.diagnostics.summary_disabled'
          : 'chatgpt_web.account_info.diagnostics.summary_unsupported'
      );
  const rawQuotaSummary = rawQuota
    ? t('chatgpt_web.account_info.raw_quota.summary_counts', {
        count: rawQuotaRecords.length,
        bytes: rawQuota.total_bytes,
        evicted: rawQuota.evicted_count,
      })
    : t(
        rawQuotaSupported
          ? draft.rawQuotaResponseEnabled
            ? 'chatgpt_web.account_info.raw_quota.summary_enabled'
            : 'chatgpt_web.account_info.raw_quota.summary_disabled'
          : 'chatgpt_web.account_info.raw_quota.summary_unsupported'
      );

  useEffect(() => {
    if (
      !diagnosticsExpanded ||
      !diagnosticsSupported ||
      diagnosticsLoadedRef.current ||
      disabled ||
      !active ||
      !generationReady
    ) {
      return;
    }
    void loadDiagnostics(false);
  }, [
    active,
    diagnosticsExpanded,
    diagnosticsSupported,
    disabled,
    generationReady,
    loadDiagnostics,
  ]);

  useEffect(() => {
    if (
      !rawQuotaExpanded ||
      !rawQuotaSupported ||
      rawQuotaLoadedRef.current ||
      disabled ||
      !active ||
      !generationReady
    ) {
      return;
    }
    void loadRawQuota(false);
  }, [active, disabled, generationReady, loadRawQuota, rawQuotaExpanded, rawQuotaSupported]);

  useEffect(() => {
    if (
      disabled ||
      unsupported ||
      loadError ||
      !active ||
      !expanded ||
      !hasLoadedRef.current ||
      !generationReady
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      if (savingRef.current || requestInFlightRef.current) return;
      void loadSnapshot({ notify: false, background: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, disabled, expanded, generationReady, loadError, loadSnapshot, unsupported]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      hasLoadedRef.current = false;
      requestSequenceRef.current += 1;
      abortSnapshotRequest();
      abortSaveRefresh();
      abortDiagnosticsRequest();
      abortRawQuotaRequest();
    };
  }, [abortDiagnosticsRequest, abortRawQuotaRequest, abortSaveRefresh, abortSnapshotRequest]);

  useEffect(() => {
    const synchronizeUnsupported = (key: string, nextUnsupported: boolean) => {
      if (key !== connectionGenerationKeyRef.current) return;
      unsupportedRef.current = nextUnsupported;
      setUnsupported(nextUnsupported);
      if (nextUnsupported) {
        requestSequenceRef.current += 1;
        abortSnapshotRequest();
        abortSaveRefresh();
        abortDiagnosticsRequest();
        abortRawQuotaRequest();
        setLoading(false);
        setDiagnosticsLoading(false);
        setRawQuotaLoading(false);
      }
    };
    synchronizeUnsupported(
      connectionGenerationKeyRef.current,
      isChatGptWebAccountInfoUnsupported(connectionGenerationKeyRef.current)
    );
    return subscribeChatGptWebAccountInfoCapability(synchronizeUnsupported);
  }, [abortDiagnosticsRequest, abortRawQuotaRequest, abortSaveRefresh, abortSnapshotRequest]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onErrorCountChange?.(errorCount);
    return () => onErrorCountChange?.(0);
  }, [errorCount, onErrorCountChange]);

  useEffect(() => {
    if (!focusTarget?.startsWith('config-chatgpt-web-account-info')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target = document.getElementById('config-chatgpt-web-account-info');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const saveGeneration = readConnectionGeneration();
    const saveConnection = apiClient.captureConnection();
    if (
      !mountedRef.current ||
      availabilityGenerationRef.current.disabled ||
      !snapshot ||
      !parsedDraft.config ||
      saving ||
      generationConflictRef.current ||
      !isSameGeneration(snapshotGenerationRef.current, saveGeneration)
    ) {
      setExpanded(true);
      return false;
    }
    const patch = buildPatch(parsedDraft.config, dirtyFieldsRef.current);
    if (Object.keys(patch).length === 0) {
      replaceDirtyFields(new Set());
      setGenerationConflictState(false);
      setDraft(toDraft(snapshotRef.current ?? snapshot));
      return true;
    }
    savingRef.current = true;
    setSaving(true);
    const commitPatchedSnapshot = (): boolean => {
      if (
        !mountedRef.current ||
        availabilityGenerationRef.current.disabled ||
        !isConnectionGenerationCurrent(saveGeneration)
      ) {
        return false;
      }
      const latestSnapshot = snapshotRef.current;
      if (!latestSnapshot || !isSameGeneration(snapshotGenerationRef.current, saveGeneration)) {
        return false;
      }
      return commitSnapshot(
        {
          ...latestSnapshot,
          config: { ...latestSnapshot.config, ...patch },
        },
        saveGeneration,
        false
      );
    };
    try {
      const inFlight = requestInFlightRef.current;
      if (inFlight && isSameGeneration(inFlight.generation, saveGeneration)) {
        await inFlight.promise;
      }
      if (
        !isConnectionGenerationCurrent(saveGeneration) ||
        generationConflictRef.current ||
        !isSameGeneration(snapshotGenerationRef.current, saveGeneration)
      ) {
        return false;
      }
      await chatGptWebApi.patchAccountInfo(patch, saveConnection);
      if (
        !mountedRef.current ||
        availabilityGenerationRef.current.disabled ||
        !isConnectionGenerationCurrent(saveGeneration)
      ) {
        return false;
      }
      if (!availabilityGenerationRef.current.active) {
        return commitPatchedSnapshot();
      }

      abortSaveRefresh();
      const refreshAbortController = new AbortController();
      saveRefreshAbortRef.current = refreshAbortController;
      try {
        const refreshed = await chatGptWebApi.getAccountInfo(
          saveConnection,
          refreshAbortController.signal
        );
        if (
          !mountedRef.current ||
          availabilityGenerationRef.current.disabled ||
          !isConnectionGenerationCurrent(saveGeneration) ||
          !commitSnapshot(refreshed, saveGeneration, false)
        ) {
          return false;
        }
        setLoadError('');
        setUnsupportedState(false);
        setLiveMessage(t('chatgpt_web.account_info.loaded'));
      } catch (refreshError) {
        if (refreshAbortController.signal.aborted) {
          return commitPatchedSnapshot();
        }
        if (
          !mountedRef.current ||
          availabilityGenerationRef.current.disabled ||
          !isConnectionGenerationCurrent(saveGeneration)
        ) {
          return false;
        }
        if (!commitPatchedSnapshot()) return false;
        const refreshMessage = getChatGptWebErrorMessage(refreshError, t);
        setLoadError(refreshMessage);
        if (getErrorStatus(refreshError) === 404) setUnsupportedState(true);
        setLiveMessage(
          [
            t('chatgpt_web.account_info.saved_refresh_failed'),
            t('chatgpt_web.account_info.stale'),
          ].join(' ')
        );
        showNotification(t('chatgpt_web.account_info.saved_refresh_failed'), 'warning');
      } finally {
        if (saveRefreshAbortRef.current === refreshAbortController) {
          saveRefreshAbortRef.current = null;
        }
      }
      return true;
    } catch (error) {
      if (!isConnectionGenerationCurrent(saveGeneration)) return false;
      showNotification(
        `${t('chatgpt_web.account_info.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [
    abortSaveRefresh,
    commitSnapshot,
    dirty,
    isConnectionGenerationCurrent,
    parsedDraft.config,
    readConnectionGeneration,
    replaceDirtyFields,
    saving,
    setGenerationConflictState,
    setUnsupportedState,
    showNotification,
    snapshot,
    t,
  ]);

  const handleReset = useCallback(() => {
    const latestSnapshot = snapshotRef.current ?? snapshot;
    replaceDirtyFields(new Set());
    setGenerationConflictState(false);
    setDraft(latestSnapshot ? toDraft(latestSnapshot) : DEFAULT_DRAFT);
    setLiveMessage(t('chatgpt_web.account_info.draft_discarded'));
  }, [replaceDirtyFields, setGenerationConflictState, snapshot, t]);

  const confirmRetainedDraft = useCallback(() => {
    const currentGeneration = readConnectionGeneration();
    if (
      !generationConflictRef.current ||
      !isSameGeneration(snapshotGenerationRef.current, currentGeneration)
    ) {
      return;
    }
    setGenerationConflictState(false);
    setLiveMessage(t('chatgpt_web.account_info.draft_confirmed'));
  }, [readConnectionGeneration, setGenerationConflictState, t]);

  const runValidation = useCallback(() => {
    const valid = parsedDraft.config !== null && generationReady && !generationConflictRef.current;
    if (!valid) {
      setExpanded(true);
      if (generationConflictRef.current) {
        window.setTimeout(() => {
          document.getElementById('chatgpt-web-account-info-confirm-draft')?.focus();
        }, 0);
      } else {
        const firstInvalid = ACCOUNT_INFO_FIELDS.find(
          (definition) => parsedDraft.errors[definition.field]
        );
        if (firstInvalid) {
          window.setTimeout(() => {
            document.getElementById(`chatgpt-web-account-info-${firstInvalid.field}`)?.focus();
          }, 0);
        }
      }
    }
    return valid;
  }, [generationReady, parsedDraft.config, parsedDraft.errors]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: async () => {
        if (disabled || (!active && !hasLoadedRef.current && dirtyFieldsRef.current.size === 0)) {
          return;
        }
        hasLoadedRef.current = true;
        const loaded = await loadSnapshot({
          notify: false,
          preserveDirty: false,
          retryUnsupported: true,
        });
        if (!loaded && dirtyFieldsRef.current.size > 0) {
          handleReset();
        }
      },
      reset: handleReset,
      validate: runValidation,
    }),
    [active, disabled, handleReset, handleSave, loadSnapshot, runValidation]
  );

  const handleExpandedChange = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    localStorage.setItem(DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  const handleDiagnosticsExpandedChange = useCallback((nextExpanded: boolean) => {
    setDiagnosticsExpanded(nextExpanded);
    localStorage.setItem(DIAGNOSTICS_DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  const handleRawQuotaExpandedChange = useCallback((nextExpanded: boolean) => {
    setRawQuotaExpanded(nextExpanded);
    localStorage.setItem(RAW_QUOTA_DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  const updateDraftField = useCallback(
    (field: AccountInfoNumericField, value: string) => {
      const latestSnapshot = snapshotRef.current;
      const baselineValue = latestSnapshot ? toDraft(latestSnapshot)[field] : undefined;
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      if (baselineValue === value) {
        nextDirtyFields.delete(field);
      } else {
        nextDirtyFields.add(field);
      }
      replaceDirtyFields(nextDirtyFields);
      if (nextDirtyFields.size === 0) setGenerationConflictState(false);
      setDraft((current) => ({ ...current, [field]: value }));
    },
    [replaceDirtyFields, setGenerationConflictState]
  );

  const updateAutoRefreshEnabled = useCallback(
    (value: boolean) => {
      const baselineValue = snapshotRef.current
        ? toDraft(snapshotRef.current).autoRefreshEnabled
        : undefined;
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      if (baselineValue === value) {
        nextDirtyFields.delete('autoRefreshEnabled');
      } else {
        nextDirtyFields.add('autoRefreshEnabled');
      }
      replaceDirtyFields(nextDirtyFields);
      if (nextDirtyFields.size === 0) setGenerationConflictState(false);
      setDraft((current) => ({ ...current, autoRefreshEnabled: value }));
    },
    [replaceDirtyFields, setGenerationConflictState]
  );

  const updateDiagnosticsEnabled = useCallback(
    (value: boolean) => {
      const baselineValue = snapshotRef.current
        ? toDraft(snapshotRef.current).diagnosticsEnabled
        : undefined;
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      if (baselineValue === value) {
        nextDirtyFields.delete('diagnosticsEnabled');
      } else {
        nextDirtyFields.add('diagnosticsEnabled');
      }
      replaceDirtyFields(nextDirtyFields);
      if (nextDirtyFields.size === 0) setGenerationConflictState(false);
      setDraft((current) => ({ ...current, diagnosticsEnabled: value }));
    },
    [replaceDirtyFields, setGenerationConflictState]
  );

  const updateRawQuotaResponseEnabled = useCallback(
    (value: boolean) => {
      const baselineValue = snapshotRef.current
        ? toDraft(snapshotRef.current).rawQuotaResponseEnabled
        : undefined;
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      if (baselineValue === value) {
        nextDirtyFields.delete('rawQuotaResponseEnabled');
      } else {
        nextDirtyFields.add('rawQuotaResponseEnabled');
      }
      replaceDirtyFields(nextDirtyFields);
      if (nextDirtyFields.size === 0) setGenerationConflictState(false);
      setDraft((current) => ({ ...current, rawQuotaResponseEnabled: value }));
    },
    [replaceDirtyFields, setGenerationConflictState]
  );

  const handleClearDiagnostics = useCallback(() => {
    if (!diagnosticsSupported || diagnosticsClearing) return;
    const clearGeneration = readConnectionGeneration();
    const clearConnection = apiClient.captureConnection();
    showConfirmation({
      title: t('chatgpt_web.account_info.diagnostics.clear_title'),
      message: t('chatgpt_web.account_info.diagnostics.clear_confirm'),
      confirmText: t('chatgpt_web.account_info.diagnostics.clear_button'),
      variant: 'danger',
      onConfirm: async () => {
        if (!isConnectionGenerationCurrent(clearGeneration)) return;
        setDiagnosticsClearing(true);
        try {
          const next = await chatGptWebApi.clearAccountInfoDiagnostics(clearConnection);
          if (!isConnectionGenerationCurrent(clearGeneration)) return;
          diagnosticsLoadedRef.current = true;
          setDiagnostics(next);
          setDiagnosticsError('');
          showNotification(t('chatgpt_web.account_info.diagnostics.clear_success'), 'success');
        } catch (error) {
          if (!isConnectionGenerationCurrent(clearGeneration)) return;
          showNotification(
            `${t('chatgpt_web.account_info.diagnostics.clear_failed')}: ${getChatGptWebErrorMessage(
              error,
              t
            )}`,
            'error'
          );
        } finally {
          if (mountedRef.current && isConnectionGenerationCurrent(clearGeneration)) {
            setDiagnosticsClearing(false);
          }
        }
      },
    });
  }, [
    diagnosticsClearing,
    diagnosticsSupported,
    isConnectionGenerationCurrent,
    readConnectionGeneration,
    showConfirmation,
    showNotification,
    t,
  ]);

  const handleClearRawQuota = useCallback(() => {
    if (!rawQuotaSupported || rawQuotaClearing) return;
    const clearGeneration = readConnectionGeneration();
    const clearConnection = apiClient.captureConnection();
    showConfirmation({
      title: t('chatgpt_web.account_info.raw_quota.clear_title'),
      message: t('chatgpt_web.account_info.raw_quota.clear_confirm'),
      confirmText: t('chatgpt_web.account_info.raw_quota.clear_button'),
      variant: 'danger',
      onConfirm: async () => {
        if (!isConnectionGenerationCurrent(clearGeneration)) return;
        setRawQuotaClearing(true);
        try {
          const next = await chatGptWebApi.clearAccountInfoRawQuotaResponses(clearConnection);
          if (!isConnectionGenerationCurrent(clearGeneration)) return;
          rawQuotaLoadedRef.current = true;
          setRawQuota(next);
          setRawQuotaError('');
          showNotification(t('chatgpt_web.account_info.raw_quota.clear_success'), 'success');
        } catch (error) {
          if (!isConnectionGenerationCurrent(clearGeneration)) return;
          showNotification(
            `${t('chatgpt_web.account_info.raw_quota.clear_failed')}: ${getChatGptWebErrorMessage(
              error,
              t
            )}`,
            'error'
          );
        } finally {
          if (mountedRef.current && isConnectionGenerationCurrent(clearGeneration)) {
            setRawQuotaClearing(false);
          }
        }
      },
    });
  }, [
    isConnectionGenerationCurrent,
    rawQuotaClearing,
    rawQuotaSupported,
    readConnectionGeneration,
    showConfirmation,
    showNotification,
    t,
  ]);

  const statusItems = snapshot
    ? [
        { key: 'busy', value: `${snapshot.runtime.busy} / ${snapshot.config['refresh-workers']}` },
        {
          key: 'immediate_queued',
          value: snapshot.runtime.immediate_queued ?? snapshot.runtime.queued,
        },
        { key: 'task_retry_scheduled', value: snapshot.runtime.task_retry_scheduled ?? 0 },
        {
          key: 'transient_recovery_scheduled',
          value: snapshot.runtime.transient_recovery_scheduled ?? 0,
        },
        { key: 'quota_recovery_scheduled', value: snapshot.runtime.quota_recovery_scheduled ?? 0 },
        {
          key: 'periodic_review_scheduled',
          value: snapshot.runtime.periodic_review_scheduled ?? 0,
        },
        { key: 'inflight', value: snapshot.runtime.inflight },
        ...(snapshot.runtime.background_relogin
          ? [
              {
                key: 'background_relogin_queued',
                value: snapshot.runtime.background_relogin.queued,
              },
              {
                key: 'background_relogin_delayed',
                value: snapshot.runtime.background_relogin.delayed,
              },
              {
                key: 'background_relogin_running',
                value: snapshot.runtime.background_relogin.running,
              },
            ]
          : []),
        {
          key: 'max_automatic_attempts',
          value: snapshot.runtime.max_automatic_attempts ?? snapshot.config['max-retries'] + 1,
        },
        { key: 'refresh_count', value: snapshot.runtime.refresh_count },
        { key: 'retry_count', value: snapshot.runtime.retry_count },
        { key: 'failed_count', value: snapshot.runtime.failed_count },
        {
          key: 'last_failure_at',
          value: snapshot.runtime.last_failure_at
            ? formatDateTime(snapshot.runtime.last_failure_at)
            : '—',
        },
        {
          key: 'last_success_at',
          value: snapshot.runtime.last_success_at
            ? formatDateTime(snapshot.runtime.last_success_at)
            : '—',
        },
        {
          key: 'last_failure',
          value:
            snapshot.runtime.last_failure ||
            snapshot.runtime.last_error ||
            t('chatgpt_web.account_info.no_error'),
        },
      ]
    : [];
  const recoveryStateCounts = Object.entries(snapshot?.runtime.recovery_state_counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  const failureCounts = Object.entries(snapshot?.runtime.failure_counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  const requestRefreshRuntime = snapshot?.runtime.request_refresh;
  const backgroundReloginRuntime = snapshot?.runtime.background_relogin;
  const requestRefreshItems = requestRefreshRuntime
    ? [
        ['received', requestRefreshRuntime.received],
        ['queued', requestRefreshRuntime.queued],
        ['running', requestRefreshRuntime.running],
        ['scheduler_blocked', requestRefreshRuntime.scheduler_blocked],
        ['deduplicated', requestRefreshRuntime.deduplicated],
        ['succeeded', requestRefreshRuntime.succeeded],
        ['failed', requestRefreshRuntime.failed],
        ['backpressured', requestRefreshRuntime.backpressured],
        ['no_start', requestRefreshRuntime.no_start],
        ['same_token', requestRefreshRuntime.same_token],
        ['probe_succeeded', requestRefreshRuntime.probe_succeeded],
        ['probe_unauthorized', requestRefreshRuntime.probe_unauthorized],
        ['probe_transient', requestRefreshRuntime.probe_transient],
        ['dead_confirmed', requestRefreshRuntime.dead_confirmed],
      ]
    : [];
  const backgroundReloginItems = backgroundReloginRuntime
    ? [
        [
          'workers',
          `${safeRuntimeCount(
            backgroundReloginRuntime.workers ?? backgroundReloginRuntime.running
          )} / ${safeRuntimeLimit(backgroundReloginRuntime.worker_limit)}`,
        ],
        [
          'queue',
          `${
            safeRuntimeCount(backgroundReloginRuntime.queued) +
            safeRuntimeCount(backgroundReloginRuntime.delayed)
          } / ${safeRuntimeLimit(backgroundReloginRuntime.queue_limit)}`,
        ],
        ['running', backgroundReloginRuntime.running],
        ['deduplicated', backgroundReloginRuntime.deduplicated],
        ['shrinking', backgroundReloginRuntime.shrinking ? t('common.yes') : t('common.no')],
        ['backpressured', backgroundReloginRuntime.backpressured],
        ['succeeded', backgroundReloginRuntime.succeeded],
        ['failed', backgroundReloginRuntime.failed],
        ['exhausted', backgroundReloginRuntime.exhausted],
        ['dead', backgroundReloginRuntime.dead],
        ['historical_eligible', backgroundReloginRuntime.historical_eligible],
        ['historical_blocked_by_method', backgroundReloginRuntime.historical_blocked_by_method],
        ['historical_cooling', backgroundReloginRuntime.historical_cooling],
        ['historical_exhausted', backgroundReloginRuntime.historical_exhausted],
      ]
    : [];
  const handleRuntimeRefresh = useCallback(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  return (
    <>
      <span className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>
      <ConfigDisclosure
        id="config-chatgpt-web-account-info"
        title={t('chatgpt_web.account_info.title')}
        description={t('chatgpt_web.account_info.description')}
        summary={t('chatgpt_web.account_info.summary', {
          state: t(
            draft.autoRefreshEnabled
              ? 'chatgpt_web.account_info.auto_refresh_on'
              : 'chatgpt_web.account_info.auto_refresh_off'
          ),
          workers: draft.workers,
          ttl: draft.ttlMinutes,
          periodic: periodicSummary,
        })}
        expanded={dirty || expanded || errorCount > 0}
        onExpandedChange={handleExpandedChange}
        dirty={dirty}
        errorCount={errorCount}
        actions={
          dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resetDisabled}
              onClick={handleReset}
            >
              {t('chatgpt_web.account_info.reset')}
            </Button>
          ) : undefined
        }
      >
        <div className={styles.embeddedContent} aria-busy={loading}>
          {generationConflict ? (
            <div className={styles.generationWarning} role="alert">
              <span>
                {generationReady
                  ? t('chatgpt_web.account_info.connection_changed_draft_retained')
                  : t('chatgpt_web.account_info.connection_changed_loading')}
              </span>
              <Button
                id="chatgpt-web-account-info-confirm-draft"
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  disabled || externalSaving || loading || saving || unsupported || !generationReady
                }
                onClick={confirmRetainedDraft}
              >
                {t('chatgpt_web.account_info.confirm_draft')}
              </Button>
            </div>
          ) : null}

          <div className={styles.runtimeRow}>
            <div>
              <strong>{t('chatgpt_web.account_info.auto_refresh_enabled')}</strong>
              <span>{t('chatgpt_web.account_info.auto_refresh_enabled_description')}</span>
            </div>
            <ToggleSwitch
              checked={draft.autoRefreshEnabled}
              onChange={updateAutoRefreshEnabled}
              disabled={controlsDisabled}
              ariaLabel={t('chatgpt_web.account_info.auto_refresh_enabled')}
            />
          </div>

          <div className={styles.runtimeRow}>
            <div>
              <strong>{t('chatgpt_web.account_info.raw_quota.enabled')}</strong>
              <span>{t('chatgpt_web.account_info.raw_quota.enabled_description')}</span>
              {!rawQuotaSupported ? (
                <span className={styles.validationError}>
                  {t('chatgpt_web.account_info.raw_quota.unsupported')}
                </span>
              ) : null}
            </div>
            <ToggleSwitch
              checked={draft.rawQuotaResponseEnabled}
              onChange={updateRawQuotaResponseEnabled}
              disabled={controlsDisabled || !rawQuotaSupported}
              ariaLabel={t('chatgpt_web.account_info.raw_quota.enabled')}
            />
          </div>

          <div className={styles.runtimeRow}>
            <div>
              <strong>{t('chatgpt_web.account_info.diagnostics.enabled')}</strong>
              <span>{t('chatgpt_web.account_info.diagnostics.enabled_description')}</span>
              {!diagnosticsSupported ? (
                <span className={styles.validationError}>
                  {t('chatgpt_web.account_info.diagnostics.unsupported')}
                </span>
              ) : null}
            </div>
            <ToggleSwitch
              checked={draft.diagnosticsEnabled}
              onChange={updateDiagnosticsEnabled}
              disabled={controlsDisabled || !diagnosticsSupported}
              ariaLabel={t('chatgpt_web.account_info.diagnostics.enabled')}
            />
          </div>

          <div className={styles.settingsGrid}>
            {ACCOUNT_INFO_FIELDS.map((definition) => {
              const inputId = `chatgpt-web-account-info-${definition.field}`;
              const hintId = `${inputId}-hint`;
              const errorId = `${inputId}-error`;
              const unsupportedId = `${inputId}-unsupported`;
              const errorKey = parsedDraft.errors[definition.field];
              const fieldUnsupported =
                definition.field === 'periodicMinutes' && !periodicRefreshSupported;
              return (
                <label key={definition.field} htmlFor={inputId}>
                  <span>{t(`chatgpt_web.account_info.${definition.labelKey}`)}</span>
                  <input
                    id={inputId}
                    type="number"
                    min={definition.min}
                    max={definition.max}
                    step={1}
                    value={draft[definition.field]}
                    onChange={(event) => updateDraftField(definition.field, event.target.value)}
                    disabled={controlsDisabled || fieldUnsupported}
                    aria-invalid={Boolean(errorKey)}
                    aria-describedby={[
                      hintId,
                      fieldUnsupported ? unsupportedId : '',
                      errorKey ? errorId : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  <small id={hintId}>
                    {t(`chatgpt_web.account_info.${definition.labelKey}_hint`)}
                  </small>
                  {fieldUnsupported ? (
                    <small id={unsupportedId}>
                      {t('chatgpt_web.account_info.periodic_unsupported')}
                    </small>
                  ) : null}
                  {errorKey ? (
                    <small id={errorId} className={styles.validationError} role="alert">
                      {t(errorKey)}
                    </small>
                  ) : null}
                </label>
              );
            })}
          </div>

          <div className={styles.statusHeading}>
            <div>
              <h3>{t('chatgpt_web.account_info.status_title')}</h3>
              <p>{t('chatgpt_web.account_info.status_description')}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRuntimeRefresh}
              loading={loading}
              disabled={
                disabled || externalSaving || saving || dirty || unsupported || generationConflict
              }
            >
              <IconRefreshCw size={15} />
              {t('common.refresh')}
            </Button>
          </div>

          {snapshot && (loadError || unsupported || !generationReady) ? (
            <div className={styles.statusEmpty}>
              <span>
                {unsupported
                  ? `${t('chatgpt_web.account_info.unsupported')} ${t(
                      'chatgpt_web.account_info.unsupported_stale_snapshot'
                    )}`
                  : !generationReady
                    ? t('chatgpt_web.account_info.connection_snapshot_stale')
                    : `${t('chatgpt_web.account_info.load_failed')}: ${loadError} ${t(
                        'chatgpt_web.account_info.stale_snapshot'
                      )}`}
              </span>
            </div>
          ) : null}

          {!snapshot ? (
            <div className={styles.statusEmpty}>
              {loading ? <LoadingSpinner size={18} /> : null}
              <span>
                {unsupported
                  ? t('chatgpt_web.account_info.unsupported')
                  : loadError
                    ? `${t('chatgpt_web.account_info.load_failed')}: ${loadError}`
                    : t('chatgpt_web.account_info.loading')}
              </span>
            </div>
          ) : (
            <>
              <dl className={styles.statusGrid}>
                {statusItems.map((item) => (
                  <div key={item.key} data-field={item.key}>
                    <dt>{t(`chatgpt_web.account_info.status.${item.key}`)}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.accountInfoRuntimeDetails}>
                <div>
                  <strong>{t('chatgpt_web.account_info.recovery_states_title')}</strong>
                  <div className={styles.runtimeBadges}>
                    {recoveryStateCounts.length > 0 ? (
                      recoveryStateCounts.map(([state, count]) => (
                        <span key={state}>
                          {t(`auth_files.chatgpt_web_recovery_states.${state}`, {
                            defaultValue: state,
                          })}{' '}
                          · {count}
                        </span>
                      ))
                    ) : (
                      <span>{t('chatgpt_web.account_info.no_recovery_states')}</span>
                    )}
                  </div>
                </div>
                <div>
                  <strong>{t('chatgpt_web.account_info.failure_distribution_title')}</strong>
                  <div className={styles.runtimeBadges}>
                    {failureCounts.length > 0 ? (
                      failureCounts.map(([code, count]) => (
                        <span key={code}>
                          {code} · {count}
                        </span>
                      ))
                    ) : (
                      <span>{t('chatgpt_web.account_info.no_error')}</span>
                    )}
                  </div>
                </div>
                {requestRefreshRuntime ? (
                  <div>
                    <strong>{t('chatgpt_web.account_info.request_refresh_title')}</strong>
                    <div className={styles.runtimeBadges}>
                      {requestRefreshItems.map(([key, value]) => (
                        <span key={String(key)} data-runtime-field={`request_refresh_${key}`}>
                          {t(`chatgpt_web.account_info.request_refresh.${key}`)} ·{' '}
                          {safeRuntimeCount(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {backgroundReloginRuntime ? (
                  <div>
                    <strong>{t('chatgpt_web.account_info.background_relogin_title')}</strong>
                    <div className={styles.runtimeBadges}>
                      {backgroundReloginItems.map(([key, value]) => (
                        <span key={String(key)} data-runtime-field={`background_relogin_${key}`}>
                          {t(`chatgpt_web.account_info.background_relogin.${key}`)} ·{' '}
                          {typeof value === 'string' ? value : safeRuntimeCount(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {snapshot.refresh_persistence?.enabled ? (
                <dl className={`${styles.statusGrid} ${styles.persistenceGrid}`}>
                  {[
                    [
                      'persistence_active',
                      `${snapshot.refresh_persistence.active} / ${snapshot.refresh_persistence.concurrency}`,
                    ],
                    [
                      'persistence_queued',
                      `${snapshot.refresh_persistence.queued} / ${snapshot.refresh_persistence.queue_limit}`,
                    ],
                    ['persistence_peak', snapshot.refresh_persistence.peak_active],
                    [
                      'persistence_backpressure',
                      snapshot.refresh_persistence.refresh_persist_backpressure,
                    ],
                    ['persistence_rejected', snapshot.refresh_persistence.rejected],
                  ].map(([key, value]) => (
                    <div key={String(key)} data-field={String(key)}>
                      <dt>{t(`chatgpt_web.account_info.status.${key}`)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          )}

          <ConfigDisclosure
            id="config-chatgpt-web-account-info-diagnostics"
            title={t('chatgpt_web.account_info.diagnostics.title')}
            description={t('chatgpt_web.account_info.diagnostics.description')}
            summary={diagnosticsSummary}
            expanded={diagnosticsExpanded}
            onExpandedChange={handleDiagnosticsExpandedChange}
            actions={
              diagnosticsExpanded && diagnosticsSupported ? (
                <div className={styles.diagnosticsActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={diagnosticsLoading}
                    disabled={
                      disabled ||
                      externalSaving ||
                      saving ||
                      diagnosticsClearing ||
                      !generationReady
                    }
                    onClick={() => void loadDiagnostics()}
                  >
                    <IconRefreshCw size={15} />
                    {t('common.refresh')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={diagnosticsClearing}
                    disabled={
                      disabled ||
                      externalSaving ||
                      saving ||
                      diagnosticsLoading ||
                      !generationReady ||
                      !diagnostics ||
                      diagnostics.total_count === 0
                    }
                    onClick={handleClearDiagnostics}
                  >
                    <IconTrash2 size={15} />
                    {t('chatgpt_web.account_info.diagnostics.clear_button')}
                  </Button>
                </div>
              ) : undefined
            }
          >
            <DiagnosticContentBoundary
              resetKey={diagnostics}
              fallback={
                <div className={styles.statusEmpty} role="alert">
                  <span>{t('chatgpt_web.account_info.diagnostics.load_failed')}</span>
                </div>
              }
            >
              <div className={styles.diagnosticsContent} aria-busy={diagnosticsLoading}>
                {!diagnosticsSupported ? (
                  <div className={styles.statusEmpty}>
                    <span>{t('chatgpt_web.account_info.diagnostics.unsupported')}</span>
                  </div>
                ) : diagnosticsError ? (
                  <div className={styles.statusEmpty} role="alert">
                    <span>
                      {t('chatgpt_web.account_info.diagnostics.load_failed')}: {diagnosticsError}
                    </span>
                  </div>
                ) : !diagnostics ? (
                  <div className={styles.statusEmpty}>
                    {diagnosticsLoading ? <LoadingSpinner size={18} /> : null}
                    <span>{t('chatgpt_web.account_info.diagnostics.loading')}</span>
                  </div>
                ) : (
                  <>
                    <dl className={styles.diagnosticsStats}>
                      {[
                        ['unique_count', diagnostics.unique_count],
                        ['total_count', diagnostics.total_count],
                        ['evicted_count', diagnostics.evicted_count],
                        ['capacity', diagnostics.capacity],
                      ].map(([key, value]) => (
                        <div key={key}>
                          <dt>{t(`chatgpt_web.account_info.diagnostics.stats.${key}`)}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {diagnosticRecords.length === 0 ? (
                      <div className={styles.statusEmpty}>
                        <span>{t('chatgpt_web.account_info.diagnostics.empty')}</span>
                      </div>
                    ) : (
                      <div className={styles.diagnosticsList}>
                        {diagnosticRecords.map((record, index) => (
                          <DiagnosticRecord
                            key={record?.id ?? `invalid-diagnostic-${index}`}
                            record={record}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </DiagnosticContentBoundary>
          </ConfigDisclosure>

          <ConfigDisclosure
            id="config-chatgpt-web-account-info-raw-quota"
            title={t('chatgpt_web.account_info.raw_quota.title')}
            description={t('chatgpt_web.account_info.raw_quota.description')}
            summary={rawQuotaSummary}
            expanded={rawQuotaExpanded}
            onExpandedChange={handleRawQuotaExpandedChange}
            actions={
              rawQuotaExpanded && rawQuotaSupported ? (
                <div className={styles.diagnosticsActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={rawQuotaLoading}
                    disabled={
                      disabled || externalSaving || saving || rawQuotaClearing || !generationReady
                    }
                    onClick={() => void loadRawQuota()}
                  >
                    <IconRefreshCw size={15} />
                    {t('common.refresh')}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={rawQuotaClearing}
                    disabled={
                      disabled ||
                      externalSaving ||
                      saving ||
                      rawQuotaLoading ||
                      !generationReady ||
                      !rawQuota ||
                      rawQuotaRecords.length === 0
                    }
                    onClick={handleClearRawQuota}
                  >
                    <IconTrash2 size={15} />
                    {t('chatgpt_web.account_info.raw_quota.clear_button')}
                  </Button>
                </div>
              ) : undefined
            }
          >
            <DiagnosticContentBoundary
              resetKey={rawQuota}
              fallback={
                <div className={styles.statusEmpty} role="alert">
                  <span>{t('chatgpt_web.account_info.raw_quota.load_failed')}</span>
                </div>
              }
            >
              <div className={styles.diagnosticsContent} aria-busy={rawQuotaLoading}>
                {!rawQuotaSupported ? (
                  <div className={styles.statusEmpty}>
                    <span>{t('chatgpt_web.account_info.raw_quota.unsupported')}</span>
                  </div>
                ) : rawQuotaError ? (
                  <div className={styles.statusEmpty} role="alert">
                    <span>
                      {t('chatgpt_web.account_info.raw_quota.load_failed')}: {rawQuotaError}
                    </span>
                  </div>
                ) : !rawQuota ? (
                  <div className={styles.statusEmpty}>
                    {rawQuotaLoading ? <LoadingSpinner size={18} /> : null}
                    <span>{t('chatgpt_web.account_info.raw_quota.loading')}</span>
                  </div>
                ) : (
                  <>
                    <dl className={styles.diagnosticsStats}>
                      {[
                        ['records', rawQuotaRecords.length],
                        ['total_bytes', rawQuota.total_bytes],
                        ['evicted_count', rawQuota.evicted_count],
                        ['capacity', rawQuota.capacity],
                      ].map(([key, value]) => (
                        <div key={key}>
                          <dt>{t(`chatgpt_web.account_info.raw_quota.stats.${key}`)}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {rawQuotaRecords.length === 0 ? (
                      <div className={styles.statusEmpty}>
                        <span>{t('chatgpt_web.account_info.raw_quota.empty')}</span>
                      </div>
                    ) : (
                      <div className={styles.diagnosticsList}>
                        {rawQuotaRecords.map((record, index) => (
                          <RawQuotaRecord
                            key={
                              record
                                ? `${record.auth_index}:${record.captured_at}`
                                : `invalid-raw-quota-${index}`
                            }
                            record={record}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </DiagnosticContentBoundary>
          </ConfigDisclosure>
        </div>
      </ConfigDisclosure>
    </>
  );
});
