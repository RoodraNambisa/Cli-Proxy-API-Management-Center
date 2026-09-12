import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import type { UsageFailureDetails } from '@/utils/usage/failureDetails';
import styles from './UsageErrorDetails.module.scss';

export function UsageErrorDetails({ detail, onClose }: { detail: UsageFailureDetails | null; onClose: () => void }) {
  const { t } = useTranslation();
  const label = (key: string) => t(`usage_stats.error_details.${key}`);
  const fields = detail ? [
    [label('status'), detail.status_code], [label('upstream_status'), detail.upstream_status_code], [label('code'), detail.error_code],
    [label('type'), detail.error_type], [label('stage'), detail.failure_stage ? t(`usage_stats.failure_stages.${detail.failure_stage}`, { defaultValue: detail.failure_stage }) : undefined],
    [label('request_id'), detail.request_id], [label('upstream_id'), detail.upstream_request_id],
  ].filter(([, value]) => value !== undefined && value !== '') : [];
  let response = detail?.error_response || '';
  if (response) {
    try { response = JSON.stringify(JSON.parse(response), null, 2); } catch { /* Keep truncated or non-JSON diagnostics readable. */ }
  }
  return <Modal open={detail !== null} onClose={onClose} title={label('title')} width={760}>
    {detail && <div className={styles.content}>
      {fields.length > 0 && <dl className={styles.fields}>{fields.map(([name, value]) =>
        <div key={String(name)}><dt>{name}</dt><dd>{value}</dd></div>
      )}</dl>}
      {detail.error_message ? <section><h4>{label('message')}</h4><p className={styles.message}>{detail.error_message}</p></section> : null}
      {response ? <section><h4>{label('response')}</h4><pre className={styles.response}>{response}</pre></section> : null}
      {!detail.error_message && !detail.error_response && <p className="hint">{label('unavailable')}</p>}
      {detail.failure_stage && <dl className={styles.fields}>{([
        ['selected', detail.credential_selected], ['committed', detail.upstream_committed], ['limited', detail.auth_request_slot_consumed],
      ] as const).filter(([, value]) => value !== undefined).map(([name, value]) =>
        <div key={name}><dt>{label(name)}</dt><dd>{t(value ? 'common.yes' : 'common.no')}</dd></div>
      )}</dl>}
    </div>}
  </Modal>;
}
