import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/services/api/client';
import {
  chatGptWebLibraryApi,
  isLibraryCleanupActive,
  parseLibraryConcurrency,
  type LibraryCleanupTask,
} from '@/services/api/chatgptWebLibrary';
import styles from './ChatGptWebLibraryCleanup.module.scss';

const PAGE_SIZE = 25;

export function ChatGptWebLibraryCleanup({
  selectedNames,
  disabled = false,
}: {
  selectedNames: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [connection] = useState(() => apiClient.captureConnection());
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<'selected' | 'all'>('selected');
  const [concurrency, setConcurrency] = useState('4');
  const [confirmed, setConfirmed] = useState(false);
  const [frozenNames, setFrozenNames] = useState<string[]>([]);
  const [task, setTask] = useState<LibraryCleanupTask | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const operation = useRef(false);
  const mounted = useRef(true);
  const revision = useRef(0);
  const active = isLibraryCleanupActive(task);
  const limit = parseLibraryConcurrency(concurrency);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const poll = async () => {
      if (!operation.current) {
        const requestedRevision = revision.current;
        try {
          const result = await chatGptWebLibraryApi.get(connection, abort.signal, page + 1);
          if (!disposed && requestedRevision === revision.current) {
            setTask(result.task);
            setLoaded(true);
            setError('');
          }
        } catch {
          if (!disposed && requestedRevision === revision.current) {
            setLoaded(false);
            setError(t('library_cleanup.load_failed'));
          }
        }
      }
      if (!disposed) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [open, disabled, connection, refresh, page, t]);

  const mutate = async (cancel: boolean) => {
    if (operation.current || disabled || !loaded) return;
    if (
      !cancel &&
      (!confirmed || active || limit === null || (selection === 'selected' && !frozenNames.length))
    )
      return;
    if (cancel && (!task || !active || task.state === 'canceling')) return;
    operation.current = true;
    revision.current++;
    setPending(true);
    setError('');
    try {
      const result = cancel
        ? await chatGptWebLibraryApi.cancel(connection, task!.id)
        : await chatGptWebLibraryApi.start(
            connection,
            selection === 'all' ? { all: true } : { names: [...frozenNames] },
            limit!
          );
      if (mounted.current) {
        setTask(result.task);
        setConfirmed(false);
        setPage(0);
      }
    } catch {
      if (mounted.current) {
        // A lost response is not proof that the server did not start the job.
        setLoaded(false);
        setConfirmed(false);
        setError(t('library_cleanup.operation_failed'));
      }
    } finally {
      operation.current = false;
      if (mounted.current) {
        setPending(false);
        setRefresh((value) => value + 1);
      }
    }
  };

  const finished = task?.processed_credentials ?? 0;
  const total = task?.total_credentials ?? 0;
  const currentPage = Math.max(0, (task?.page ?? 1) - 1);
  const results = task?.results ?? [];
  const bytes = (value?: number) =>
    value === undefined ? '-' : `${(value / 1048576).toFixed(2)} MiB`;
  const label = (key: string) => t(`library_cleanup.${key}`, { defaultValue: key });

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setLoaded(false);
          setConfirmed(false);
          setFrozenNames([...selectedNames]);
          setOpen(true);
        }}
      >
        {t(active ? 'library_cleanup.view_progress' : 'library_cleanup.title')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('library_cleanup.title')}
        width={960}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
            {active ? (
              <Button
                variant="danger"
                disabled={disabled || pending || !loaded || task?.state === 'canceling'}
                onClick={() => void mutate(true)}
              >
                {t('library_cleanup.cancel')}
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={pending}
                disabled={
                  disabled ||
                  pending ||
                  !loaded ||
                  !confirmed ||
                  limit === null ||
                  (selection === 'selected' && frozenNames.length === 0)
                }
                onClick={() => void mutate(false)}
              >
                {t('library_cleanup.start')}
              </Button>
            )}
          </>
        }
      >
        <div className={styles.body}>
          <p className={styles.warning}>{t('library_cleanup.warning')}</p>
          <p className={styles.hint}>{t('library_cleanup.background')}</p>
          <fieldset disabled={active || pending || disabled} className={styles.controls}>
            <legend>{t('library_cleanup.scope')}</legend>
            <label>
              <input
                type="radio"
                name="library-cleanup-scope"
                checked={selection === 'selected'}
                onChange={() => {
                  setSelection('selected');
                  setConfirmed(false);
                }}
              />
              {t('library_cleanup.selected', { count: frozenNames.length })}
            </label>
            <label>
              <input
                type="radio"
                name="library-cleanup-scope"
                checked={selection === 'all'}
                onChange={() => {
                  setSelection('all');
                  setConfirmed(false);
                }}
              />
              {t('library_cleanup.all')}
            </label>
            <Input
              label={t('library_cleanup.concurrency')}
              type="number"
              min={1}
              max={32}
              step={1}
              value={concurrency}
              onChange={(event) => setConcurrency(event.target.value)}
              error={limit === null ? t('library_cleanup.invalid_concurrency') : undefined}
            />
            <label className={styles.confirm}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t('library_cleanup.confirm')}
            </label>
          </fieldset>
          {error ? (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          ) : null}
          {!loaded && !error ? <p role="status">{t('library_cleanup.loading')}</p> : null}
          {task ? (
            <section aria-label={t('library_cleanup.progress')} className={styles.progress}>
              <p>
                {t(
                  task.source === 'automatic'
                    ? 'library_cleanup.source_automatic'
                    : 'library_cleanup.source_manual'
                )}
              </p>
              <div className={styles.summary} role="status">
                <strong>{label(task.state)}</strong>
                <span>
                  {t('library_cleanup.summary', {
                    finished,
                    total,
                    deleted: task.deleted_files,
                  })}
                </span>
              </div>
              <progress
                max={Math.max(1, total)}
                value={finished}
                aria-label={t('library_cleanup.progress')}
              />
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('library_cleanup.credential')}</th>
                      <th>{t('library_cleanup.stage')}</th>
                      <th>{t('library_cleanup.files')}</th>
                      <th>{t('library_cleanup.storage')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result.name}>
                        <td>{result.name}</td>
                        <td>
                          {label(result.stage)}
                          {result.failure_stage ? <div>{label(result.failure_stage)}</div> : null}
                          {result.error_code ? (
                            <div className={styles.error}>
                              {label(result.error_code)}
                              {result.http_status ? ` (HTTP ${result.http_status})` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {t('library_cleanup.file_counts', {
                            deleted: result.deleted_files,
                            total: result.total_files,
                            failed: result.failed_files,
                            skipped: result.skipped_files,
                          })}
                          {result.failure_reasons ? (
                            <div className={styles.errorReasons}>
                              {Object.entries(result.failure_reasons).map(([reason, count]) => (
                                <div key={reason}>
                                  {label(reason)}: {count}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {bytes(result.before?.used_bytes)} → {bytes(result.after?.used_bytes)}
                          {result.before?.is_over_limit ? (
                            <div>{t('library_cleanup.full')}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > PAGE_SIZE ? (
                <div className={styles.pagination}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!loaded || currentPage === 0}
                    onClick={() => {
                      setLoaded(false);
                      setPage(currentPage - 1);
                    }}
                  >
                    {t('auth_files.pagination_prev')}
                  </Button>
                  <span>
                    {currentPage + 1} / {Math.ceil(total / PAGE_SIZE)}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!loaded || (currentPage + 1) * PAGE_SIZE >= total}
                    onClick={() => {
                      setLoaded(false);
                      setPage(currentPage + 1);
                    }}
                  >
                    {t('auth_files.pagination_next')}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
