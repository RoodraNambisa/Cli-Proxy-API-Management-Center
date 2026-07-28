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
import { IconRefreshCw } from '@/components/ui/icons';
import { apiClient, chatGptWebApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type {
  ChatGptWebAccountInfoConfig,
  ChatGptWebAccountInfoConfigPatch,
  ChatGptWebAccountInfoSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import {
  clearChatGptWebAccountInfoUnsupported,
  isChatGptWebAccountInfoUnsupported,
  markChatGptWebAccountInfoUnsupported,
  subscribeChatGptWebAccountInfoCapability,
} from '../accountInfoCapability';
import styles from './ChatGptWebSentinelPanel.module.scss';

type AccountInfoDraft = {
  workers: string;
  queueSize: string;
  ttlMinutes: string;
  jitterSeconds: string;
  maxRetries: string;
};

type AccountInfoField = keyof AccountInfoDraft;
type AccountInfoValidationErrors = Partial<Record<AccountInfoField, string>>;

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
const POLL_INTERVAL_MS = 5000;

const ACCOUNT_INFO_FIELDS = [
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
  field: AccountInfoField;
  labelKey: string;
  configKey: keyof ChatGptWebAccountInfoConfig;
  min: number;
  max: number;
  errorKey: string;
}>;

const DEFAULT_DRAFT: AccountInfoDraft = {
  workers: '4',
  queueSize: '256',
  ttlMinutes: '15',
  jitterSeconds: '30',
  maxRetries: '3',
};

const toDraft = (snapshot: ChatGptWebAccountInfoSnapshot): AccountInfoDraft => ({
  workers: String(snapshot.config['refresh-workers']),
  queueSize: String(snapshot.config['refresh-queue-size']),
  ttlMinutes: String(snapshot.config['refresh-ttl-minutes']),
  jitterSeconds: String(snapshot.config['recovery-jitter-seconds']),
  maxRetries: String(snapshot.config['max-retries']),
});

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
  const parsed = {} as ChatGptWebAccountInfoConfig;
  for (const definition of ACCOUNT_INFO_FIELDS) {
    const value = parseInteger(draft[definition.field], definition.min, definition.max);
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

const isSameGeneration = (
  left: ConnectionGeneration | null,
  right: ConnectionGeneration | null
): boolean =>
  left !== null && right !== null && left.key === right.key && left.version === right.version;

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
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
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
      if (preserveDirty && dirtyFieldsRef.current.size > 0) {
        setDraft((current) => {
          const merged = { ...current };
          for (const definition of ACCOUNT_INFO_FIELDS) {
            if (!dirtyFieldsRef.current.has(definition.field)) {
              merged[definition.field] = nextDraft[definition.field];
            }
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
      hasLoadedRef.current = false;
      snapshotGenerationRef.current = null;
      setSnapshotGeneration(null);
      setLoading(false);
      setLoadError('');
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
      setLoading(false);
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
  const resetDisabled = externalSaving || saving;

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
    };
  }, [abortSaveRefresh, abortSnapshotRequest]);

  useEffect(() => {
    const synchronizeUnsupported = (key: string, nextUnsupported: boolean) => {
      if (key !== connectionGenerationKeyRef.current) return;
      unsupportedRef.current = nextUnsupported;
      setUnsupported(nextUnsupported);
      if (nextUnsupported) {
        requestSequenceRef.current += 1;
        abortSnapshotRequest();
        abortSaveRefresh();
        setLoading(false);
      }
    };
    synchronizeUnsupported(
      connectionGenerationKeyRef.current,
      isChatGptWebAccountInfoUnsupported(connectionGenerationKeyRef.current)
    );
    return subscribeChatGptWebAccountInfoCapability(synchronizeUnsupported);
  }, [abortSaveRefresh, abortSnapshotRequest]);

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

  const updateDraftField = useCallback(
    (field: AccountInfoField, value: string) => {
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

  const statusItems = snapshot
    ? [
        { key: 'busy', value: `${snapshot.runtime.busy} / ${snapshot.config['refresh-workers']}` },
        { key: 'queued', value: snapshot.runtime.queued },
        { key: 'scheduled', value: snapshot.runtime.scheduled },
        { key: 'inflight', value: snapshot.runtime.inflight },
        { key: 'refresh_count', value: snapshot.runtime.refresh_count },
        { key: 'retry_count', value: snapshot.runtime.retry_count },
        { key: 'failed_count', value: snapshot.runtime.failed_count },
        {
          key: 'last_error',
          value: snapshot.runtime.last_error || t('chatgpt_web.account_info.no_error'),
        },
      ]
    : [];

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
          workers: draft.workers,
          ttl: draft.ttlMinutes,
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

          <div className={styles.settingsGrid}>
            {ACCOUNT_INFO_FIELDS.map((definition) => {
              const inputId = `chatgpt-web-account-info-${definition.field}`;
              const hintId = `${inputId}-hint`;
              const errorId = `${inputId}-error`;
              const errorKey = parsedDraft.errors[definition.field];
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
                    disabled={controlsDisabled}
                    aria-invalid={Boolean(errorKey)}
                    aria-describedby={errorKey ? `${hintId} ${errorId}` : hintId}
                  />
                  <small id={hintId}>
                    {t(`chatgpt_web.account_info.${definition.labelKey}_hint`)}
                  </small>
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
              onClick={() => void loadSnapshot()}
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
            <dl className={styles.statusGrid}>
              {statusItems.map((item) => (
                <div key={item.key} data-field={item.key}>
                  <dt>{t(`chatgpt_web.account_info.status.${item.key}`)}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </ConfigDisclosure>
    </>
  );
});
