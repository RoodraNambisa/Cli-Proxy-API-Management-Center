import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconEye, IconRefreshCw } from '@/components/ui/icons';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';
import { formatDateTime } from '@/utils/format';
import type { AuthFileItem, AuthErrorHistorySummary, AuthErrorModelCount } from '@/types/authFile';
import styles from './AuthFileErrorHistory.module.scss';

export function AuthFileErrorHistory({
  file,
  disabled,
}: {
  file: AuthFileItem;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`auth_error_history.${key}`);
  const connectionKey = useAuthStore((state) =>
    JSON.stringify([
      state.apiBase,
      state.managementAccessPath,
      state.connectionGeneration,
      state.connectionStatus,
    ])
  );
  const scope = `${connectionKey}:${file.name}:${file.auth_index ?? file.authIndex ?? ''}`;
  const [openScope, setOpenScope] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    revision: number;
    data?: AuthErrorHistorySummary;
    error?: string;
  }>();
  const open = openScope === scope;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void authFilesApi
      .errorHistory(file.name, apiClient.captureConnection(), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ scope, revision, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            scope,
            revision,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => controller.abort();
  }, [file.name, open, revision, scope]);
  const current = result?.scope === scope && result.revision === revision ? result : undefined;
  const data = open ? (current?.data ?? file.error_history) : file.error_history;
  const busy = open && !current;
  if (!data || (!open && data.total === 0)) return null;
  const modelTable = (models: AuthErrorModelCount[] = [], other = 0) => (
    <div className={styles.modelScroll}>
      <table className={styles.models}>
        <thead>
          <tr>
            <th>{text('model')}</th>
            <th>{text('count')}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.model}>
              <td>
                <code>{model.model || text('unknown_model')}</code>
              </td>
              <td>{model.count}</td>
            </tr>
          ))}
          {other > 0 && (
            <tr>
              <td>{text('other_models')}</td>
              <td>{other}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className={styles.line}>
        <span className={styles.label}>{text('title')}</span>
        <span>
          {t('auth_error_history.card_count', { count: data.total, distinct: data.distinct })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          title={text('details')}
          aria-label={`${text('details')}: ${file.name}`}
          disabled={disabled}
          onClick={() => {
            setRevision((value) => value + 1);
            setOpenScope(scope);
          }}
        >
          <IconEye size={15} />
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpenScope(undefined)}
        title={text('details')}
        width={900}
        footer={
          <Button variant="secondary" onClick={() => setOpenScope(undefined)}>
            {t('common.close')}
          </Button>
        }
      >
        <div className={styles.heading}>
          <strong>{file.name}</strong>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
            disabled={busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <IconRefreshCw size={16} />
          </Button>
        </div>
        <p className={styles.hint}>{t('auth_error_history.scope', { limit: data.limit })}</p>
        {current?.error && (
          <div className="error-box" role="alert">
            {current.error}
          </div>
        )}
        {busy ? (
          <p role="status">{text('loading')}</p>
        ) : (
          current?.data && (
            <>
              <dl className={styles.summary}>
                <div>
                  <dt>{text('total')}</dt>
                  <dd>{data.total}</dd>
                </div>
                <div>
                  <dt>{text('retained')}</dt>
                  <dd>{data.retained_total}</dd>
                </div>
                <div>
                  <dt>{text('since')}</dt>
                  <dd>{data.since ? formatDateTime(data.since) : '—'}</dd>
                </div>
              </dl>
              {!!data.models?.length && (
                <section className={styles.modelSummary} aria-label={text('by_model')}>
                  <h3>{text('by_model')}</h3>
                  {modelTable(data.models, data.other_models)}
                </section>
              )}
              <div className={styles.records}>
                {data.recent?.length ? (
                  data.recent.map((record) => (
                    <details key={record.id} className={styles.record}>
                      <summary>
                        <div className={styles.recordHeading}>
                          <span className={styles.status}>
                            {record.http_status ? `HTTP ${record.http_status}` : text('no_status')}
                          </span>
                          {record.code && <code>{record.code}</code>}
                          <strong className={styles.count}>
                            {t('auth_error_history.occurrences', { count: record.count })}
                          </strong>
                        </div>
                        <div className={styles.message}>
                          {record.message || record.type || text('unknown_error')}
                        </div>
                        <div className={styles.last}>
                          {text('last')}: {formatDateTime(record.last_at)} · {text('last_model')}:{' '}
                          <code>{record.last_model || text('unknown_model')}</code>
                        </div>
                      </summary>
                      <div className={styles.recordBody}>
                        <div className={styles.hint}>
                          {text('first')}: {formatDateTime(record.first_at)}
                        </div>
                        {modelTable(record.models, record.other_models)}
                        {record.details && (
                          <div className={styles.raw}>
                            <strong>
                              {text('raw')}
                              {record.truncated ? ` · ${text('truncated')}` : ''}
                            </strong>
                            <pre>{record.details}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ))
                ) : (
                  <p className={styles.hint}>{text('empty')}</p>
                )}
              </div>
            </>
          )
        )}
      </Modal>
    </>
  );
}
