import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  authFilesApi,
  chatGptWebApi,
  type AuthFileDependencyAction,
  type XaiAuthFileField,
} from '@/services/api';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, CodexPlanTypeRefreshMode, CodexPlanTypeRefreshTask } from '@/types';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import {
  getChatGptWebErrorDiagnosticMessages,
  getChatGptWebErrorMessage,
} from '@/utils/chatgptWeb';
import {
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  isXaiProvider,
  readXaiAuthFileUsingApi,
  readXaiAuthFileWebsockets,
} from '@/features/authFiles/constants';
import { captureAuthFileSnapshotOrder } from '@/features/authFiles/snapshotOrder';

const CODEX_PLAN_TYPE_REFRESH_POLL_INTERVAL_MS = 3000;
const COOLDOWN_MISSING_PREVIEW_LIMIT = 5;

const isRetainedCodexAuthFile = (file: AuthFileItem): boolean =>
  String(file.provider ?? file.type ?? '')
    .trim()
    .toLowerCase() === 'codex' &&
  (file.retained_for_dependents === true || file.deletion_state === 'retained_for_dependents');

const readDependentCount = (file: AuthFileItem): number => {
  const value = file.dependent_count;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
};

export type AuthFileDependencyDeleteState = {
  open: boolean;
  names: string[];
  sourceCount: number;
  dependentCount: number;
  dependentNames: string[];
  submitting: boolean;
};

const getArchiveDownloadErrorMeta = (
  err: unknown
): { status?: number; message: string; unsupported: boolean } => {
  const status =
    typeof err === 'object' && err && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const message = err instanceof Error ? err.message : '';
  const normalizedMessage = message.trim().toLowerCase();
  const unsupported = status === 405 || (status === 404 && normalizedMessage !== 'file not found');

  return { status, message, unsupported };
};

const getCodexPlanRefreshErrorMeta = (
  err: unknown
): { status?: number; message: string; unsupported: boolean } => {
  const status =
    typeof err === 'object' && err && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  const message = err instanceof Error ? err.message : '';

  return {
    status,
    message,
    unsupported: status === 404 || status === 405,
  };
};

const isCodexPlanRefreshRunning = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task && (task.running || task.state === 'running'));

const isCodexPlanRefreshPaused = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task && (task.paused || task.state === 'paused'));

const isCodexPlanRefreshPauseRequested = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task?.pauseRequested);

const isCodexPlanRefreshActive = (task: CodexPlanTypeRefreshTask | null): boolean =>
  isCodexPlanRefreshRunning(task) ||
  isCodexPlanRefreshPaused(task) ||
  isCodexPlanRefreshPauseRequested(task);

export const isCodexPlanRefreshClearBlocked = (task: CodexPlanTypeRefreshTask | null): boolean =>
  isCodexPlanRefreshPauseRequested(task) ||
  (isCodexPlanRefreshRunning(task) && !isCodexPlanRefreshPaused(task));

export const shouldShowCodexPlanRefreshPanel = (
  task: CodexPlanTypeRefreshTask | null,
  loading: boolean
): boolean =>
  Boolean(
    task &&
    (loading ||
      isCodexPlanRefreshActive(task) ||
      task.state !== 'idle' ||
      task.summary.processed > 0 ||
      task.results.length > 0 ||
      task.currentName)
  );

const isCodexPlanRefreshTerminal = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(
    task &&
    (task.state === 'completed' ||
      task.state === 'completed_with_errors' ||
      task.state === 'failed')
  );

const formatMissingCooldownTargets = (missing: string[]): string => {
  const normalized = Array.from(new Set(missing.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length <= COOLDOWN_MISSING_PREVIEW_LIMIT) {
    return normalized.join(', ');
  }
  return `${normalized.slice(0, COOLDOWN_MISSING_PREVIEW_LIMIT).join(', ')}...`;
};

type DeleteAllOptions = {
  filter: string;
  problemOnly: boolean;
  enabledOnly: boolean;
  disabledOnly: boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
  onResetEnabledOnly: () => void;
  onResetDisabledOnly: () => void;
};

type LoadFilesOptions = {
  background?: boolean;
};

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  filesLoadedAtMs: number;
  filesSnapshotOrder: number;
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  archiveDownloadingSelected: boolean;
  archiveDownloadingAll: boolean;
  clearingAllCooldowns: boolean;
  clearingSelectedCooldowns: boolean;
  codexPlanRefreshTask: CodexPlanTypeRefreshTask | null;
  codexPlanRefreshLoading: boolean;
  codexPlanRefreshStarting: boolean;
  codexPlanRefreshActionLoading: boolean;
  statusUpdating: Record<string, boolean>;
  xaiFieldsUpdating: Record<string, Partial<Record<XaiAuthFileField, boolean>>>;
  chatGptWebReloginUpdating: Record<string, boolean>;
  restoring: Record<string, boolean>;
  dependencyDelete: AuthFileDependencyDeleteState;
  batchStatusUpdating: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: (options?: LoadFilesOptions) => Promise<void>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  handleXaiFieldToggle: (
    item: AuthFileItem,
    field: XaiAuthFileField,
    value: boolean
  ) => Promise<void>;
  handleChatGptWebRelogin: (item: AuthFileItem) => Promise<void>;
  handleRestore: (item: AuthFileItem) => Promise<void>;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  invertVisibleSelection: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  replaceSelection: (names: string[]) => void;
  batchDownload: (names: string[]) => Promise<void>;
  batchArchiveDownload: (names: string[]) => Promise<void>;
  downloadAllArchive: () => Promise<void>;
  clearAllCooldowns: () => void;
  clearSelectedCooldowns: (names: string[]) => void;
  refreshCodexPlanTypeRefreshStatus: () => Promise<void>;
  startCodexPlanTypeRefresh: () => Promise<void>;
  clearCodexPlanTypeRefresh: () => Promise<void>;
  pauseCodexPlanTypeRefresh: () => Promise<void>;
  resumeCodexPlanTypeRefresh: () => Promise<void>;
  retryFailedCodexPlanTypeRefresh: () => Promise<void>;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
  closeDependencyDelete: () => void;
  confirmDependencyDelete: (action: AuthFileDependencyAction) => Promise<void>;
};

export type UseAuthFilesDataOptions = {
  refreshKeyStats: () => Promise<void>;
  active?: boolean;
  connectionGenerationKey?: string;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const { refreshKeyStats, active = true, connectionGenerationKey = '' } = options;
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [filesLoadedAtMs, setFilesLoadedAtMs] = useState(0);
  const [filesSnapshotOrder, setFilesSnapshotOrder] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [archiveDownloadingSelected, setArchiveDownloadingSelected] = useState(false);
  const [archiveDownloadingAll, setArchiveDownloadingAll] = useState(false);
  const [clearingAllCooldowns, setClearingAllCooldowns] = useState(false);
  const [clearingSelectedCooldowns, setClearingSelectedCooldowns] = useState(false);
  const [codexPlanRefreshTask, setCodexPlanRefreshTask] = useState<CodexPlanTypeRefreshTask | null>(
    null
  );
  const [codexPlanRefreshLoading, setCodexPlanRefreshLoading] = useState(false);
  const [codexPlanRefreshStarting, setCodexPlanRefreshStarting] = useState(false);
  const [codexPlanRefreshActionLoading, setCodexPlanRefreshActionLoading] = useState(false);
  const [codexPlanRefreshSupported, setCodexPlanRefreshSupported] = useState<boolean | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [xaiFieldsUpdating, setXaiFieldsUpdating] = useState<
    Record<string, Partial<Record<XaiAuthFileField, boolean>>>
  >({});
  const [chatGptWebReloginUpdating, setChatGptWebReloginUpdating] = useState<
    Record<string, boolean>
  >({});
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  const [dependencyDelete, setDependencyDelete] = useState<AuthFileDependencyDeleteState>({
    open: false,
    names: [],
    sourceCount: 0,
    dependentCount: 0,
    dependentNames: [],
    submitting: false,
  });
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStatusPendingRef = useRef(false);
  const codexPlanRefreshTaskRef = useRef<CodexPlanTypeRefreshTask | null>(null);
  const codexPlanRefreshPollErrorNotifiedRef = useRef(false);
  const loadFilesRequestRef = useRef(0);
  const loadFilesConnectionRef = useRef(connectionGenerationKey);
  const loadFilesAbortRef = useRef<AbortController | null>(null);
  loadFilesConnectionRef.current = connectionGenerationKey;
  const selectionCount = selectedFiles.size;

  useEffect(() => {
    loadFilesAbortRef.current?.abort();
    loadFilesAbortRef.current = null;
    return () => {
      loadFilesAbortRef.current?.abort();
      loadFilesAbortRef.current = null;
    };
  }, [connectionGenerationKey]);

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((visibleFiles: AuthFileItem[]) => {
    const nextSelected = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    if (nextSelected.length === 0) return;
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      nextSelected.forEach((name) => next.add(name));
      return next;
    });
  }, []);

  const invertVisibleSelection = useCallback((visibleFiles: AuthFileItem[]) => {
    const visibleNames = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    if (visibleNames.length === 0) return;

    setSelectedFiles((prev) => {
      const next = new Set(prev);
      visibleNames.forEach((name) => {
        if (next.has(name)) {
          next.delete(name);
        } else {
          next.add(name);
        }
      });
      return next;
    });
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  const replaceSelection = useCallback((names: string[]) => {
    setSelectedFiles(new Set(names.map((name) => name.trim()).filter(Boolean)));
  }, []);

  const applyDeletedFiles = useCallback((names: string[]) => {
    const deletedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    if (deletedNames.length === 0) return;

    const deletedSet = new Set(deletedNames);
    setFiles((prev) => prev.filter((file) => !deletedSet.has(file.name)));
    setSelectedFiles((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (deletedSet.has(name)) {
          changed = true;
        } else {
          next.add(name);
        }
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (selectedFiles.size === 0) return;
    const existingNames = new Set(files.map((file) => file.name));
    setSelectedFiles((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (existingNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [files, selectedFiles.size]);

  const loadFiles = useCallback(
    async (options?: LoadFilesOptions) => {
      const requestId = ++loadFilesRequestRef.current;
      const requestConnection = connectionGenerationKey;
      const requestSnapshotOrder = captureAuthFileSnapshotOrder();
      loadFilesAbortRef.current?.abort();
      const abortController = new AbortController();
      loadFilesAbortRef.current = abortController;
      const isCurrentRequest = () =>
        loadFilesRequestRef.current === requestId &&
        loadFilesConnectionRef.current === requestConnection;
      const background = options?.background === true;
      if (!background) {
        setLoading(true);
      }
      setError('');
      const connection = apiClient.captureConnection();
      try {
        const data = await authFilesApi.list(connection, abortController.signal);
        if (!isCurrentRequest()) return;
        setFiles(data?.files || []);
        setFilesSnapshotOrder(requestSnapshotOrder);
        setFilesLoadedAtMs(Date.now());
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        if (!isCurrentRequest()) return;
        const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
        setError(errorMessage);
      } finally {
        if (loadFilesAbortRef.current === abortController) {
          loadFilesAbortRef.current = null;
        }
        if (isCurrentRequest()) {
          setLoading(false);
        }
      }
    },
    [connectionGenerationKey, t]
  );

  const applyCodexPlanRefreshTask = useCallback(
    async (
      task: CodexPlanTypeRefreshTask,
      options?: {
        notifyTerminal?: boolean;
      }
    ) => {
      const notifyTerminal = options?.notifyTerminal === true;
      const previousTask = codexPlanRefreshTaskRef.current;
      codexPlanRefreshTaskRef.current = task;
      codexPlanRefreshPollErrorNotifiedRef.current = false;
      setCodexPlanRefreshTask(task);
      setCodexPlanRefreshSupported(true);

      const transitionedToTerminal =
        notifyTerminal &&
        isCodexPlanRefreshActive(previousTask) &&
        isCodexPlanRefreshTerminal(task) &&
        !isCodexPlanRefreshActive(task);

      if (!transitionedToTerminal) return;

      await Promise.allSettled([loadFiles(), refreshKeyStats()]);

      if (task.state === 'completed') {
        showNotification(
          t('auth_files.codex_plan_refresh_completed', {
            processed: task.summary.processed,
            updated: task.summary.updated,
          }),
          'success'
        );
        return;
      }

      if (task.state === 'completed_with_errors') {
        showNotification(
          t('auth_files.codex_plan_refresh_completed_with_errors', {
            processed: task.summary.processed,
            updated: task.summary.updated,
            failed: task.summary.failed,
          }),
          'warning'
        );
        return;
      }

      const failedMessage =
        task.results.find((result) => result.status === 'failed' && result.error)?.error ??
        t('notification.refresh_failed');
      showNotification(
        t('auth_files.codex_plan_refresh_failed', {
          message: failedMessage,
        }),
        'error'
      );
    },
    [loadFiles, refreshKeyStats, showNotification, t]
  );

  const fetchCodexPlanRefreshStatus = useCallback(
    async (options?: {
      markLoading?: boolean;
      notifyTerminal?: boolean;
      silentUnsupported?: boolean;
    }) => {
      if (options?.markLoading) {
        setCodexPlanRefreshLoading(true);
      }

      try {
        const task = await authFilesApi.getCodexPlanTypeRefreshStatus();
        await applyCodexPlanRefreshTask(task, { notifyTerminal: options?.notifyTerminal });
      } catch (err: unknown) {
        const { message, unsupported } = getCodexPlanRefreshErrorMeta(err);
        if (unsupported) {
          setCodexPlanRefreshSupported(false);
          if (!options?.silentUnsupported) {
            showNotification(t('auth_files.codex_plan_refresh_unsupported'), 'warning');
          }
          return;
        }

        if (options?.notifyTerminal && !codexPlanRefreshPollErrorNotifiedRef.current) {
          showNotification(`${t('notification.refresh_failed')}: ${message}`, 'error');
          codexPlanRefreshPollErrorNotifiedRef.current = true;
        }
      } finally {
        if (options?.markLoading) {
          setCodexPlanRefreshLoading(false);
        }
      }
    },
    [applyCodexPlanRefreshTask, showNotification, t]
  );

  const runCodexPlanTypeRefresh = useCallback(
    async (mode: CodexPlanTypeRefreshMode) => {
      if (codexPlanRefreshStarting) return;
      if (codexPlanRefreshSupported === false) {
        showNotification(t('auth_files.codex_plan_refresh_unsupported'), 'warning');
        return;
      }
      if (isCodexPlanRefreshActive(codexPlanRefreshTaskRef.current)) {
        return;
      }

      setCodexPlanRefreshStarting(true);
      try {
        const task = await authFilesApi.startCodexPlanTypeRefresh(mode);
        await applyCodexPlanRefreshTask(task);
        if (mode === 'failed' && !isCodexPlanRefreshActive(task) && !task.canRetryFailed) {
          showNotification(t('auth_files.codex_plan_refresh_no_failed_retry'), 'warning');
          return;
        }
        showNotification(t('auth_files.codex_plan_refresh_started'), 'success');
      } catch (err: unknown) {
        const { message, unsupported } = getCodexPlanRefreshErrorMeta(err);
        if (unsupported) {
          setCodexPlanRefreshSupported(false);
          showNotification(t('auth_files.codex_plan_refresh_unsupported'), 'warning');
        } else {
          showNotification(`${t('notification.refresh_failed')}: ${message}`, 'error');
        }
      } finally {
        setCodexPlanRefreshStarting(false);
      }
    },
    [
      applyCodexPlanRefreshTask,
      codexPlanRefreshStarting,
      codexPlanRefreshSupported,
      showNotification,
      t,
    ]
  );

  const startCodexPlanTypeRefresh = useCallback(
    () => runCodexPlanTypeRefresh('all'),
    [runCodexPlanTypeRefresh]
  );

  const retryFailedCodexPlanTypeRefresh = useCallback(async () => {
    const currentTask = codexPlanRefreshTaskRef.current;
    if (!currentTask?.canRetryFailed) {
      showNotification(t('auth_files.codex_plan_refresh_no_failed_retry'), 'warning');
      return;
    }
    await runCodexPlanTypeRefresh('failed');
  }, [runCodexPlanTypeRefresh, showNotification, t]);

  const controlCodexPlanTypeRefresh = useCallback(
    async (action: 'pause' | 'resume') => {
      if (codexPlanRefreshActionLoading) return;
      const currentTask = codexPlanRefreshTaskRef.current;
      if (action === 'pause' && !isCodexPlanRefreshRunning(currentTask)) return;
      if (action === 'resume' && !isCodexPlanRefreshPaused(currentTask)) return;

      setCodexPlanRefreshActionLoading(true);
      try {
        const task = await authFilesApi.controlCodexPlanTypeRefresh(action);
        await applyCodexPlanRefreshTask(task);
      } catch (err: unknown) {
        const { message, unsupported } = getCodexPlanRefreshErrorMeta(err);
        if (unsupported) {
          setCodexPlanRefreshSupported(false);
          showNotification(t('auth_files.codex_plan_refresh_unsupported'), 'warning');
        } else {
          showNotification(`${t('notification.refresh_failed')}: ${message}`, 'error');
        }
      } finally {
        setCodexPlanRefreshActionLoading(false);
      }
    },
    [applyCodexPlanRefreshTask, codexPlanRefreshActionLoading, showNotification, t]
  );

  const pauseCodexPlanTypeRefresh = useCallback(
    () => controlCodexPlanTypeRefresh('pause'),
    [controlCodexPlanTypeRefresh]
  );

  const resumeCodexPlanTypeRefresh = useCallback(
    () => controlCodexPlanTypeRefresh('resume'),
    [controlCodexPlanTypeRefresh]
  );

  const performClearCodexPlanTypeRefresh = useCallback(async () => {
    if (codexPlanRefreshActionLoading) return;
    if (isCodexPlanRefreshClearBlocked(codexPlanRefreshTaskRef.current)) {
      showNotification(t('auth_files.codex_plan_refresh_clear_unavailable'), 'warning');
      return;
    }

    setCodexPlanRefreshActionLoading(true);
    try {
      const task = await authFilesApi.clearCodexPlanTypeRefreshStatus();
      await applyCodexPlanRefreshTask(task);
      if (isCodexPlanRefreshClearBlocked(task)) {
        showNotification(t('auth_files.codex_plan_refresh_clear_unavailable'), 'warning');
      }
    } catch (err: unknown) {
      const { message, unsupported } = getCodexPlanRefreshErrorMeta(err);
      if (unsupported) {
        setCodexPlanRefreshSupported(false);
        showNotification(t('auth_files.codex_plan_refresh_unsupported'), 'warning');
      } else {
        showNotification(`${t('notification.refresh_failed')}: ${message}`, 'error');
      }
    } finally {
      setCodexPlanRefreshActionLoading(false);
    }
  }, [applyCodexPlanRefreshTask, codexPlanRefreshActionLoading, showNotification, t]);

  const clearCodexPlanTypeRefresh = useCallback(async () => {
    if (codexPlanRefreshActionLoading) return;
    const currentTask = codexPlanRefreshTaskRef.current;
    if (isCodexPlanRefreshClearBlocked(currentTask)) {
      showNotification(t('auth_files.codex_plan_refresh_clear_unavailable'), 'warning');
      return;
    }

    if (isCodexPlanRefreshPaused(currentTask)) {
      showConfirmation({
        title: t('auth_files.codex_plan_refresh_close_task'),
        message: t('auth_files.codex_plan_refresh_close_paused_confirm'),
        variant: 'danger',
        confirmText: t('auth_files.codex_plan_refresh_close_task'),
        onConfirm: performClearCodexPlanTypeRefresh,
      });
      return;
    }

    await performClearCodexPlanTypeRefresh();
  }, [
    codexPlanRefreshActionLoading,
    performClearCodexPlanTypeRefresh,
    showConfirmation,
    showNotification,
    t,
  ]);

  const refreshCodexPlanTypeRefreshStatus = useCallback(
    () => fetchCodexPlanRefreshStatus({ markLoading: true, silentUnsupported: true }),
    [fetchCodexPlanRefreshStatus]
  );

  useEffect(() => {
    if (!active) return;
    void fetchCodexPlanRefreshStatus({ markLoading: true, silentUnsupported: true });
  }, [active, fetchCodexPlanRefreshStatus]);

  useEffect(() => {
    if (!active || !isCodexPlanRefreshActive(codexPlanRefreshTask)) return;

    const timer = window.setInterval(() => {
      void fetchCodexPlanRefreshStatus({ notifyTerminal: true, silentUnsupported: true });
    }, CODEX_PLAN_TYPE_REFRESH_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [active, codexPlanRefreshTask, fetchCodexPlanRefreshStatus]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesToUpload = Array.from(fileList);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      filesToUpload.forEach((file) => {
        if (!file.name.endsWith('.json')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > MAX_AUTH_FILE_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      if (invalidFiles.length > 0) {
        showNotification(t('auth_files.upload_error_json'), 'error');
      }
      if (oversizedFiles.length > 0) {
        showNotification(
          t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) }),
          'error'
        );
      }

      if (validFiles.length === 0) {
        event.target.value = '';
        return;
      }

      setUploading(true);
      try {
        const result = await authFilesApi.uploadFiles(validFiles);
        const successCount = result.uploaded;

        if (successCount > 0) {
          const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
          showNotification(
            `${t('auth_files.upload_success')}${suffix}`,
            result.failed.length ? 'warning' : 'success'
          );
          void loadFiles({ background: true });
        }

        if (result.failed.length > 0) {
          const details = result.failed.map((item) => `${item.name}: ${item.error}`).join('; ');
          showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      } finally {
        setUploading(false);
        event.target.value = '';
      }
    },
    [loadFiles, showNotification, t]
  );

  const dependencyDeleteDetails = useCallback(
    (names: string[]) => {
      const nameSet = new Set(names);
      const sources = files.filter(
        (file) =>
          nameSet.has(file.name) &&
          String(file.provider ?? file.type ?? '')
            .trim()
            .toLowerCase() === 'codex' &&
          readDependentCount(file) > 0
      );
      return {
        sourceCount: sources.length,
        dependentCount: sources.reduce((total, file) => total + readDependentCount(file), 0),
        dependentNames: Array.from(
          new Set(
            sources.flatMap((file) =>
              Array.isArray(file.dependent_names)
                ? file.dependent_names.map((name) => String(name).trim()).filter(Boolean)
                : []
            )
          )
        ).sort(),
      };
    },
    [files]
  );

  const performDelete = useCallback(
    async (names: string[], action: AuthFileDependencyAction): Promise<boolean> => {
      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (uniqueNames.length === 0) return false;
      if (uniqueNames.length === 1) setDeleting(uniqueNames[0]);

      try {
        const result = await authFilesApi.deleteFiles(uniqueNames, action);
        applyDeletedFiles(result.files);
        if (result.retained > 0) {
          await loadFiles({ background: true });
        }

        if (result.failed.length > 0) {
          showNotification(
            t('auth_files.delete_dependency_partial', {
              deleted: result.deleted,
              retained: result.retained,
              failed: result.failed.length,
            }),
            'warning'
          );
        } else if (result.retained > 0) {
          const dependentCount = result.retainedFiles.reduce(
            (total, retained) => total + retained.dependentCount,
            0
          );
          showNotification(
            t('auth_files.delete_retained_success', {
              retained: result.retained,
              dependents: dependentCount,
              deleted: result.deleted,
            }),
            'warning'
          );
        } else {
          showNotification(
            action === 'cascade'
              ? t('auth_files.delete_cascade_success', { count: result.deleted })
              : t('auth_files.delete_success'),
            'success'
          );
        }
        return true;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        return false;
      } finally {
        if (uniqueNames.length === 1) setDeleting(null);
      }
    },
    [applyDeletedFiles, loadFiles, showNotification, t]
  );

  const openDependencyDelete = useCallback(
    (names: string[]): boolean => {
      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      const details = dependencyDeleteDetails(uniqueNames);
      if (details.dependentCount === 0) return false;
      setDependencyDelete({
        open: true,
        names: uniqueNames,
        sourceCount: details.sourceCount,
        dependentCount: details.dependentCount,
        dependentNames: details.dependentNames,
        submitting: false,
      });
      return true;
    },
    [dependencyDeleteDetails]
  );

  const closeDependencyDelete = useCallback(() => {
    setDependencyDelete((previous) =>
      previous.submitting
        ? previous
        : {
            open: false,
            names: [],
            sourceCount: 0,
            dependentCount: 0,
            dependentNames: [],
            submitting: false,
          }
    );
  }, []);

  const confirmDependencyDelete = useCallback(
    async (action: AuthFileDependencyAction) => {
      if (!dependencyDelete.open || dependencyDelete.submitting) return;
      setDependencyDelete((previous) => ({ ...previous, submitting: true }));
      const completed = await performDelete(dependencyDelete.names, action);
      setDependencyDelete((previous) =>
        completed
          ? {
              open: false,
              names: [],
              sourceCount: 0,
              dependentCount: 0,
              dependentNames: [],
              submitting: false,
            }
          : { ...previous, submitting: false }
      );
    },
    [dependencyDelete, performDelete]
  );

  const handleDelete = useCallback(
    (name: string) => {
      if (openDependencyDelete([name])) return;
      showConfirmation({
        title: t('auth_files.delete_title', { defaultValue: 'Delete File' }),
        message: `${t('auth_files.delete_confirm')} "${name}" ?`,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          await performDelete([name], 'retain');
        },
      });
    },
    [openDependencyDelete, performDelete, showConfirmation, t]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const {
        filter,
        problemOnly,
        enabledOnly,
        disabledOnly,
        onResetFilterToAll,
        onResetProblemOnly,
        onResetEnabledOnly,
        onResetDisabledOnly,
      } = deleteAllOptions;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const isEnabledOnly = enabledOnly === true;
      const isDisabledOnly = disabledOnly === true;
      const isStatusFiltered = isEnabledOnly || isDisabledOnly;
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('auth_files.filter_all');
      if (isFiltered || isProblemOnly || isStatusFiltered) {
        const names = files
          .filter((file) => {
            if (isRuntimeOnlyAuthFile(file)) return false;
            if (isFiltered && file.type !== filter) return false;
            if (isProblemOnly && !hasAuthFileStatusMessage(file)) return false;
            if (isEnabledOnly && file.disabled === true) return false;
            if (isDisabledOnly && file.disabled !== true) return false;
            return true;
          })
          .map((file) => file.name);
        if (openDependencyDelete(names)) return;
      }
      let confirmMessage = t('auth_files.delete_all_confirm');
      if (isStatusFiltered) {
        confirmMessage = t('auth_files.delete_filtered_result_confirm');
      } else if (isProblemOnly) {
        confirmMessage = isFiltered
          ? t('auth_files.delete_problem_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_problem_confirm');
      } else if (isFiltered) {
        confirmMessage = t('auth_files.delete_filtered_confirm', { type: typeLabel });
      }

      showConfirmation({
        title: t('auth_files.delete_all_title', { defaultValue: 'Delete All Files' }),
        message: confirmMessage,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeletingAll(true);
          try {
            if (!isFiltered && !isProblemOnly && !isStatusFiltered) {
              await authFilesApi.deleteAll();
              showNotification(t('auth_files.delete_all_success'), 'success');
              setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
              deselectAll();
            } else {
              const filesToDelete = files.filter((file) => {
                if (isRuntimeOnlyAuthFile(file)) return false;
                if (isFiltered && file.type !== filter) return false;
                if (isProblemOnly && !hasAuthFileStatusMessage(file)) return false;
                if (isEnabledOnly && file.disabled === true) return false;
                if (isDisabledOnly && file.disabled !== true) return false;
                return true;
              });

              if (filesToDelete.length === 0) {
                let emptyMessage = t('auth_files.delete_filtered_none', { type: typeLabel });
                if (isStatusFiltered) {
                  emptyMessage = t('auth_files.delete_filtered_result_none');
                } else if (isProblemOnly) {
                  emptyMessage = isFiltered
                    ? t('auth_files.delete_problem_filtered_none', { type: typeLabel })
                    : t('auth_files.delete_problem_none');
                }
                showNotification(emptyMessage, 'info');
                setDeletingAll(false);
                return;
              }

              const result = await authFilesApi.deleteFiles(filesToDelete.map((file) => file.name));
              const success = result.deleted;
              const failed = result.failed.length;

              applyDeletedFiles(result.files);
              if (result.retained > 0) {
                await loadFiles({ background: true });
              }

              if (failed === 0 && result.retained > 0) {
                showNotification(
                  t('auth_files.delete_retained_success', {
                    retained: result.retained,
                    dependents: result.retainedFiles.reduce(
                      (total, retained) => total + retained.dependentCount,
                      0
                    ),
                    deleted: result.deleted,
                  }),
                  'warning'
                );
              } else if (failed === 0 && isStatusFiltered) {
                showNotification(
                  t('auth_files.delete_filtered_result_success', { count: success }),
                  'success'
                );
              } else if (failed === 0 && isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_success', {
                        count: success,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_success', { count: success }),
                  'success'
                );
              } else if (failed === 0) {
                showNotification(
                  t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
                  'success'
                );
              } else if (isStatusFiltered) {
                showNotification(
                  t('auth_files.delete_filtered_result_partial', { success, failed }),
                  'warning'
                );
              } else if (isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_partial', {
                        success,
                        failed,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_partial', { success, failed }),
                  'warning'
                );
              } else {
                showNotification(
                  t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
                  'warning'
                );
              }

              if (isFiltered) {
                onResetFilterToAll();
              }
              if (isProblemOnly) {
                onResetProblemOnly();
              }
              if (isEnabledOnly) {
                onResetEnabledOnly();
              }
              if (isDisabledOnly) {
                onResetDisabledOnly();
              }
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : '';
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeletingAll(false);
          }
        },
      });
    },
    [
      applyDeletedFiles,
      deselectAll,
      files,
      loadFiles,
      openDependencyDelete,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const handleDownload = useCallback(
    async (name: string) => {
      try {
        const response = await apiClient.getRaw(
          `/auth-files/download?name=${encodeURIComponent(name)}`,
          { responseType: 'blob' }
        );
        const blob = new Blob([response.data]);
        downloadBlob({ filename: name, blob });
        showNotification(t('auth_files.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [showNotification, t]
  );

  const handleStatusToggle = useCallback(
    async (item: AuthFileItem, enabled: boolean) => {
      if (isRetainedCodexAuthFile(item)) {
        showNotification(t('auth_files.retained_codex_toggle_blocked'), 'warning');
        return;
      }
      const name = item.name;
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, disabled: nextDisabled } : f)));

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: res.disabled } : f))
        );
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: previousDisabled } : f))
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [showNotification, t]
  );

  const handleXaiFieldToggle = useCallback(
    async (item: AuthFileItem, field: XaiAuthFileField, value: boolean) => {
      const provider = String(item.provider ?? item.type ?? '');
      if (!isXaiProvider(provider)) return;

      const name = item.name || String(item.id ?? '').trim();
      if (!name || xaiFieldsUpdating[name]?.[field]) return;
      const previousValue =
        field === 'using_api' ? readXaiAuthFileUsingApi(item) : readXaiAuthFileWebsockets(item);

      setXaiFieldsUpdating((prev) => ({
        ...prev,
        [name]: { ...prev[name], [field]: true },
      }));
      setFiles((prev) =>
        prev.map((file) =>
          file.name === item.name
            ? {
                ...file,
                [field]: value,
                ...(field === 'using_api' ? { usingApi: value } : {}),
              }
            : file
        )
      );

      try {
        await authFilesApi.patchFields(name, { [field]: value });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        setFiles((prev) =>
          prev.map((file) =>
            file.name === item.name
              ? {
                  ...file,
                  [field]: previousValue,
                  ...(field === 'using_api' ? { usingApi: previousValue } : {}),
                }
              : file
          )
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
        return;
      } finally {
        setXaiFieldsUpdating((prev) => {
          const current = prev[name];
          if (!current) return prev;
          const nextForFile = { ...current };
          delete nextForFile[field];
          const next = { ...prev };
          if (Object.keys(nextForFile).length > 0) {
            next[name] = nextForFile;
          } else {
            delete next[name];
          }
          return next;
        });
      }

      try {
        const requestSnapshotOrder = captureAuthFileSnapshotOrder();
        const data = await authFilesApi.list();
        setFiles(data?.files || []);
        setFilesSnapshotOrder(requestSnapshotOrder);
        setFilesLoadedAtMs(Date.now());
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.refresh_failed')}: ${errorMessage}`, 'warning');
      }

      showNotification(
        t('auth_files.xai_field_saved', {
          field: t(`auth_files.${field === 'using_api' ? 'using_api_label' : 'websockets_label'}`),
        }),
        'success'
      );
    },
    [showNotification, t, xaiFieldsUpdating]
  );

  const handleChatGptWebRelogin = useCallback(
    async (item: AuthFileItem) => {
      const provider = String(item.provider ?? item.type ?? '')
        .trim()
        .toLowerCase();
      if (provider !== 'chatgpt-web') return;
      const name = item.name || String(item.id ?? '').trim();
      if (!name || chatGptWebReloginUpdating[name]) return;

      setChatGptWebReloginUpdating((current) => ({ ...current, [name]: true }));
      try {
        const response = await chatGptWebApi.relogin(name);
        if (response.auth) {
          setFiles((current) =>
            current.map((file) => (file.name === item.name ? { ...file, ...response.auth } : file))
          );
        } else {
          await loadFiles({ background: true });
        }
        showNotification(
          response.warning || t('auth_files.chatgpt_web_relogin_success', { name: item.name }),
          response.warning ? 'warning' : 'success'
        );
      } catch (err: unknown) {
        const errorMessage = getChatGptWebErrorMessage(err, t);
        const diagnostics = getChatGptWebErrorDiagnosticMessages(err, t);
        showNotification(
          `${t('auth_files.chatgpt_web_relogin_failed')}: ${[errorMessage, ...diagnostics].join(
            ' · '
          )}`,
          'error'
        );
      } finally {
        setChatGptWebReloginUpdating((current) => {
          const next = { ...current };
          delete next[name];
          return next;
        });
      }
    },
    [chatGptWebReloginUpdating, loadFiles, showNotification, t]
  );

  const handleRestore = useCallback(
    async (item: AuthFileItem) => {
      if (!isRetainedCodexAuthFile(item) || restoring[item.name]) return;
      setRestoring((current) => ({ ...current, [item.name]: true }));
      try {
        await authFilesApi.restoreFile(item.name);
        await loadFiles({ background: true });
        showNotification(
          t('auth_files.retained_codex_restore_success', { name: item.name }),
          'success'
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        showNotification(t('auth_files.retained_codex_restore_failed', { message }), 'error');
      } finally {
        setRestoring((current) => {
          const next = { ...current };
          delete next[item.name];
          return next;
        });
      }
    },
    [loadFiles, restoring, showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      if (batchStatusPendingRef.current) return;

      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (uniqueNames.some((name) => statusUpdating[name] === true)) return;

      const retainedSkipped = files.filter(
        (file) => uniqueNames.includes(file.name) && isRetainedCodexAuthFile(file)
      ).length;

      const originalDisabled = new Map(
        files
          .filter((file) => uniqueNames.includes(file.name) && !isRetainedCodexAuthFile(file))
          .map((file) => [file.name, file.disabled === true])
      );
      const targetNames = new Set(originalDisabled.keys());
      const targetNameList = Array.from(targetNames);
      if (targetNameList.length === 0) {
        if (retainedSkipped > 0) {
          showNotification(t('auth_files.retained_codex_batch_status_blocked'), 'warning');
        }
        return;
      }

      const nextDisabled = !enabled;

      batchStatusPendingRef.current = true;
      setBatchStatusUpdating(true);
      setStatusUpdating((prev) => {
        const next = { ...prev };
        targetNameList.forEach((name) => {
          next[name] = true;
        });
        return next;
      });
      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(file.name) ? { ...file, disabled: nextDisabled } : file
        )
      );

      try {
        const results = await Promise.allSettled(
          targetNameList.map((name) => authFilesApi.setStatus(name, nextDisabled))
        );

        let successCount = 0;
        let failCount = 0;
        const failedNames = new Set<string>();
        const confirmedDisabled = new Map<string, boolean>();

        results.forEach((result, index) => {
          const name = targetNameList[index];
          if (result.status === 'fulfilled') {
            successCount++;
            confirmedDisabled.set(name, result.value.disabled);
          } else {
            failCount++;
            failedNames.add(name);
          }
        });

        setFiles((prev) =>
          prev.map((file) => {
            if (failedNames.has(file.name)) {
              return { ...file, disabled: originalDisabled.get(file.name) === true };
            }
            if (confirmedDisabled.has(file.name)) {
              return { ...file, disabled: confirmedDisabled.get(file.name) };
            }
            return file;
          })
        );

        if (failCount === 0) {
          showNotification(
            t('auth_files.batch_status_success', { count: successCount }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
            'warning'
          );
        }

        if (retainedSkipped > 0) {
          showNotification(
            t('auth_files.retained_codex_batch_status_skipped', { count: retainedSkipped }),
            'warning'
          );
        }

        deselectAll();
      } finally {
        batchStatusPendingRef.current = false;
        setBatchStatusUpdating(false);
        setStatusUpdating((prev) => {
          const next = { ...prev };
          targetNameList.forEach((name) => {
            delete next[name];
          });
          return next;
        });
      }
    },
    [deselectAll, files, showNotification, statusUpdating, t]
  );

  const batchDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      let successCount = 0;
      let failCount = 0;

      for (const name of uniqueNames) {
        try {
          const response = await apiClient.getRaw(
            `/auth-files/download?name=${encodeURIComponent(name)}`,
            { responseType: 'blob' }
          );
          const blob = new Blob([response.data]);
          downloadBlob({ filename: name, blob });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        showNotification(
          t('auth_files.batch_download_success', { count: successCount }),
          'success'
        );
      } else {
        showNotification(
          t('auth_files.batch_download_partial', { success: successCount, failed: failCount }),
          'warning'
        );
      }
    },
    [showNotification, t]
  );

  const batchArchiveDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (uniqueNames.length === 0 || archiveDownloadingSelected) return;

      setArchiveDownloadingSelected(true);
      try {
        const { blob, filename } = await authFilesApi.downloadArchiveByNames(uniqueNames);
        downloadBlob({ filename, blob });
        showNotification(
          t('auth_files.archive_download_selected_success', { count: uniqueNames.length }),
          'success'
        );
      } catch (err: unknown) {
        const { message, unsupported } = getArchiveDownloadErrorMeta(err);
        if (unsupported) {
          showNotification(t('auth_files.archive_download_unsupported'), 'warning');
        } else {
          showNotification(`${t('notification.download_failed')}: ${message}`, 'error');
        }
      } finally {
        setArchiveDownloadingSelected(false);
      }
    },
    [archiveDownloadingSelected, showNotification, t]
  );

  const downloadAllArchive = useCallback(async () => {
    if (archiveDownloadingAll) return;

    setArchiveDownloadingAll(true);
    try {
      const { blob, filename } = await authFilesApi.downloadArchiveAll();
      downloadBlob({ filename, blob });
      showNotification(t('auth_files.archive_download_all_success'), 'success');
    } catch (err: unknown) {
      const { message, unsupported } = getArchiveDownloadErrorMeta(err);
      if (unsupported) {
        showNotification(t('auth_files.archive_download_unsupported'), 'warning');
      } else {
        showNotification(`${t('notification.download_failed')}: ${message}`, 'error');
      }
    } finally {
      setArchiveDownloadingAll(false);
    }
  }, [archiveDownloadingAll, showNotification, t]);

  const clearAllCooldowns = useCallback(() => {
    if (clearingAllCooldowns) return;

    showConfirmation({
      title: t('auth_files.clear_cooldowns_all_title'),
      message: t('auth_files.clear_cooldowns_all_confirm'),
      variant: 'primary',
      confirmText: t('auth_files.clear_cooldowns_all_button'),
      onConfirm: async () => {
        setClearingAllCooldowns(true);
        try {
          const result = await authFilesApi.clearAllCooldowns();
          await Promise.allSettled([loadFiles(), refreshKeyStats()]);
          showNotification(
            t('auth_files.clear_cooldowns_all_success', {
              total: result.total,
              updated: result.updated,
            }),
            'success'
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : '';
          showNotification(t('auth_files.clear_cooldowns_failed', { message }), 'error');
        } finally {
          setClearingAllCooldowns(false);
        }
      },
    });
  }, [clearingAllCooldowns, loadFiles, refreshKeyStats, showConfirmation, showNotification, t]);

  const clearSelectedCooldowns = useCallback(
    (names: string[]) => {
      if (clearingSelectedCooldowns) return;

      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (uniqueNames.length === 0) {
        showNotification(t('auth_files.clear_cooldowns_selected_empty'), 'info');
        return;
      }

      showConfirmation({
        title: t('auth_files.clear_cooldowns_selected_title'),
        message: t('auth_files.clear_cooldowns_selected_confirm', { count: uniqueNames.length }),
        variant: 'primary',
        confirmText: t('auth_files.clear_cooldowns_selected_button'),
        onConfirm: async () => {
          setClearingSelectedCooldowns(true);
          try {
            const result = await authFilesApi.clearSelectedCooldowns({ names: uniqueNames });
            await Promise.allSettled([loadFiles(), refreshKeyStats()]);
            if (result.missing.length > 0) {
              showNotification(
                t('auth_files.clear_cooldowns_selected_success_with_missing', {
                  matched: result.matched,
                  updated: result.updated,
                  missing: formatMissingCooldownTargets(result.missing),
                }),
                'warning'
              );
            } else {
              showNotification(
                t('auth_files.clear_cooldowns_selected_success', {
                  matched: result.matched,
                  updated: result.updated,
                }),
                'success'
              );
            }
            deselectAll();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            showNotification(t('auth_files.clear_cooldowns_failed', { message }), 'error');
          } finally {
            setClearingSelectedCooldowns(false);
          }
        },
      });
    },
    [
      clearingSelectedCooldowns,
      deselectAll,
      loadFiles,
      refreshKeyStats,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (uniqueNames.length === 0) return;
      if (openDependencyDelete(uniqueNames)) return;

      showConfirmation({
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          await performDelete(uniqueNames, 'retain');
        },
      });
    },
    [openDependencyDelete, performDelete, showConfirmation, t]
  );

  return {
    files,
    filesLoadedAtMs,
    filesSnapshotOrder,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    archiveDownloadingSelected,
    archiveDownloadingAll,
    clearingAllCooldowns,
    clearingSelectedCooldowns,
    codexPlanRefreshTask,
    codexPlanRefreshLoading,
    codexPlanRefreshStarting,
    codexPlanRefreshActionLoading,
    statusUpdating,
    xaiFieldsUpdating,
    chatGptWebReloginUpdating,
    restoring,
    dependencyDelete,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    handleXaiFieldToggle,
    handleChatGptWebRelogin,
    handleRestore,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    replaceSelection,
    batchDownload,
    batchArchiveDownload,
    downloadAllArchive,
    clearAllCooldowns,
    clearSelectedCooldowns,
    refreshCodexPlanTypeRefreshStatus,
    startCodexPlanTypeRefresh,
    clearCodexPlanTypeRefresh,
    pauseCodexPlanTypeRefresh,
    resumeCodexPlanTypeRefresh,
    retryFailedCodexPlanTypeRefresh,
    batchSetStatus,
    batchDelete,
    closeDependencyDelete,
    confirmDependencyDelete,
  };
}
