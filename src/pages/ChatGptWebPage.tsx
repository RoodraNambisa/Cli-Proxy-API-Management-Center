import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconFileText,
  IconRefreshCw,
  IconSettings,
  IconTrash2,
  IconUpload,
} from '@/components/ui/icons';
import { chatGptWebApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ChatGptWebLoginTask, ChatGptWebLoginTaskState } from '@/types';
import { isChatGptWebLoginTaskTerminal } from '@/types';
import { formatDateTime, formatFileSize } from '@/utils/format';
import styles from './ChatGptWebPage.module.scss';

const POLL_INTERVAL_MS = 1500;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? '');

export function ChatGptWebPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification } = useNotificationStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState<ChatGptWebLoginTask | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const disabled = connectionStatus !== 'connected';

  const clearFile = useCallback(() => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const refreshTask = useCallback(
    async (taskId: string, quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const nextTask = await chatGptWebApi.getLoginTask(taskId);
        setTask(nextTask);
        return nextTask;
      } catch (error) {
        if (!quiet) {
          showNotification(
            `${t('chatgpt_web.task_refresh_failed')}: ${getErrorMessage(error)}`,
            'error'
          );
        }
        return null;
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [showNotification, t]
  );

  const activeTaskId = task?.id ?? '';
  const activeTaskState = task?.state;

  useEffect(() => {
    if (!activeTaskId || !activeTaskState || isChatGptWebLoginTaskTerminal(activeTaskState)) {
      return undefined;
    }
    let disposed = false;
    let timer: number | undefined;

    const poll = async () => {
      const nextTask = await refreshTask(activeTaskId, true);
      if (disposed || (nextTask && isChatGptWebLoginTaskTerminal(nextTask.state))) return;
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeTaskId, activeTaskState, refreshTask]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleStart = async () => {
    if (!file || starting) return;
    setStarting(true);
    try {
      const nextTask = await chatGptWebApi.startLoginTask(file);
      clearFile();
      setTask(nextTask);
      showNotification(t('chatgpt_web.task_started'), 'success');
    } catch (error) {
      showNotification(`${t('chatgpt_web.task_start_failed')}: ${getErrorMessage(error)}`, 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (
      !task ||
      task.state === 'canceling' ||
      isChatGptWebLoginTaskTerminal(task.state) ||
      canceling
    ) {
      return;
    }
    setCanceling(true);
    try {
      const nextTask = await chatGptWebApi.cancelLoginTask(task.id);
      setTask(nextTask);
      showNotification(t('chatgpt_web.task_cancel_requested'), 'info');
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.task_cancel_failed')}: ${getErrorMessage(error)}`,
        'error'
      );
    } finally {
      setCanceling(false);
    }
  };

  const progress = task?.total ? Math.min(100, Math.round((task.processed / task.total) * 100)) : 0;
  const stateLabel = task ? t(`chatgpt_web.states.${task.state as ChatGptWebLoginTaskState}`) : '';
  const sortedResults = useMemo(
    () => [...(task?.results ?? [])].sort((left, right) => left.line - right.line),
    [task?.results]
  );

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>ChatGPT Web</span>
          <h1>{t('chatgpt_web.title')}</h1>
          <p>{t('chatgpt_web.description')}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => navigate('/auth-files?provider=chatgpt-web')}>
            {t('chatgpt_web.open_auth_files')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/config/proxy-pools')}>
            {t('chatgpt_web.open_proxy_pools')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/config?section=provider-chatgpt-web')}
          >
            <IconSettings size={16} />
            {t('chatgpt_web.open_settings')}
          </Button>
        </div>
      </header>

      <section className={styles.uploadSection} aria-labelledby="chatgpt-web-upload-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="chatgpt-web-upload-title">{t('chatgpt_web.upload_title')}</h2>
            <p>{t('chatgpt_web.upload_description')}</p>
          </div>
        </div>
        <div className={styles.formatNotice}>
          <code>email---password---BASE32_TOTP_SECRET</code>
          <span>{t('chatgpt_web.upload_format_hint')}</span>
        </div>
        <div className={styles.uploadControls}>
          <label className={styles.filePicker}>
            <IconFileText size={18} />
            <span>{file ? file.name : t('chatgpt_web.choose_file')}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,text/plain"
              onChange={handleFileChange}
              disabled={disabled || starting}
            />
          </label>
          {file ? <span className={styles.fileMeta}>{formatFileSize(file.size)}</span> : null}
          {file ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFile}
              disabled={starting}
              title={t('chatgpt_web.clear_file')}
              aria-label={t('chatgpt_web.clear_file')}
            >
              <IconTrash2 size={16} />
            </Button>
          ) : null}
          <Button
            onClick={handleStart}
            loading={starting}
            disabled={
              disabled || !file || Boolean(task && !isChatGptWebLoginTaskTerminal(task.state))
            }
          >
            <IconUpload size={16} />
            {t('chatgpt_web.start_task')}
          </Button>
        </div>
        <p className={styles.securityHint}>{t('chatgpt_web.security_hint')}</p>
      </section>

      {task ? (
        <section className={styles.taskSection} aria-labelledby="chatgpt-web-task-title">
          <div className={styles.taskHeader}>
            <div>
              <div className={styles.taskTitleRow}>
                <h2 id="chatgpt-web-task-title">{t('chatgpt_web.task_title')}</h2>
                <span className={`${styles.stateBadge} ${styles[`state_${task.state}`] ?? ''}`}>
                  {stateLabel}
                </span>
              </div>
              <p>
                {t('chatgpt_web.task_created_at', {
                  time: formatDateTime(new Date(task.created_at)),
                })}
              </p>
            </div>
            <div className={styles.taskActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refreshTask(task.id)}
                loading={refreshing}
              >
                <IconRefreshCw size={15} />
                {t('common.refresh')}
              </Button>
              {!isChatGptWebLoginTaskTerminal(task.state) && task.state !== 'canceling' ? (
                <Button variant="danger" size="sm" onClick={handleCancel} loading={canceling}>
                  {t('chatgpt_web.cancel_task')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className={styles.progressTrack} aria-label={t('chatgpt_web.progress')}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.metrics}>
            {(['total', 'processed', 'succeeded', 'failed', 'canceled'] as const).map((key) => (
              <div key={key} className={styles.metric}>
                <span>{t(`chatgpt_web.metrics.${key}`)}</span>
                <strong>{task[key]}</strong>
              </div>
            ))}
          </div>

          <div className={styles.resultsHeader}>
            <h3>{t('chatgpt_web.results_title')}</h3>
            <span>{t('chatgpt_web.results_count', { count: sortedResults.length })}</span>
          </div>
          {sortedResults.length === 0 ? (
            <div className={styles.emptyState}>
              {!isChatGptWebLoginTaskTerminal(task.state) ? <LoadingSpinner size={18} /> : null}
              <span>{t('chatgpt_web.results_empty')}</span>
            </div>
          ) : (
            <div className={styles.resultTableWrap}>
              <table className={styles.resultTable}>
                <thead>
                  <tr>
                    <th>{t('chatgpt_web.result_line')}</th>
                    <th>{t('chatgpt_web.result_account')}</th>
                    <th>{t('chatgpt_web.result_status')}</th>
                    <th>{t('chatgpt_web.result_lifecycle')}</th>
                    <th>{t('chatgpt_web.result_message')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => (
                    <tr key={`${result.line}-${result.email}`}>
                      <td>{result.line}</td>
                      <td className={styles.accountCell}>{result.email}</td>
                      <td>
                        <span className={styles.resultStatus} data-status={result.status}>
                          {t(`chatgpt_web.result_states.${result.status}`)}
                        </span>
                      </td>
                      <td>{result.lifecycle_state || '-'}</td>
                      <td className={styles.messageCell}>
                        {result.error
                          ? [result.http_status ? `HTTP ${result.http_status}` : '', result.error]
                              .filter(Boolean)
                              .join(' ')
                          : result.name || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
