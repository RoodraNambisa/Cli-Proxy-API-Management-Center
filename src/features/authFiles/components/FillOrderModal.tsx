import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types/authFile';
import styles from './FillOrderModal.module.scss';

type Neighbor = { record_id: string; name: string; priority: number };
type Preview = {
  record: Neighbor;
  before: Neighbor | null;
  after: Neighbor | null;
  revision: string;
};
export function FillOrderModal({
  file,
  onClose,
  onSaved,
}: {
  file: AuthFileItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const connection = useMemo(() => apiClient.captureConnection(), []);
  const submitController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      submitController.current?.abort();
    },
    []
  );
  const [mode, setMode] = useState('up');
  const [steps, setSteps] = useState('1');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [candidates, setCandidates] = useState<AuthFileItem[]>([]);
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const relative = mode === 'up' || mode === 'down';
  const valid = relative
    ? Number.isSafeInteger(Number(steps)) && Number(steps) > 0
    : Boolean(target);
  const payload = useMemo(
    () => ({
      record_id: file.fill_order?.record_id,
      revision: file.fill_order_revision,
      ...(relative
        ? { direction: mode, steps: Number(steps) }
        : mode === 'before'
          ? { before_id: target }
          : { after_id: target }),
    }),
    [file, relative, mode, steps, target]
  );
  useEffect(() => {
    setPreview(undefined);
    setError('');
  }, [payload]);
  useEffect(() => {
    if (relative) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      authFilesApi
        .listPaged(
          { page, pageSize: 50, priority: String(file.priority ?? 0), search, sort: 'fill-order' },
          connection,
          abort.signal
        )
        .then((result) => {
          if (!abort.signal.aborted) {
            setCandidates(
              result.files.filter(
                (item) => item.fill_order?.record_id !== file.fill_order?.record_id
              )
            );
            setPages(result.pagination?.total_pages ?? 1);
          }
        })
        .catch((err) => {
          if (!abort.signal.aborted) setError(err instanceof Error ? err.message : String(err));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [relative, page, search, file, connection]);
  const submit = async (commit: boolean) => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    submitController.current = controller;
    try {
      const result = await apiClient.postAtConnection<Preview>(
        connection,
        `/auth-files/fill-order/${commit ? 'move' : 'preview'}`,
        payload,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (commit) {
        onSaved();
        onClose();
      } else setPreview(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPreview(undefined);
      setError(
        (err as { status?: number }).status === 409
          ? t('fill_order.conflict')
          : err instanceof Error
            ? err.message
            : String(err)
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={t('fill_order.title')}
      onClose={onClose}
      closeDisabled={busy}
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit(Boolean(preview))} disabled={!valid || busy}>
            {t(preview ? 'fill_order.apply' : 'fill_order.preview')}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <div>
          <strong>{file.name}</strong>
          <p className={styles.hint}>{t('fill_order.scope', { priority: file.priority ?? 0 })}</p>
        </div>
        <div className={styles.fields}>
          <div className="form-group">
            <label id="fill-order-action">{t('fill_order.action')}</label>
            <Select
              ariaLabelledBy="fill-order-action"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setTarget('');
              }}
              disabled={busy}
              options={['up', 'down', 'before', 'after'].map((value) => ({
                value,
                label: t(`fill_order.${value}`),
              }))}
            />
          </div>
          {relative ? (
            <Input
              label={t('fill_order.steps')}
              type="number"
              min={1}
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
              disabled={busy}
            />
          ) : (
            <Input
              label={t('fill_order.search')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
                setTarget('');
              }}
              disabled={busy}
            />
          )}
        </div>
        {!relative && (
          <>
            <div className="form-group">
              <label id="fill-order-target">{t('fill_order.target')}</label>
              <Select
                ariaLabelledBy="fill-order-target"
                value={target}
                onChange={setTarget}
                disabled={busy}
                options={[
                  { value: '', label: t('fill_order.choose') },
                  ...candidates
                    .filter((item) => item.fill_order)
                    .map((item) => ({ value: item.fill_order!.record_id, label: item.name })),
                ]}
              />
            </div>
            <div className={styles.pagination}>
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1 || busy}
                onClick={() => {
                  setPage(page - 1);
                  setTarget('');
                }}
              >
                ←
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= pages || busy}
                onClick={() => {
                  setPage(page + 1);
                  setTarget('');
                }}
              >
                →
              </Button>
            </div>
          </>
        )}
        {preview && (
          <div className={styles.preview} role="status">
            <span>{preview.before?.name ?? t('fill_order.start')}</span>
            <strong>→ {file.name}</strong>
            <span>→ {preview.after?.name ?? t('fill_order.end')}</span>
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
