import styles from './ResponseGuardDetails.module.scss';
import { useTranslation } from 'react-i18next';
import type { GuardRecord } from '@/utils/codexResponseGuard';

export function ResponseGuardDetails({ record }: { record: GuardRecord }) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_guard.${key}`);
  return (
    <div className={styles.root}>
      <strong>{text(`outcome_${record.outcome}`)}</strong>
      <dl>
        <dt>{text('requested_model')}</dt>
        <dd>
          <code>{record.requested_model}</code>
        </dd>
        <dt>{text('upstream_model')}</dt>
        <dd>
          <code>{record.upstream_model}</code>
        </dd>
        <dt>{text('returned_model')}</dt>
        <dd>
          <code>{record.original_model || '—'}</code>
        </dd>
        <dt>{text('public_model')}</dt>
        <dd>
          <code>
            {record.outcome === 'blocked' ? text('outcome_blocked') : record.response_model || '—'}
          </code>
        </dd>
        <dt>{text('state_length')}</dt>
        <dd>{record.state_present ? record.state_length : text('verdict_missing')}</dd>
        <dt>{text('match-model')}</dt>
        <dd>{text(`verdict_${record.verdict.model || 'unknown'}`)}</dd>
        <dt>{text('length-mode')}</dt>
        <dd>{text(`verdict_${record.verdict.state || 'unknown'}`)}</dd>
        <dt>{text('phase')}</dt>
        <dd>
          {text(`phase_${record.phase}`)} · {record.transport}
        </dd>
        <dt>{text('attempt')}</dt>
        <dd>{record.attempt}</dd>
        <dt>{text('status')}</dt>
        <dd>
          HTTP {record.status} · {text('upstream_status')} {record.upstream_status}
        </dd>
        <dt>{text('completed')}</dt>
        <dd>{text(record.completed ? 'completed_yes' : 'completed_no')}</dd>
        <dt>{text('rule')}</dt>
        <dd>{record.rule ? `#${record.rule} ${record.rule_name ?? ''}` : text('defaults')}</dd>
      </dl>
      {(record.verdict.reasons ?? []).map((reason) => (
        <p key={reason}>{text(`reason_${reason}`)}</p>
      ))}
      {record.error && <p>{text('incomplete')}</p>}
      <strong>Usage</strong>
      {record.usage ? (
        <dl>
          {Object.entries(record.usage).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{text('usage_unknown')}</p>
      )}
    </div>
  );
}
