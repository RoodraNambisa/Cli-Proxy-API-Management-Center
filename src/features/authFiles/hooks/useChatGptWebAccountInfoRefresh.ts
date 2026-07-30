import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, chatGptWebApi, type ApiClientConnectionSnapshot } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { ChatGptWebAccountInfoRefreshTask } from '@/types';
import { isChatGptWebAccountInfoRefreshTaskTerminal } from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import {
  clearChatGptWebAccountInfoUnsupported,
  isChatGptWebAccountInfoUnsupported,
  markChatGptWebAccountInfoUnsupported,
  subscribeChatGptWebAccountInfoCapability,
} from '@/features/chatgptWeb/accountInfoCapability';

const POLL_INTERVAL_MS = 1500;
const AUTO_REFRESH_DEBOUNCE_MS = 300;
const MAX_REFRESH_TASK_NAMES = 500;
const REFRESH_QUEUE_FULL_ERROR = 'refresh_queue_full';
const MAX_QUEUE_FULL_RETRIES = 3;
const MAX_AUTOMATIC_REFRESH_RETRIES = 3;
const MAX_CAPACITY_WAIT_POLLS = 20;
const MAX_TASK_POLL_FAILURES = 3;
const MAX_TASK_STALL_POLLS = 400;
const REFRESH_TASK_NOT_FOUND_ERROR = 'refresh_task_not_found';
const REFRESH_TASK_STALLED_ERROR = 'refresh_task_stalled';
const AUTOMATIC_RETRYABLE_ERRORS = new Set([
  REFRESH_TASK_NOT_FOUND_ERROR,
  'rate_limited',
  'upstream_unavailable',
  'network_error',
  'refresh_failed',
]);

type UseChatGptWebAccountInfoRefreshOptions = {
  active: boolean;
  disabled: boolean;
  automaticRefreshEnabled?: boolean;
  connectionGenerationKey?: string;
  visibleScopeKey: string;
  visibleNames: string[];
  selectedNames: string[];
  reloadFiles: () => Promise<unknown>;
};

type RefreshRunControl = {
  generation: number;
  lifecycleGeneration: number;
  connectionGenerationKey: string;
  connection: ApiClientConnectionSnapshot;
  abortController: AbortController;
  automaticGeneration?: number;
  isLifecycleCurrent: () => boolean;
  isCurrent: () => boolean;
};

type ActiveRefreshRun = {
  abortController: AbortController;
  automaticGeneration?: number;
};

type TrackedRefreshTask = {
  runGeneration: number;
  lifecycleGeneration: number;
  connectionGenerationKey: string;
  automaticGeneration?: number;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

const isAutomaticRefreshRequestRetryable = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
};

const createFailedRefreshTask = (
  id: string,
  names: string[],
  error: string
): ChatGptWebAccountInfoRefreshTask => ({
  id,
  state: 'completed_with_errors',
  total: names.length,
  processed: names.length,
  failed: names.length,
  results: names.map((name) => ({ name, status: 'failed', error })),
});

const TERMINAL_REFRESH_RESULT_STATUSES = new Set([
  'updated',
  'unchanged',
  'fresh',
  'partial',
  'failed',
  'canceled',
]);

const createStalledRefreshTask = (
  task: ChatGptWebAccountInfoRefreshTask,
  names: string[]
): ChatGptWebAccountInfoRefreshTask => {
  const currentResults = new Map((task.results ?? []).map((result) => [result.name, result]));
  const results = names.map((name) => {
    const current = currentResults.get(name);
    if (current && TERMINAL_REFRESH_RESULT_STATUSES.has(current.status)) return current;
    return { ...current, name, status: 'failed', error: REFRESH_TASK_STALLED_ERROR };
  });
  const count = (status: string) => results.filter((result) => result.status === status).length;
  const updated = count('updated');
  const unchanged = count('unchanged');
  const fresh = count('fresh');
  const partial = count('partial');
  const failed = count('failed');
  const canceled = count('canceled');
  return {
    ...task,
    state: 'completed_with_errors',
    total: results.length,
    processed: results.length,
    succeeded: updated + unchanged + fresh + partial,
    updated,
    unchanged,
    fresh,
    partial,
    failed,
    canceled,
    results,
  };
};

export function useChatGptWebAccountInfoRefresh({
  active,
  disabled,
  automaticRefreshEnabled = true,
  connectionGenerationKey = '',
  visibleScopeKey,
  visibleNames,
  selectedNames,
  reloadFiles,
}: UseChatGptWebAccountInfoRefreshOptions) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const mountedRef = useRef(true);
  const activeRef = useRef(active);
  const disabledRef = useRef(disabled);
  const automaticRefreshEnabledRef = useRef(automaticRefreshEnabled);
  const timersRef = useRef(new Map<number, () => void>());
  const activeTasksRef = useRef(new Map<string, TrackedRefreshTask>());
  const activeRunsRef = useRef(new Map<number, ActiveRefreshRun>());
  const automaticScopeKeyRef = useRef('');
  const automaticScopeInitializedRef = useRef(false);
  const automaticScopeNamesRef = useRef(new Set<string>());
  const automaticallyRefreshedNamesRef = useRef(new Set<string>());
  const automaticGenerationRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const runGenerationRef = useRef(0);
  const manualRunGenerationRef = useRef<number | null>(null);
  const connectionGenerationKeyRef = useRef(connectionGenerationKey);
  const previousAvailabilityRef = useRef({
    active,
    disabled,
    connectionGenerationKey,
  });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [manualLiveMessage, setManualLiveMessage] = useState('');
  const initiallyUnsupported = isChatGptWebAccountInfoUnsupported(connectionGenerationKey);
  const [unsupported, setUnsupported] = useState(initiallyUnsupported);
  const unsupportedRef = useRef(initiallyUnsupported);
  activeRef.current = active;
  disabledRef.current = disabled;
  automaticRefreshEnabledRef.current = automaticRefreshEnabled;
  connectionGenerationKeyRef.current = connectionGenerationKey;
  const visibleNamesKey = JSON.stringify(
    Array.from(new Set(visibleNames.map((name) => name.trim()).filter(Boolean)))
  );

  const cancelTaskById = useCallback((taskId: string) => {
    void chatGptWebApi.cancelAccountInfoRefreshTask(taskId).catch(() => {});
  }, []);

  const cancelTrackedTasks = useCallback(
    (shouldCancel?: (task: TrackedRefreshTask) => boolean) => {
      for (const [taskId, tracked] of activeTasksRef.current) {
        if (shouldCancel && !shouldCancel(tracked)) continue;
        activeTasksRef.current.delete(taskId);
        cancelTaskById(taskId);
      }
    },
    [cancelTaskById]
  );

  const abortActiveRuns = useCallback((shouldAbort?: (run: ActiveRefreshRun) => boolean) => {
    for (const [generation, run] of activeRunsRef.current) {
      if (shouldAbort && !shouldAbort(run)) continue;
      activeRunsRef.current.delete(generation);
      run.abortController.abort();
    }
  }, []);

  const createRunControl = useCallback((automaticGeneration?: number): RefreshRunControl => {
    const generation = runGenerationRef.current + 1;
    runGenerationRef.current = generation;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const runConnectionGenerationKey = connectionGenerationKeyRef.current;
    const connection = apiClient.captureConnection();
    const abortController = new AbortController();
    activeRunsRef.current.set(generation, { abortController, automaticGeneration });
    const isLifecycleCurrent = () =>
      mountedRef.current &&
      activeRef.current &&
      !disabledRef.current &&
      lifecycleGenerationRef.current === lifecycleGeneration &&
      connectionGenerationKeyRef.current === runConnectionGenerationKey;
    return {
      generation,
      lifecycleGeneration,
      connectionGenerationKey: runConnectionGenerationKey,
      connection,
      abortController,
      automaticGeneration,
      isLifecycleCurrent,
      isCurrent: () =>
        !abortController.signal.aborted &&
        isLifecycleCurrent() &&
        !unsupportedRef.current &&
        (automaticGeneration === undefined || automaticRefreshEnabledRef.current) &&
        (automaticGeneration === undefined ||
          automaticGenerationRef.current === automaticGeneration),
    };
  }, []);

  const markUnsupported = useCallback(() => {
    markChatGptWebAccountInfoUnsupported(connectionGenerationKeyRef.current);
    unsupportedRef.current = true;
    abortActiveRuns();
    cancelTrackedTasks();
    if (mountedRef.current) {
      setUnsupported(true);
      setManualRefreshing(false);
    }
  }, [abortActiveRuns, cancelTrackedTasks]);

  const clearUnsupported = useCallback(() => {
    clearChatGptWebAccountInfoUnsupported(connectionGenerationKeyRef.current);
    unsupportedRef.current = false;
    if (mountedRef.current) setUnsupported(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      manualRunGenerationRef.current = null;
      abortActiveRuns();
      cancelTrackedTasks();
      timers.forEach((resolve, timer) => {
        window.clearTimeout(timer);
        resolve();
      });
      timers.clear();
    };
  }, [abortActiveRuns, cancelTrackedTasks]);

  useEffect(() => {
    const synchronizeUnsupported = (key: string, nextUnsupported: boolean) => {
      if (key !== connectionGenerationKeyRef.current) return;
      unsupportedRef.current = nextUnsupported;
      if (nextUnsupported) {
        abortActiveRuns();
        cancelTrackedTasks();
        setManualRefreshing(false);
      }
      setUnsupported(nextUnsupported);
    };
    synchronizeUnsupported(
      connectionGenerationKeyRef.current,
      isChatGptWebAccountInfoUnsupported(connectionGenerationKeyRef.current)
    );
    return subscribeChatGptWebAccountInfoCapability(synchronizeUnsupported);
  }, [abortActiveRuns, cancelTrackedTasks]);

  useEffect(() => {
    if (active && !disabled) return;
    lifecycleGenerationRef.current += 1;
    manualRunGenerationRef.current = null;
    abortActiveRuns();
    cancelTrackedTasks();
    setManualRefreshing(false);
  }, [abortActiveRuns, active, cancelTrackedTasks, disabled]);

  useEffect(() => {
    const previous = previousAvailabilityRef.current;
    const connectionChanged = previous.connectionGenerationKey !== connectionGenerationKey;
    const wasUnsupported = unsupportedRef.current;
    previousAvailabilityRef.current = {
      active,
      disabled,
      connectionGenerationKey,
    };

    if (connectionChanged) {
      lifecycleGenerationRef.current += 1;
      manualRunGenerationRef.current = null;
      abortActiveRuns();
      cancelTrackedTasks();
      automaticScopeKeyRef.current = '';
      automaticScopeInitializedRef.current = false;
      automaticScopeNamesRef.current.clear();
      automaticallyRefreshedNamesRef.current.clear();
      setManualRefreshing(false);
      setManualLiveMessage('');
      const cachedUnsupported = isChatGptWebAccountInfoUnsupported(connectionGenerationKey);
      unsupportedRef.current = cachedUnsupported;
      setUnsupported(cachedUnsupported);
    }
    if (!active || disabled || !connectionChanged || !wasUnsupported || unsupportedRef.current) {
      return;
    }

    const probeController = new AbortController();
    const probeConnectionGeneration = connectionGenerationKey;
    const probeConnection = apiClient.captureConnection();
    void chatGptWebApi
      .getAccountInfo(probeConnection, probeController.signal)
      .then(() => {
        if (
          !probeController.signal.aborted &&
          mountedRef.current &&
          activeRef.current &&
          !disabledRef.current &&
          connectionGenerationKeyRef.current === probeConnectionGeneration
        ) {
          clearUnsupported();
        }
      })
      .catch((error) => {
        if (
          getErrorStatus(error) === 404 &&
          !probeController.signal.aborted &&
          mountedRef.current &&
          connectionGenerationKeyRef.current === probeConnectionGeneration
        ) {
          markUnsupported();
        }
      });
    return () => {
      probeController.abort();
    };
  }, [
    abortActiveRuns,
    active,
    cancelTrackedTasks,
    clearUnsupported,
    connectionGenerationKey,
    disabled,
    markUnsupported,
  ]);

  const waitForPoll = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          timersRef.current.delete(timer);
          resolve();
        }, POLL_INTERVAL_MS);
        timersRef.current.set(timer, resolve);
      }),
    []
  );

  const pollTask = useCallback(
    async (
      initialTask: ChatGptWebAccountInfoRefreshTask,
      batchNames: string[],
      control: RefreshRunControl
    ): Promise<ChatGptWebAccountInfoRefreshTask> => {
      let task = initialTask;
      let consecutiveFailures = 0;
      let lastProgressKey = `${task.state}:${task.processed ?? 0}`;
      let stalledPolls = 0;
      while (
        control.isCurrent() &&
        activeTasksRef.current.has(task.id) &&
        !isChatGptWebAccountInfoRefreshTaskTerminal(task.state)
      ) {
        if (!control.isCurrent()) {
          try {
            return await chatGptWebApi.cancelAccountInfoRefreshTask(task.id);
          } catch {
            return task;
          }
        }
        await waitForPoll();
        if (!activeTasksRef.current.has(task.id)) {
          return task;
        }
        if (!control.isCurrent()) {
          try {
            return await chatGptWebApi.cancelAccountInfoRefreshTask(task.id);
          } catch {
            return task;
          }
        }
        try {
          task = await chatGptWebApi.getAccountInfoRefreshTask(
            task.id,
            control.abortController.signal
          );
          consecutiveFailures = 0;
          const progressKey = `${task.state}:${task.processed ?? 0}`;
          if (progressKey === lastProgressKey) {
            stalledPolls += 1;
          } else {
            lastProgressKey = progressKey;
            stalledPolls = 0;
          }
          if (
            stalledPolls >= MAX_TASK_STALL_POLLS &&
            !isChatGptWebAccountInfoRefreshTaskTerminal(task.state)
          ) {
            try {
              await chatGptWebApi.cancelAccountInfoRefreshTask(task.id);
            } catch {
              // Report the stalled task even if the best-effort cancellation fails.
            }
            return createStalledRefreshTask(task, batchNames);
          }
        } catch (error) {
          if (!control.isCurrent()) return task;
          if (getErrorStatus(error) === 404) {
            return createFailedRefreshTask(task.id, batchNames, REFRESH_TASK_NOT_FOUND_ERROR);
          }
          consecutiveFailures += 1;
          if (consecutiveFailures < MAX_TASK_POLL_FAILURES) continue;
          try {
            await chatGptWebApi.cancelAccountInfoRefreshTask(task.id);
          } catch {
            // Preserve the polling failure that made task state unknowable.
          }
          throw error;
        }
      }
      return task;
    },
    [waitForPoll]
  );

  const runRefresh = useCallback(
    async (names: string[], force: boolean, control: RefreshRunControl) => {
      const uniqueNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (uniqueNames.length === 0) {
        activeRunsRef.current.delete(control.generation);
        return [];
      }
      let pendingNames = uniqueNames;
      const tasks: ChatGptWebAccountInfoRefreshTask[] = [];
      const queueFullRetries = new Map<string, number>();
      let capacityWaitPolls = 0;
      try {
        while (control.isCurrent() && pendingNames.length > 0) {
          let batchSize = Math.min(MAX_REFRESH_TASK_NAMES, pendingNames.length);
          if (force) {
            let snapshot;
            try {
              snapshot = await chatGptWebApi.getAccountInfo(
                control.connection,
                control.abortController.signal
              );
              if (control.isCurrent()) clearUnsupported();
            } catch (error) {
              if (!control.isCurrent()) break;
              if (getErrorStatus(error) === 404) markUnsupported();
              throw error;
            }
            if (!control.isCurrent()) break;
            const availableCapacity = Math.max(
              0,
              snapshot.config['refresh-workers'] +
                snapshot.config['refresh-queue-size'] -
                snapshot.runtime.busy -
                snapshot.runtime.queued
            );
            batchSize = Math.min(batchSize, availableCapacity);
            if (batchSize === 0) {
              capacityWaitPolls += 1;
              if (capacityWaitPolls >= MAX_CAPACITY_WAIT_POLLS) {
                tasks.push({
                  id: 'local-refresh-queue-full',
                  state: 'completed_with_errors',
                  total: pendingNames.length,
                  processed: pendingNames.length,
                  failed: pendingNames.length,
                  results: pendingNames.map((name) => ({
                    name,
                    status: 'failed',
                    error: REFRESH_QUEUE_FULL_ERROR,
                  })),
                });
                break;
              }
              await waitForPoll();
              if (!control.isCurrent()) break;
              continue;
            }
            capacityWaitPolls = 0;
          }
          const batchNames = pendingNames.slice(0, batchSize);
          pendingNames = pendingNames.slice(batchSize);
          let task;
          try {
            task = await chatGptWebApi.startAccountInfoRefreshTask(
              batchNames,
              force,
              control.connection
            );
          } catch (error) {
            if (!control.isCurrent()) break;
            if (getErrorStatus(error) === 404) markUnsupported();
            throw error;
          }
          if (!control.isCurrent()) {
            if (!isChatGptWebAccountInfoRefreshTaskTerminal(task.state)) {
              cancelTaskById(task.id);
            }
            break;
          }
          activeTasksRef.current.set(task.id, {
            runGeneration: control.generation,
            lifecycleGeneration: control.lifecycleGeneration,
            connectionGenerationKey: control.connectionGenerationKey,
            automaticGeneration: control.automaticGeneration,
          });
          let completed: ChatGptWebAccountInfoRefreshTask;
          try {
            completed = await pollTask(task, batchNames, control);
          } finally {
            activeTasksRef.current.delete(task.id);
          }
          tasks.push(completed);
          if (!control.isCurrent()) break;
          const retryNames: string[] = [];
          for (const result of completed.results ?? []) {
            if (result.status !== 'failed' || result.error !== REFRESH_QUEUE_FULL_ERROR) continue;
            const attempts = (queueFullRetries.get(result.name) ?? 0) + 1;
            queueFullRetries.set(result.name, attempts);
            if (attempts <= MAX_QUEUE_FULL_RETRIES) retryNames.push(result.name);
          }
          if (retryNames.length > 0) {
            pendingNames = [...retryNames, ...pendingNames];
            await waitForPoll();
          }
        }
      } finally {
        if (control.isCurrent() && tasks.length > 0) {
          try {
            await reloadFiles();
          } catch {
            // A list reload failure must not discard completed refresh work or stop later batches.
          }
        }
        const activeRun = activeRunsRef.current.get(control.generation);
        if (activeRun?.abortController === control.abortController) {
          activeRunsRef.current.delete(control.generation);
        }
      }
      return control.isCurrent() ? tasks : [];
    },
    [cancelTaskById, clearUnsupported, markUnsupported, pollTask, reloadFiles, waitForPoll]
  );

  useEffect(() => {
    const currentVisibleNames = JSON.parse(visibleNamesKey) as string[];
    if (!active) {
      automaticScopeKeyRef.current = '';
      automaticScopeInitializedRef.current = false;
      automaticScopeNamesRef.current.clear();
      automaticallyRefreshedNamesRef.current.clear();
    } else if (
      !automaticScopeInitializedRef.current ||
      automaticScopeKeyRef.current !== visibleScopeKey
    ) {
      automaticScopeInitializedRef.current = true;
      automaticScopeKeyRef.current = visibleScopeKey;
      automaticScopeNamesRef.current = new Set(currentVisibleNames);
      automaticallyRefreshedNamesRef.current.clear();
    } else if (
      automaticScopeNamesRef.current.size === 0 &&
      automaticallyRefreshedNamesRef.current.size === 0 &&
      currentVisibleNames.length > 0
    ) {
      automaticScopeNamesRef.current = new Set(currentVisibleNames);
    }
    const pendingNames = currentVisibleNames.filter(
      (name) =>
        automaticScopeNamesRef.current.has(name) &&
        !automaticallyRefreshedNamesRef.current.has(name)
    );
    const generation = automaticGenerationRef.current + 1;
    automaticGenerationRef.current = generation;
    const isCurrent = () => mountedRef.current && automaticGenerationRef.current === generation;
    if (
      !active ||
      disabled ||
      !automaticRefreshEnabled ||
      unsupported ||
      pendingNames.length === 0
    ) {
      return () => {
        if (automaticGenerationRef.current === generation) {
          automaticGenerationRef.current += 1;
        }
        abortActiveRuns((run) => run.automaticGeneration === generation);
        cancelTrackedTasks((task) => task.automaticGeneration === generation);
      };
    }
    const refreshAutomatically = async (names: string[], retryCount: number): Promise<void> => {
      if (!isCurrent() || names.length === 0) return;
      const control = createRunControl(generation);
      if (!control.isCurrent()) return;
      let retryNames = names;
      try {
        const tasks = await runRefresh(names, false, control);
        if (!control.isCurrent()) return;
        const latestResults = new Map(
          tasks.flatMap((task) => task.results ?? []).map((result) => [result.name, result])
        );
        retryNames = [];
        for (const name of names) {
          const result = latestResults.get(name);
          if (
            result?.status &&
            ['updated', 'unchanged', 'fresh', 'partial'].includes(result.status)
          ) {
            automaticallyRefreshedNamesRef.current.add(name);
            continue;
          }
          if (
            result?.status === 'failed' &&
            AUTOMATIC_RETRYABLE_ERRORS.has(String(result.error ?? '').trim())
          ) {
            retryNames.push(name);
          }
        }
      } catch (error) {
        if (!control.isCurrent()) return;
        if (!isAutomaticRefreshRequestRetryable(error)) retryNames = [];
      }
      if (!isCurrent() || retryNames.length === 0 || retryCount >= MAX_AUTOMATIC_REFRESH_RETRIES) {
        return;
      }
      await waitForPoll();
      if (!isCurrent()) return;
      await refreshAutomatically(retryNames, retryCount + 1);
    };
    const timer = window.setTimeout(() => {
      void refreshAutomatically(pendingNames, 0);
    }, AUTO_REFRESH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      if (automaticGenerationRef.current === generation) {
        automaticGenerationRef.current += 1;
      }
      abortActiveRuns((run) => run.automaticGeneration === generation);
      cancelTrackedTasks((task) => task.automaticGeneration === generation);
    };
  }, [
    abortActiveRuns,
    active,
    automaticRefreshEnabled,
    cancelTrackedTasks,
    createRunControl,
    disabled,
    connectionGenerationKey,
    runRefresh,
    unsupported,
    visibleNamesKey,
    visibleScopeKey,
    waitForPoll,
  ]);

  const refreshSelected = useCallback(async () => {
    if (
      manualRunGenerationRef.current !== null ||
      !active ||
      disabled ||
      unsupportedRef.current ||
      selectedNames.length === 0
    ) {
      return;
    }
    const control = createRunControl();
    manualRunGenerationRef.current = control.generation;
    setManualLiveMessage('');
    setManualRefreshing(true);
    try {
      const tasks = await runRefresh(selectedNames, true, control);
      if (!control.isCurrent() || tasks.length === 0) return;
      const latestResults = new Map(
        tasks.flatMap((task) => task.results ?? []).map((result) => [result.name, result])
      );
      const finalResults = selectedNames
        .map((name) => latestResults.get(name))
        .filter((result): result is NonNullable<typeof result> => result !== undefined);
      const taskFailed = tasks.some(
        (task) => task.state === 'failed' || task.state === 'completed_with_errors'
      );
      if (
        finalResults.length === selectedNames.length &&
        finalResults.every((result) => ['updated', 'unchanged', 'fresh'].includes(result.status))
      ) {
        const message = t('auth_files.chatgpt_web_account_refresh_success', {
          count: selectedNames.length,
        });
        setManualLiveMessage(message);
        showNotification(message, 'success');
      } else if (finalResults.some((result) => result.status === 'partial')) {
        const message = t('auth_files.chatgpt_web_account_refresh_partial');
        setManualLiveMessage(message);
        showNotification(message, 'warning');
      } else if (taskFailed || finalResults.some((result) => result.status !== 'canceled')) {
        const message = t('auth_files.chatgpt_web_account_refresh_failed');
        setManualLiveMessage(message);
        showNotification(message, 'error');
      }
    } catch (error) {
      if (!control.isLifecycleCurrent() || manualRunGenerationRef.current !== control.generation) {
        return;
      }
      const routeUnsupported = unsupportedRef.current;
      const message = routeUnsupported
        ? t('auth_files.chatgpt_web_account_refresh_unsupported')
        : `${t('auth_files.chatgpt_web_account_refresh_failed')}: ${getChatGptWebErrorMessage(error, t)}`;
      if (mountedRef.current) setManualLiveMessage(message);
      showNotification(message, routeUnsupported ? 'warning' : 'error');
    } finally {
      if (mountedRef.current && manualRunGenerationRef.current === control.generation) {
        manualRunGenerationRef.current = null;
        setManualRefreshing(false);
      }
    }
  }, [active, createRunControl, disabled, runRefresh, selectedNames, showNotification, t]);

  return {
    manualRefreshing,
    manualLiveMessage,
    unsupported,
    refreshSelected,
  };
}
