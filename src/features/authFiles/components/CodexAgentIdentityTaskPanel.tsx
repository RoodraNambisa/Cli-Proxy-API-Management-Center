import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import type { CodexAgentIdentityTask } from '@/types';
import { isCodexAgentIdentityTaskTerminal } from '@/types';
import styles from './CodexAgentIdentityConversion.module.scss';

export type CodexAgentIdentityTaskPanelProps = {
  task: CodexAgentIdentityTask;
  refreshing: boolean;
  canceling: boolean;
  onRefresh: () => void;
  onCancel: () => void;
};

const translatedOrFallback = (
  translate: (key: string) => string,
  key: string,
  fallback: string
): string => {
  const translated = translate(key);
  return translated === key ? fallback : translated;
};

export function CodexAgentIdentityTaskPanel({
  task,
  refreshing,
  canceling,
  onRefresh,
  onCancel,
}: CodexAgentIdentityTaskPanelProps) {
  const { t } = useTranslation();
  const terminal = isCodexAgentIdentityTaskTerminal(task.status);
  const progress = Math.max(0, Math.min(100, Number(task.progress_percent) || 0));
  const stateLabel = translatedOrFallback(
    t,
    `auth_files.codex_identity_states.${task.status}`,
    task.status
  );
  const metrics = [
    ['total', task.total],
    ['processed', task.processed],
    ['succeeded', task.succeeded],
    ['failed', task.failed],
    ['canceled', task.canceled],
  ] as const;

  return (
    <div className={styles.taskPanel}>
      <div className={styles.taskHeader}>
        <div className={styles.taskTitleRow}>
          <h3>{t('auth_files.codex_identity_task_title')}</h3>
          <span className={styles.taskState} data-status={task.status}>
            {stateLabel}
          </span>
        </div>
        <div className={styles.taskActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            loading={refreshing}
            disabled={canceling}
          >
            <IconRefreshCw size={15} />
            {t('common.refresh')}
          </Button>
          {!terminal && task.status !== 'canceling' ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onCancel}
              loading={canceling}
              disabled={refreshing}
            >
              {t('auth_files.codex_identity_cancel')}
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={t('auth_files.codex_identity_progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={styles.progressLabel}>{progress}%</div>

      <div className={styles.taskMetrics}>
        {metrics.map(([key, value]) => (
          <div key={key}>
            <span>{t(`auth_files.codex_identity_metrics.${key}`)}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <div className={styles.resultsHeader}>
        <h4>{t('auth_files.codex_identity_results')}</h4>
        <span>{t('auth_files.codex_identity_result_count', { count: task.results.length })}</span>
      </div>

      {task.results.length === 0 ? (
        <div className={styles.emptyResults}>{t('auth_files.codex_identity_results_empty')}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>{t('auth_files.codex_identity_source')}</th>
                <th>{t('auth_files.codex_identity_target')}</th>
                <th>{t('auth_files.codex_identity_stage')}</th>
                <th>{t('auth_files.codex_identity_item_progress')}</th>
                <th>{t('auth_files.codex_identity_status')}</th>
                <th>{t('auth_files.codex_identity_error')}</th>
              </tr>
            </thead>
            <tbody>
              {task.results.map((result, index) => {
                const stageLabel = translatedOrFallback(
                  t,
                  `auth_files.codex_identity_stages.${result.stage}`,
                  result.stage
                );
                const resultLabel = translatedOrFallback(
                  t,
                  `auth_files.codex_identity_result_states.${result.status}`,
                  result.status
                );
                const errorCategory = result.error_category
                  ? translatedOrFallback(
                      t,
                      `auth_files.codex_identity_error_categories.${result.error_category}`,
                      result.error_category
                    )
                  : '';
                const message = [errorCategory, result.error].filter(Boolean).join(' · ');
                const itemProgress = Math.max(
                  0,
                  Math.min(100, Number(result.progress_percent) || 0)
                );

                return (
                  <tr key={`${result.source_name}-${index}`}>
                    <td className={styles.wrapCell}>{result.source_name || '-'}</td>
                    <td className={styles.wrapCell}>{result.target_name || '-'}</td>
                    <td>{stageLabel}</td>
                    <td>{itemProgress}%</td>
                    <td>
                      <span className={styles.resultState} data-status={result.status}>
                        {resultLabel}
                      </span>
                    </td>
                    <td className={styles.errorCell}>{message || '-'}</td>
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
