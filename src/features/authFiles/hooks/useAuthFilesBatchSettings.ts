import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi, chatGptWebApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, ChatGptWebMutationTask } from '@/types';
import { isChatGptWebMutationTaskTerminal } from '@/types';
import type { AuthFileBatchFailure, AuthFileFieldsPatch } from '@/services/api/authFiles';
import {
  isRuntimeOnlyAuthFile,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import {
  parseHeadersText,
  type AuthFileHeaders,
  type AuthFileHeadersErrorKey,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';

export type AuthFilesBatchSettingsBooleanValue = '' | 'true' | 'false';

export type AuthFilesBatchSettingsField =
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'headersText'
  | 'disableCooling'
  | 'note'
  | 'usingApi'
  | 'websockets'
  | 'createChatGptWebCopy';

export type AuthFilesBatchSettingsState = {
  open: boolean;
  names: string[];
  saving: boolean;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  headersText: string;
  headersError: string | null;
  disableCooling: string;
  note: string;
  usingApi: AuthFilesBatchSettingsBooleanValue;
  websockets: AuthFilesBatchSettingsBooleanValue;
  codexNames: string[];
  createChatGptWebCopy: boolean;
  failures: AuthFileBatchFailure[];
};

export type UseAuthFilesBatchSettingsOptions = {
  files: AuthFileItem[];
  disableControls: boolean;
  loadFiles: () => Promise<void>;
  deselectAll: () => void;
  replaceSelection: (names: string[]) => void;
};

export type UseAuthFilesBatchSettingsResult = {
  batchSettings: AuthFilesBatchSettingsState;
  batchSettingsDirty: boolean;
  conversionTask: ChatGptWebMutationTask | null;
  conversionRefreshing: boolean;
  conversionCanceling: boolean;
  openBatchSettings: (names: string[]) => void;
  closeBatchSettings: () => void;
  handleBatchSettingsChange: (field: AuthFilesBatchSettingsField, value: string) => void;
  saveBatchSettings: () => Promise<void>;
  refreshConversionTask: () => Promise<void>;
  cancelConversionTask: () => Promise<void>;
};

type BatchSettingsPatch = AuthFileFieldsPatch & { headers?: AuthFileHeaders };

const CONVERSION_TASK_POLL_INTERVAL_MS = 1500;

const createEmptyBatchSettingsState = (): AuthFilesBatchSettingsState => ({
  open: false,
  names: [],
  saving: false,
  prefix: '',
  proxyUrl: '',
  priority: '',
  excludedModelsText: '',
  headersText: '',
  headersError: null,
  disableCooling: '',
  note: '',
  usingApi: '',
  websockets: '',
  codexNames: [],
  createChatGptWebCopy: false,
  failures: [],
});

const resolveTargetFiles = (names: string[], files: AuthFileItem[]): AuthFileItem[] => {
  const fileMap = new Map(files.map((file) => [file.name, file]));
  const seen = new Set<string>();
  const targets: AuthFileItem[] = [];

  names.forEach((name) => {
    const normalized = String(name ?? '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const file = fileMap.get(normalized);
    if (!file || isRuntimeOnlyAuthFile(file)) return;
    targets.push(file);
  });

  return targets;
};

const hasPatchFields = (patch: BatchSettingsPatch): boolean => Object.keys(patch).length > 0;

const isCodexAuthFile = (file: AuthFileItem): boolean =>
  normalizeProviderKey(String(file.provider ?? file.type ?? '')) === 'codex' &&
  file.retained_for_dependents !== true &&
  file.deletion_state !== 'retained_for_dependents';

const buildBatchSettingsPatch = (
  state: AuthFilesBatchSettingsState
): { patch: BatchSettingsPatch; errorKey: AuthFileHeadersErrorKey | null } => {
  const patch: BatchSettingsPatch = {};

  if (state.prefix.trim()) {
    patch.prefix = state.prefix;
  }
  if (state.proxyUrl.trim()) {
    patch.proxy_url = state.proxyUrl;
  }

  if (state.priority.trim()) {
    if (state.priority.trim().toLowerCase() === 'null') {
      patch.priority = null;
    } else {
      const parsedPriority = parsePriorityValue(state.priority);
      if (parsedPriority !== undefined) {
        patch.priority = parsedPriority;
      }
    }
  }

  if (state.excludedModelsText.trim()) {
    const excludedModels = parseExcludedModelsText(state.excludedModelsText);
    if (excludedModels.length > 0) {
      patch.excluded_models = excludedModels;
    }
  }

  if (state.headersText.trim()) {
    const { value: parsedHeaders, errorKey } = parseHeadersText(state.headersText);
    if (errorKey) {
      return { patch, errorKey };
    }
    if (parsedHeaders) {
      patch.headers = parsedHeaders;
    }
  }

  if (state.disableCooling.trim()) {
    const parsedDisableCooling = parseDisableCoolingValue(state.disableCooling);
    if (parsedDisableCooling !== undefined) {
      patch.disable_cooling = parsedDisableCooling;
    }
  }

  if (state.note.trim()) {
    patch.note = state.note;
  }

  if (state.usingApi !== '') {
    patch.using_api = state.usingApi === 'true';
  }

  if (state.websockets !== '') {
    patch.websockets = state.websockets === 'true';
  }

  return { patch, errorKey: null };
};

export function useAuthFilesBatchSettings(
  options: UseAuthFilesBatchSettingsOptions
): UseAuthFilesBatchSettingsResult {
  const { files, disableControls, loadFiles, deselectAll, replaceSelection } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [batchSettings, setBatchSettings] = useState<AuthFilesBatchSettingsState>(
    createEmptyBatchSettingsState
  );
  const [conversionTask, setConversionTask] = useState<ChatGptWebMutationTask | null>(null);
  const [conversionRefreshing, setConversionRefreshing] = useState(false);
  const [conversionCanceling, setConversionCanceling] = useState(false);
  const handledConversionTaskIdRef = useRef('');
  const conversionPollErrorNotifiedRef = useRef(false);
  const conversionFieldFailureNamesRef = useRef<string[]>([]);

  const batchSettingsDirty = useMemo(
    () =>
      Boolean(
        batchSettings.prefix.trim() ||
        batchSettings.proxyUrl.trim() ||
        batchSettings.priority.trim() ||
        batchSettings.excludedModelsText.trim() ||
        batchSettings.headersText.trim() ||
        batchSettings.disableCooling.trim() ||
        batchSettings.note.trim() ||
        batchSettings.usingApi ||
        batchSettings.websockets ||
        batchSettings.createChatGptWebCopy
      ),
    [batchSettings]
  );

  const closeBatchSettings = () => {
    if (
      batchSettings.saving ||
      (conversionTask && !isChatGptWebMutationTaskTerminal(conversionTask.state))
    ) {
      return;
    }
    setBatchSettings(createEmptyBatchSettingsState());
    setConversionTask(null);
    handledConversionTaskIdRef.current = '';
    conversionFieldFailureNamesRef.current = [];
  };

  const openBatchSettings = (names: string[]) => {
    if (disableControls) return;
    const targets = resolveTargetFiles(names, files);
    if (targets.length === 0) {
      showNotification(t('auth_files.batch_settings_no_targets'), 'warning');
      return;
    }
    setBatchSettings({
      ...createEmptyBatchSettingsState(),
      open: true,
      names: targets.map((file) => file.name),
      codexNames: targets.filter(isCodexAuthFile).map((file) => file.name),
    });
    setConversionTask(null);
    handledConversionTaskIdRef.current = '';
    conversionPollErrorNotifiedRef.current = false;
    conversionFieldFailureNamesRef.current = [];
  };

  const handleBatchSettingsChange = (field: AuthFilesBatchSettingsField, value: string) => {
    setBatchSettings((prev) => {
      if (field === 'createChatGptWebCopy') {
        return {
          ...prev,
          createChatGptWebCopy: value === 'true',
          failures: [],
        };
      }
      if (field === 'headersText') {
        const headersText = String(value);
        const { errorKey } = parseHeadersText(headersText);
        return {
          ...prev,
          headersText,
          headersError: errorKey ? t(errorKey) : null,
          failures: [],
        };
      }
      return { ...prev, [field]: String(value), failures: [] };
    });
  };

  const applyConversionTask = useCallback(
    (nextTask: ChatGptWebMutationTask) => {
      setConversionTask(nextTask);
      conversionPollErrorNotifiedRef.current = false;
      if (
        !isChatGptWebMutationTaskTerminal(nextTask.state) ||
        handledConversionTaskIdRef.current === nextTask.id
      ) {
        return;
      }

      handledConversionTaskIdRef.current = nextTask.id;
      const failedNames = Array.from(
        new Set([
          ...conversionFieldFailureNamesRef.current,
          ...nextTask.results
            .filter((result) => result.status === 'failed' || result.status === 'canceled')
            .map((result) => String(result.source_name ?? '').trim())
            .filter(Boolean),
        ])
      );
      if (failedNames.length > 0) {
        replaceSelection(failedNames);
      } else {
        deselectAll();
      }
      void loadFiles().catch(() => {});

      if (nextTask.failed > 0 || nextTask.canceled > 0) {
        showNotification(
          t('auth_files.chatgpt_web_conversion_completed_with_errors', {
            succeeded: nextTask.succeeded,
            failed: nextTask.failed,
            canceled: nextTask.canceled,
          }),
          'warning'
        );
      } else {
        showNotification(
          t('auth_files.chatgpt_web_conversion_completed', {
            count: nextTask.succeeded,
          }),
          'success'
        );
      }
    },
    [deselectAll, loadFiles, replaceSelection, showNotification, t]
  );

  const fetchConversionTask = useCallback(
    async (taskId: string, quiet = false): Promise<ChatGptWebMutationTask | null> => {
      if (!quiet) setConversionRefreshing(true);
      try {
        const nextTask = await chatGptWebApi.getConversionTask(taskId);
        applyConversionTask(nextTask);
        return nextTask;
      } catch (error) {
        if (!quiet || !conversionPollErrorNotifiedRef.current) {
          const message = error instanceof Error ? error.message : '';
          showNotification(
            t('auth_files.chatgpt_web_conversion_refresh_failed', { message }),
            'error'
          );
          conversionPollErrorNotifiedRef.current = true;
        }
        return null;
      } finally {
        if (!quiet) setConversionRefreshing(false);
      }
    },
    [applyConversionTask, showNotification, t]
  );

  const conversionTaskId = conversionTask?.id ?? '';
  const conversionTaskState = conversionTask?.state;

  useEffect(() => {
    if (
      !conversionTaskId ||
      !conversionTaskState ||
      isChatGptWebMutationTaskTerminal(conversionTaskState)
    ) {
      return undefined;
    }
    let disposed = false;
    let timer: number | undefined;

    const poll = async () => {
      const nextTask = await fetchConversionTask(conversionTaskId, true);
      if (disposed || (nextTask && isChatGptWebMutationTaskTerminal(nextTask.state))) return;
      timer = window.setTimeout(poll, CONVERSION_TASK_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, CONVERSION_TASK_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [conversionTaskId, conversionTaskState, fetchConversionTask]);

  const refreshConversionTask = useCallback(async () => {
    if (!conversionTaskId) return;
    await fetchConversionTask(conversionTaskId);
  }, [conversionTaskId, fetchConversionTask]);

  const cancelConversionTask = useCallback(async () => {
    if (
      !conversionTask ||
      conversionCanceling ||
      conversionTask.state === 'canceling' ||
      isChatGptWebMutationTaskTerminal(conversionTask.state)
    ) {
      return;
    }
    setConversionCanceling(true);
    try {
      const nextTask = await chatGptWebApi.cancelConversionTask(conversionTask.id);
      applyConversionTask(nextTask);
      showNotification(t('auth_files.chatgpt_web_conversion_cancel_requested'), 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      showNotification(t('auth_files.chatgpt_web_conversion_cancel_failed', { message }), 'error');
    } finally {
      setConversionCanceling(false);
    }
  }, [applyConversionTask, conversionCanceling, conversionTask, showNotification, t]);

  const saveBatchSettings = async () => {
    if (disableControls || batchSettings.saving) return;

    const targets = resolveTargetFiles(batchSettings.names, files);
    if (targets.length === 0) {
      showNotification(t('auth_files.batch_settings_no_targets'), 'warning');
      return;
    }

    const { patch, errorKey } = buildBatchSettingsPatch(batchSettings);
    if (errorKey) {
      showNotification(t(errorKey), 'error');
      return;
    }
    const shouldCreateWebCopies =
      batchSettings.createChatGptWebCopy && batchSettings.codexNames.length > 0;
    const shouldPatchFields = hasPatchFields(patch);
    if (!shouldPatchFields && !shouldCreateWebCopies) {
      showNotification(t('auth_files.batch_settings_no_fields'), 'warning');
      return;
    }

    setBatchSettings((prev) => ({ ...prev, saving: true, failures: [] }));

    try {
      const targetNames = targets.map((file) => file.name);
      const result = shouldPatchFields
        ? await authFilesApi.patchFieldsBatch(targetNames, patch)
        : {
            status: 'ok',
            matched: targetNames.length,
            updated: 0,
            files: targetNames,
            failed: [] as AuthFileBatchFailure[],
          };
      const failedNames = result.failed.map((failure) => failure.name).filter(Boolean);

      if (shouldCreateWebCopies) {
        const conversionNames = targets.filter(isCodexAuthFile).map((file) => file.name);
        if (conversionNames.length === 0) {
          const retainedNames =
            failedNames.length > 0 ? failedNames : targets.map((file) => file.name);
          replaceSelection(retainedNames);
          setBatchSettings((prev) => ({
            ...prev,
            names: retainedNames,
            saving: false,
            failures: result.failed,
          }));
          if (result.updated > 0) void loadFiles().catch(() => {});
          showNotification(t('auth_files.chatgpt_web_conversion_no_sources'), 'warning');
          return;
        }

        let nextTask: ChatGptWebMutationTask;
        try {
          nextTask = await chatGptWebApi.startConversionTask(conversionNames);
        } catch (error) {
          const retryNames = Array.from(new Set([...conversionNames, ...failedNames]));
          replaceSelection(retryNames);
          setBatchSettings((prev) => ({
            ...prev,
            names: retryNames,
            saving: false,
            failures: result.failed,
          }));
          if (result.updated > 0) void loadFiles().catch(() => {});
          const message = error instanceof Error ? error.message : '';
          showNotification(
            t('auth_files.chatgpt_web_conversion_start_failed', { message }),
            'error'
          );
          return;
        }
        handledConversionTaskIdRef.current = '';
        conversionPollErrorNotifiedRef.current = false;
        conversionFieldFailureNamesRef.current = failedNames;
        setConversionTask(nextTask);
        setBatchSettings({
          ...createEmptyBatchSettingsState(),
          open: true,
          names: Array.from(new Set([...conversionNames, ...failedNames])),
          codexNames: conversionNames,
          failures: result.failed,
        });
        deselectAll();
        if (isChatGptWebMutationTaskTerminal(nextTask.state)) {
          applyConversionTask(nextTask);
        }
        if (result.updated > 0) void loadFiles().catch(() => {});

        if (result.failed.length > 0) {
          showNotification(
            t('auth_files.batch_settings_partial', {
              success: result.updated,
              failed: result.failed.length,
            }),
            'warning'
          );
        }
        showNotification(
          t('auth_files.chatgpt_web_conversion_started', { count: conversionNames.length }),
          'success'
        );
        return;
      }

      if (result.failed.length === 0) {
        deselectAll();
        setBatchSettings(createEmptyBatchSettingsState());
        void loadFiles().catch(() => {});
        showNotification(
          t('auth_files.batch_settings_success', { count: result.updated }),
          'success'
        );
        return;
      }

      const retainedNames = failedNames.length > 0 ? failedNames : targets.map((file) => file.name);
      replaceSelection(retainedNames);
      setBatchSettings((prev) => ({
        ...prev,
        names: retainedNames,
        saving: false,
        failures: result.failed,
      }));
      if (result.updated > 0) {
        void loadFiles().catch(() => {});
      }

      showNotification(
        result.updated > 0
          ? t('auth_files.batch_settings_partial', {
              success: result.updated,
              failed: result.failed.length,
            })
          : t('auth_files.batch_settings_failed', { failed: result.failed.length }),
        result.updated > 0 ? 'warning' : 'error'
      );
    } catch (err: unknown) {
      setBatchSettings((prev) => ({ ...prev, saving: false }));
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('auth_files.batch_settings_failed', { failed: targets.length })}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
  };

  return {
    batchSettings,
    batchSettingsDirty,
    conversionTask,
    conversionRefreshing,
    conversionCanceling,
    openBatchSettings,
    closeBatchSettings,
    handleBatchSettingsChange,
    saveBatchSettings,
    refreshConversionTask,
    cancelConversionTask,
  };
}
