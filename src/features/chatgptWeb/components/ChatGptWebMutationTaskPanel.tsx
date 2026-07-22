import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconRefreshCw } from '@/components/ui/icons';
import type {
  ChatGptWebMutationResult,
  ChatGptWebMutationTask,
  ChatGptWebMutationTaskKind,
} from '@/types';
import { isChatGptWebMutationTaskTerminal } from '@/types';
import { formatDateTime } from '@/utils/format';
import { isChatGptWebSentinelBusyError } from '@/utils/chatgptWeb';
import styles from './ChatGptWebMutationTaskPanel.module.scss';

export type ChatGptWebMutationTaskPanelProps = {
  task: ChatGptWebMutationTask;
  kind: ChatGptWebMutationTaskKind;
  refreshing?: boolean;
  canceling?: boolean;
  onRefresh: () => void;
  onCancel: () => void;
};

const readTranslatedValue = (
  translate: (key: string) => string,
  key: string,
  fallback: string
): string => {
  const translated = translate(key);
  return translated === key ? fallback : translated;
};

const countResults = (results: ChatGptWebMutationResult[], status: string): number =>
  results.filter((result) => result.status === status).length;

export function ChatGptWebMutationTaskPanel(props: ChatGptWebMutationTaskPanelProps) {
  const { t } = useTranslation();
  const { task, kind, refreshing = false, canceling = false, onRefresh, onCancel } = props;
  const terminal = isChatGptWebMutationTaskTerminal(task.state);
  const progress = task.total ? Math.min(100, Math.round((task.processed / task.total) * 100)) : 0;
  const sortedResults = useMemo(
    () =>
      [...(task.results ?? [])].sort((left, right) => {
        const leftName = left.file || left.source_name || left.name || '';
        const rightName = right.file || right.source_name || right.name || '';
        return leftName.localeCompare(rightName);
      }),
    [task.results]
  );
  const metrics = [
    ['total', task.total],
    ['processed', task.processed],
    ['created', countResults(sortedResults, 'created')],
    ['updated', countResults(sortedResults, 'updated')],
    ['unchanged', countResults(sortedResults, 'unchanged')],
    ['failed', task.failed],
    ['canceled', task.canceled],
  ] as const;
  const phases = [
    ['queued', countResults(sortedResults, 'queued')],
    ['running', countResults(sortedResults, 'running')],
    ['committing', countResults(sortedResults, 'committing')],
  ] as const;
  const stateLabel = readTranslatedValue(t, `chatgpt_web.states.${task.state}`, task.state);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h3>{t(`chatgpt_web.mutation_tasks.${kind}.title`)}</h3>
            <span className={styles.stateBadge} data-state={task.state}>
              {stateLabel}
            </span>
          </div>
          <p>
            {t('chatgpt_web.task_created_at', {
              time: formatDateTime(new Date(task.created_at)),
            })}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing}>
            <IconRefreshCw size={15} />
            {t('common.refresh')}
          </Button>
          {!terminal && task.state !== 'canceling' ? (
            <Button variant="danger" size="sm" onClick={onCancel} loading={canceling}>
              {t('chatgpt_web.cancel_task')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.progressTrack} aria-label={t('chatgpt_web.mutation_progress')}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className={styles.metrics}>
        {metrics.map(([key, value]) => (
          <div key={key} className={styles.metric}>
            <span>{t(`chatgpt_web.mutation_metrics.${key}`)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {!terminal ? (
        <div className={styles.phases} aria-label={t('chatgpt_web.mutation_phases_label')}>
          {phases.map(([phase, count]) => (
            <div key={phase} data-active={count > 0}>
              <span>{t(`chatgpt_web.mutation_tasks.${kind}.phases.${phase}`)}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.resultsHeader}>
        <h4>{t(`chatgpt_web.mutation_tasks.${kind}.results_title`)}</h4>
        <span>{t('chatgpt_web.results_count', { count: sortedResults.length })}</span>
      </div>

      {sortedResults.length === 0 ? (
        <div className={styles.emptyState}>
          {!terminal ? <LoadingSpinner size={18} /> : null}
          <span>{t('chatgpt_web.results_empty')}</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t(`chatgpt_web.mutation_tasks.${kind}.source`)}</th>
                <th>{t('chatgpt_web.result_account')}</th>
                <th>{t('chatgpt_web.result_status')}</th>
                <th>{t('chatgpt_web.mutation_target')}</th>
                <th>{t('chatgpt_web.mutation_credential_mode')}</th>
                <th>{t('chatgpt_web.result_message')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, index) => {
                const sentinelBusy = isChatGptWebSentinelBusyError(result, result.http_status);
                const statusLabel = readTranslatedValue(
                  t,
                  `chatgpt_web.mutation_result_states.${result.status}`,
                  result.status
                );
                const errorCategory = sentinelBusy
                  ? t('chatgpt_web.errors.sentinel_sdk_busy')
                  : result.error_category
                    ? readTranslatedValue(
                        t,
                        `chatgpt_web.mutation_error_categories.${result.error_category}`,
                        result.error_category
                      )
                    : '';
                const credentialMode = result.credential_mode
                  ? readTranslatedValue(
                      t,
                      `chatgpt_web.credential_modes.${result.credential_mode}`,
                      result.credential_mode
                    )
                  : '-';
                const source = result.file || result.source_name || '-';
                const target = result.target_name || result.name || '-';
                const message = [
                  result.http_status ? `HTTP ${result.http_status}` : '',
                  errorCategory,
                  sentinelBusy ? '' : result.error,
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <tr key={`${source}-${result.email ?? ''}-${index}`}>
                    <td className={styles.wrapCell}>{source}</td>
                    <td className={styles.wrapCell}>{result.email || '-'}</td>
                    <td>
                      <span className={styles.resultStatus} data-status={result.status}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className={styles.wrapCell}>{target}</td>
                    <td>{credentialMode}</td>
                    <td className={styles.messageCell}>{message || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
