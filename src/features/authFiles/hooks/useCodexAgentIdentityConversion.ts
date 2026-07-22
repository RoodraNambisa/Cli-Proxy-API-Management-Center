import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { codexAgentIdentityApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { CodexAgentIdentityTask, CodexAuthMode } from '@/types';
import { isCodexAgentIdentityTaskTerminal } from '@/types';

const CONVERSION_TASK_POLL_INTERVAL_MS = 1500;

export type CodexAgentIdentityConversionSource = 'names' | 'access_tokens';

export type CodexAgentIdentityConversionState = {
  open: boolean;
  source: CodexAgentIdentityConversionSource;
  names: string[];
  targetMode: CodexAuthMode;
  accessTokenText: string;
  task: CodexAgentIdentityTask | null;
  starting: boolean;
  refreshing: boolean;
  canceling: boolean;
};

export type UseCodexAgentIdentityConversionOptions = {
  loadFiles: () => Promise<void>;
  deselectAll: () => void;
  replaceSelection: (names: string[]) => void;
};

const createInitialState = (): CodexAgentIdentityConversionState => ({
  open: false,
  source: 'names',
  names: [],
  targetMode: 'agentIdentity',
  accessTokenText: '',
  task: null,
  starting: false,
  refreshing: false,
  canceling: false,
});

const normalizeNames = (names: string[]): string[] =>
  Array.from(new Set(names.map((name) => String(name ?? '').trim()).filter(Boolean)));

const parseAccessTokens = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );

const taskStatusRank = (status: string): number => {
  if (status === 'queued') return 0;
  if (status === 'running') return 1;
  if (status === 'canceling') return 2;
  return isCodexAgentIdentityTaskTerminal(status) ? 3 : 1;
};

const isOlderTaskSnapshot = (
  current: CodexAgentIdentityTask | null,
  next: CodexAgentIdentityTask
): boolean => {
  if (!current || current.id !== next.id) return false;
  const currentRank = taskStatusRank(current.status);
  const nextRank = taskStatusRank(next.status);
  if (nextRank !== currentRank) return nextRank < currentRank;
  return (
    next.status === current.status &&
    Number(next.progress_percent) < Number(current.progress_percent)
  );
};

export function useCodexAgentIdentityConversion(options: UseCodexAgentIdentityConversionOptions) {
  const { loadFiles, deselectAll, replaceSelection } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((store) => store.showNotification);
  const [state, setState] = useState<CodexAgentIdentityConversionState>(createInitialState);
  const taskRef = useRef<CodexAgentIdentityTask | null>(null);
  const handledTaskIdRef = useRef('');
  const pollErrorNotifiedRef = useRef(false);
  const sourceRef = useRef<CodexAgentIdentityConversionSource>('names');

  const active = Boolean(state.task && !isCodexAgentIdentityTaskTerminal(state.task.status));
  const accessTokenCount = useMemo(
    () => parseAccessTokens(state.accessTokenText).length,
    [state.accessTokenText]
  );

  const applyTask = useCallback(
    (task: CodexAgentIdentityTask) => {
      if (isOlderTaskSnapshot(taskRef.current, task)) return;
      taskRef.current = task;
      setState((current) => ({ ...current, task }));
      pollErrorNotifiedRef.current = false;
      if (!isCodexAgentIdentityTaskTerminal(task.status) || handledTaskIdRef.current === task.id) {
        return;
      }

      handledTaskIdRef.current = task.id;
      if (sourceRef.current === 'names') {
        const failedNames = normalizeNames(
          task.results
            .filter((result) => result.status === 'failed' || result.status === 'canceled')
            .map((result) => result.source_name)
        );
        if (failedNames.length > 0) {
          replaceSelection(failedNames);
        } else {
          deselectAll();
        }
      }
      void loadFiles().catch(() => {});

      if (task.failed > 0 || task.canceled > 0) {
        showNotification(
          t('auth_files.codex_identity_completed_with_errors', {
            succeeded: task.succeeded,
            failed: task.failed,
            canceled: task.canceled,
          }),
          'warning'
        );
      } else {
        showNotification(
          t('auth_files.codex_identity_completed', { count: task.succeeded }),
          'success'
        );
      }
    },
    [deselectAll, loadFiles, replaceSelection, showNotification, t]
  );

  const openNames = useCallback((names: string[], targetMode: CodexAuthMode) => {
    const normalized = normalizeNames(names);
    if (normalized.length === 0) return;
    sourceRef.current = 'names';
    taskRef.current = null;
    handledTaskIdRef.current = '';
    pollErrorNotifiedRef.current = false;
    setState({
      ...createInitialState(),
      open: true,
      source: 'names',
      names: normalized,
      targetMode,
    });
  }, []);

  const openAccessTokens = useCallback(() => {
    sourceRef.current = 'access_tokens';
    taskRef.current = null;
    handledTaskIdRef.current = '';
    pollErrorNotifiedRef.current = false;
    setState({
      ...createInitialState(),
      open: true,
      source: 'access_tokens',
      targetMode: 'agentIdentity',
    });
  }, []);

  const close = useCallback(() => {
    if (state.starting || active) return;
    setState(createInitialState());
    taskRef.current = null;
    handledTaskIdRef.current = '';
    pollErrorNotifiedRef.current = false;
  }, [active, state.starting]);

  const setAccessTokenText = useCallback((value: string) => {
    setState((current) => ({ ...current, accessTokenText: value }));
  }, []);

  const start = useCallback(async () => {
    if (state.starting || active || state.task) return;
    const names = normalizeNames(state.names);
    const accessTokens = parseAccessTokens(state.accessTokenText);
    if (state.source === 'names' && names.length === 0) {
      showNotification(t('auth_files.codex_identity_no_targets'), 'warning');
      return;
    }
    if (state.source === 'access_tokens' && accessTokens.length === 0) {
      showNotification(t('auth_files.codex_identity_tokens_required'), 'warning');
      return;
    }

    setState((current) => ({ ...current, starting: true }));
    try {
      const task =
        state.source === 'names'
          ? await codexAgentIdentityApi.startNamesTask(names, state.targetMode)
          : await codexAgentIdentityApi.startAccessTokensTask(accessTokens);
      setState((current) => ({
        ...current,
        starting: false,
        accessTokenText: '',
      }));
      applyTask(task);
      showNotification(
        t('auth_files.codex_identity_started', {
          count: state.source === 'names' ? names.length : accessTokens.length,
        }),
        'success'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setState((current) => ({ ...current, starting: false }));
      showNotification(t('auth_files.codex_identity_start_failed', { message }), 'error');
    }
  }, [active, applyTask, showNotification, state, t]);

  const fetchTask = useCallback(
    async (taskId: string, quiet = false): Promise<CodexAgentIdentityTask | null> => {
      if (!quiet) setState((current) => ({ ...current, refreshing: true }));
      try {
        const task = await codexAgentIdentityApi.getTask(taskId);
        applyTask(task);
        return task;
      } catch (error) {
        if (!quiet || !pollErrorNotifiedRef.current) {
          const message = error instanceof Error ? error.message : '';
          showNotification(t('auth_files.codex_identity_refresh_failed', { message }), 'error');
          pollErrorNotifiedRef.current = true;
        }
        return null;
      } finally {
        if (!quiet) setState((current) => ({ ...current, refreshing: false }));
      }
    },
    [applyTask, showNotification, t]
  );

  useEffect(() => {
    const task = state.task;
    if (!task || isCodexAgentIdentityTaskTerminal(task.status)) return undefined;
    let disposed = false;
    let timer: number | undefined;

    const poll = async () => {
      const nextTask = await fetchTask(task.id, true);
      if (disposed || (nextTask && isCodexAgentIdentityTaskTerminal(nextTask.status))) return;
      timer = window.setTimeout(poll, CONVERSION_TASK_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, CONVERSION_TASK_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [fetchTask, state.task]);

  const refresh = useCallback(async () => {
    if (!state.task) return;
    await fetchTask(state.task.id);
  }, [fetchTask, state.task]);

  const cancel = useCallback(async () => {
    const task = state.task;
    if (
      !task ||
      state.canceling ||
      task.status === 'canceling' ||
      isCodexAgentIdentityTaskTerminal(task.status)
    ) {
      return;
    }
    setState((current) => ({ ...current, canceling: true }));
    try {
      const nextTask = await codexAgentIdentityApi.cancelTask(task.id);
      applyTask(nextTask);
      showNotification(t('auth_files.codex_identity_cancel_requested'), 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      showNotification(t('auth_files.codex_identity_cancel_failed', { message }), 'error');
    } finally {
      setState((current) => ({ ...current, canceling: false }));
    }
  }, [applyTask, showNotification, state.canceling, state.task, t]);

  return {
    state,
    active,
    accessTokenCount,
    openNames,
    openAccessTokens,
    close,
    setAccessTokenText,
    start,
    refresh,
    cancel,
  };
}
