import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { historyStorageApi } from '@/services/api';
import { startupMutationsBlocked, useNotificationStore, useStartupStatusStore } from '@/stores';
import type {
  HistoryPruneRequest,
  StartupStatusSnapshot,
  StorageHistorySnapshot,
  UsagePruneTask,
} from '@/types';
import styles from './StartupHistoryPanel.module.scss';

interface StartupHistoryPanelProps {
  connected: boolean;
  connectionKey: string;
}

const getErrorStatus = (error: unknown): number | undefined =>
  error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? ((error as { status: number }).status ?? undefined)
    : undefined;

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const stageDurationMillis = (stage: StartupStatusSnapshot['stages'][number]): number => {
  if (stage.status !== 'running' || !stage.started_at) return stage.duration_milliseconds;
  const startedAt = new Date(stage.started_at).getTime();
  return Number.isFinite(startedAt)
    ? Math.max(stage.duration_milliseconds, Date.now() - startedAt)
    : stage.duration_milliseconds;
};

const parseRetention = (days: string, megabytes: string): HistoryPruneRequest | null => {
  const parsedDays = Number(days);
  const parsedMegabytes = Number(megabytes);
  if (
    !Number.isSafeInteger(parsedDays) ||
    !Number.isSafeInteger(parsedMegabytes) ||
    parsedDays < 0 ||
    parsedMegabytes < 0 ||
    (parsedDays === 0 && parsedMegabytes === 0)
  ) {
    return null;
  }
  return { older_than_days: parsedDays, max_storage_megabytes: parsedMegabytes };
};

export function StartupHistoryPanel({ connected, connectionKey }: StartupHistoryPanelProps) {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const startup = useStartupStatusStore((state) => state.snapshot);
  const startupSupport = useStartupStatusStore((state) => state.support);
  const startupLoading = useStartupStatusStore((state) => state.loading);
  const startupError = useStartupStatusStore((state) => state.error);
  const loadStartup = useStartupStatusStore((state) => state.load);
  const [history, setHistory] = useState<StorageHistorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyUnsupported, setHistoryUnsupported] = useState(false);
  const [error, setError] = useState('');
  const [usageDays, setUsageDays] = useState('0');
  const [usageMegabytes, setUsageMegabytes] = useState('0');
  const [logDays, setLogDays] = useState('0');
  const [logMegabytes, setLogMegabytes] = useState('0');
  const [cleaning, setCleaning] = useState<'usage' | 'logs' | null>(null);
  const [usageTask, setUsageTask] = useState<UsagePruneTask | null>(null);
  const requestSequence = useRef(0);
  const notifiedUsageTasks = useRef(new Set<string>());

  const formatDate = useCallback(
    (value: string | null): string => {
      if (!value) return '-';
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language);
    },
    [i18n.language]
  );

  const load = useCallback(async () => {
    if (!connected) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    const [startupResult, historyResult] = await Promise.allSettled([
      loadStartup(connectionKey),
      historyStorageApi.getStorageHistory(),
    ]);
    if (sequence !== requestSequence.current) return;

    if (startupResult.status === 'rejected') {
      setError(startupResult.reason instanceof Error ? startupResult.reason.message : 'startup');
    }

    if (historyResult.status === 'fulfilled') {
      setHistory(historyResult.value);
      setHistoryUnsupported(false);
      setUsageDays(String(historyResult.value.usage.detail_retention_days));
      setUsageMegabytes(String(historyResult.value.usage.max_storage_megabytes));
      setLogDays(String(historyResult.value.logs.retention_days));
      setLogMegabytes(String(historyResult.value.logs.max_total_size_mb));
      setUsageTask(
        historyResult.value.usage.prune_tasks.active ??
          historyResult.value.usage.prune_tasks.recent[0] ??
          null
      );
    } else if (getErrorStatus(historyResult.reason) === 404) {
      setHistory(null);
      setHistoryUnsupported(true);
    } else {
      setHistory(null);
      setError(
        (current) =>
          current ||
          (historyResult.reason instanceof Error ? historyResult.reason.message : 'history')
      );
    }
    setLoading(false);
  }, [connected, connectionKey, loadStartup]);

  useEffect(() => {
    requestSequence.current += 1;
    setHistory(null);
    setError('');
    setHistoryUnsupported(false);
    setUsageTask(null);
    if (connected) void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [connected, connectionKey, load]);

  useEffect(() => {
    if (
      !connected ||
      !usageTask?.task_id ||
      (usageTask.status !== 'queued' && usageTask.status !== 'running')
    ) {
      return undefined;
    }
    let canceled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await historyStorageApi.getUsagePruneTask(usageTask.task_id);
        if (canceled) return;
        setUsageTask(next);
        if (next.status === 'completed' || next.status === 'failed') {
          if (!notifiedUsageTasks.current.has(next.task_id)) {
            notifiedUsageTasks.current.add(next.task_id);
            if (next.status === 'completed') {
              showNotification(
                t('system_info.history_storage.cleanup_success', { count: next.pruned }),
                'success'
              );
            } else {
              showNotification(
                t('system_info.history_storage.cleanup_task_failed', {
                  code: next.safe_error_code || 'usage_prune_failed',
                }),
                'error'
              );
            }
          }
          await load();
          return;
        }
      } catch (pollError) {
        if (!canceled && getErrorStatus(pollError) !== 404) {
          setError(pollError instanceof Error ? pollError.message : 'usage-prune');
        }
      }
      if (!canceled) timer = window.setTimeout(() => void poll(), 1500);
    };
    timer = window.setTimeout(() => void poll(), 1000);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [connected, load, showNotification, t, usageTask?.status, usageTask?.task_id]);

  const usageRequest = useMemo(
    () => parseRetention(usageDays, usageMegabytes),
    [usageDays, usageMegabytes]
  );
  const logRequest = useMemo(() => parseRetention(logDays, logMegabytes), [logDays, logMegabytes]);
  const mutationsBlocked = startupMutationsBlocked(startup);
  const usageTaskActive = usageTask?.status === 'queued' || usageTask?.status === 'running';

  const prune = useCallback(
    (kind: 'usage' | 'logs') => {
      const request = kind === 'usage' ? usageRequest : logRequest;
      if (!request) return;
      showConfirmation({
        title: t(`system_info.history_storage.${kind}_cleanup_title`),
        message: t(`system_info.history_storage.${kind}_cleanup_confirm`, {
          days: request.older_than_days,
          megabytes: request.max_storage_megabytes,
        }),
        confirmText: t('system_info.history_storage.cleanup_action'),
        variant: 'danger',
        onConfirm: async () => {
          setCleaning(kind);
          try {
            if (kind === 'usage') {
              const task = await historyStorageApi.pruneUsage(request);
              setUsageTask(task);
              if (!task.task_id || task.status === 'completed') {
                showNotification(
                  t('system_info.history_storage.cleanup_success', { count: task.pruned }),
                  'success'
                );
                await load();
              } else if (task.status === 'failed') {
                showNotification(
                  t('system_info.history_storage.cleanup_task_failed', {
                    code: task.safe_error_code || 'usage_prune_failed',
                  }),
                  'error'
                );
              } else {
                showNotification(t('system_info.history_storage.cleanup_started'), 'info');
              }
            } else {
              const result = await historyStorageApi.pruneLogs(request);
              showNotification(
                t('system_info.history_storage.cleanup_success', {
                  count: result.removed_files,
                }),
                'success'
              );
              await load();
            }
          } catch (cleanupError) {
            if (kind === 'usage' && getErrorStatus(cleanupError) === 409) {
              showNotification(t('system_info.history_storage.cleanup_in_progress'), 'info');
              await load();
              return;
            }
            showNotification(
              `${t('system_info.history_storage.cleanup_failed')}: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`,
              'error'
            );
          } finally {
            setCleaning(null);
          }
        },
      });
    },
    [load, logRequest, showConfirmation, showNotification, t, usageRequest]
  );

  if (!connected) return null;

  return (
    <>
      <Card
        title={t('system_info.startup.title')}
        collapsible
        extra={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            loading={loading}
          >
            {t('common.refresh')}
          </Button>
        }
      >
        <p className={styles.description}>{t('system_info.startup.description')}</p>
        {startupSupport === 'unsupported' ? (
          <div className="hint">{t('system_info.startup.unsupported')}</div>
        ) : startup ? (
          <div className={styles.startupContent} data-testid="startup-status">
            <div className={styles.startupSummary} data-status={startup.status}>
              <span className={styles.statusDot} aria-hidden="true" />
              <div>
                <strong>
                  {t(`system_info.startup.phases.${startup.phase}`, {
                    defaultValue: startup.phase || '-',
                  })}
                </strong>
                <span>{t(`system_info.startup.service_status.${startup.status}`)}</span>
              </div>
              <time>{formatDate(startup.updated_at)}</time>
            </div>
            {startup.stages.length > 0 && (
              <div className={styles.stageList}>
                {startup.stages.map((stage, index) => (
                  <div className={styles.stageRow} key={`${stage.name}-${index}`}>
                    <div>
                      <strong>
                        {t(`system_info.startup.stages.${stage.name}`, {
                          defaultValue: stage.name,
                        })}
                      </strong>
                      <span>
                        {t(`system_info.startup.status.${stage.status}`, {
                          defaultValue: stage.status,
                        })}
                      </span>
                    </div>
                    <span>{stageDurationMillis(stage).toLocaleString()} ms</span>
                    <span>
                      {stage.processed > 0
                        ? t('system_info.startup.processed', { count: stage.processed })
                        : stage.error_code || '-'}
                      {stage.skipped > 0
                        ? ` · ${t('system_info.startup.skipped', { count: stage.skipped })}`
                        : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {startup.issues.length > 0 && (
              <div className={styles.issueList} data-testid="startup-issues">
                {startup.issues.map((issue) => (
                  <span data-severity={issue.severity} key={`${issue.stage}:${issue.code}`}>
                    {t(`system_info.startup.issues.${issue.code}`, { defaultValue: issue.code })}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="hint">
            {startupLoading
              ? t('common.loading')
              : startupError || error || t('system_info.startup.unavailable')}
          </div>
        )}
      </Card>

      <Card
        title={t('system_info.history_storage.title')}
        collapsible
        extra={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            loading={loading}
          >
            {t('common.refresh')}
          </Button>
        }
      >
        <p className={styles.description}>{t('system_info.history_storage.description')}</p>
        {historyUnsupported ? (
          <div className="hint">{t('system_info.history_storage.unsupported')}</div>
        ) : history ? (
          <div className={styles.historyGrid} data-testid="history-storage">
            <article className={styles.historyPanel}>
              <header>
                <div>
                  <h3>{t('system_info.history_storage.usage_title')}</h3>
                  <p>
                    {history.usage.collection_enabled
                      ? t('system_info.history_storage.collection_on')
                      : t('system_info.history_storage.collection_off')}
                    {' · '}
                    {history.usage.persistence_enabled
                      ? t('system_info.history_storage.persistence_on')
                      : t('system_info.history_storage.persistence_off')}
                  </p>
                </div>
                <strong>{formatBytes(history.usage.storage.total_bytes)}</strong>
              </header>
              <dl className={styles.statGrid}>
                <div>
                  <dt>{t('system_info.history_storage.detail_count')}</dt>
                  <dd>{history.usage.detail_count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.total_requests')}</dt>
                  <dd>{history.usage.total_requests.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.restore_status')}</dt>
                  <dd>
                    {t(`system_info.history_storage.restore.${history.usage.restore.status}`, {
                      defaultValue: history.usage.restore.status || '-',
                    })}
                  </dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.history_range')}</dt>
                  <dd>
                    {formatDate(history.usage.oldest_at)} — {formatDate(history.usage.newest_at)}
                  </dd>
                </div>
              </dl>
              <p className={styles.storageCaveat}>
                {t('system_info.history_storage.usage_storage_caveat')}
              </p>
              {usageTask && (
                <div
                  className={styles.taskStatus}
                  data-status={usageTask.status}
                  data-testid="usage-prune-task"
                >
                  <div>
                    <strong>
                      {t(`system_info.history_storage.task_status.${usageTask.status}`)}
                    </strong>
                    <span>
                      {usageTask.status === 'completed'
                        ? t('system_info.history_storage.task_removed', {
                            count: usageTask.pruned,
                          })
                        : usageTask.status === 'failed'
                          ? t('system_info.history_storage.task_error', {
                              code: usageTask.safe_error_code || 'usage_prune_failed',
                            })
                          : t('system_info.history_storage.task_background')}
                    </span>
                  </div>
                  <time>{formatDate(usageTask.started_at || usageTask.created_at)}</time>
                </div>
              )}
              {mutationsBlocked && (
                <p className={styles.readOnlyNotice}>
                  {t('system_info.history_storage.startup_read_only')}
                </p>
              )}
              <div className={styles.cleanupForm}>
                <Input
                  label={t('system_info.history_storage.older_than_days')}
                  type="number"
                  min={0}
                  value={usageDays}
                  onChange={(event) => setUsageDays(event.target.value)}
                />
                <Input
                  label={t('system_info.history_storage.max_megabytes')}
                  type="number"
                  min={0}
                  value={usageMegabytes}
                  onChange={(event) => setUsageMegabytes(event.target.value)}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={
                    cleaning !== null || !usageRequest || usageTaskActive || mutationsBlocked
                  }
                  loading={cleaning === 'usage'}
                  onClick={() => prune('usage')}
                >
                  {t('system_info.history_storage.cleanup_usage')}
                </Button>
              </div>
            </article>

            <article className={styles.historyPanel}>
              <header>
                <div>
                  <h3>{t('system_info.history_storage.logs_title')}</h3>
                  <p>
                    {history.logs.file_logging_enabled
                      ? t('system_info.history_storage.file_logging_on')
                      : t('system_info.history_storage.file_logging_off')}
                  </p>
                </div>
                <strong>{formatBytes(history.logs.storage.total_bytes)}</strong>
              </header>
              <dl className={styles.statGrid}>
                <div>
                  <dt>{t('system_info.history_storage.file_count')}</dt>
                  <dd>{history.logs.storage.file_count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.oldest_file')}</dt>
                  <dd>{formatDate(history.logs.storage.oldest_at)}</dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.newest_file')}</dt>
                  <dd>{formatDate(history.logs.storage.newest_at)}</dd>
                </div>
                <div>
                  <dt>{t('system_info.history_storage.policy')}</dt>
                  <dd>
                    {history.logs.retention_days} d / {history.logs.max_total_size_mb} MiB
                  </dd>
                </div>
              </dl>
              <div className={styles.cleanupForm}>
                <Input
                  label={t('system_info.history_storage.older_than_days')}
                  type="number"
                  min={0}
                  value={logDays}
                  onChange={(event) => setLogDays(event.target.value)}
                />
                <Input
                  label={t('system_info.history_storage.max_megabytes')}
                  type="number"
                  min={0}
                  value={logMegabytes}
                  onChange={(event) => setLogMegabytes(event.target.value)}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={cleaning !== null || !logRequest || mutationsBlocked}
                  loading={cleaning === 'logs'}
                  onClick={() => prune('logs')}
                >
                  {t('system_info.history_storage.cleanup_logs')}
                </Button>
              </div>
            </article>
          </div>
        ) : (
          <div className="hint">
            {loading ? t('common.loading') : error || t('system_info.history_storage.unavailable')}
          </div>
        )}
      </Card>
    </>
  );
}
