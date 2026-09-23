import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { CodexCookieSnapshot, CodexCookieBundleSnapshot } from '@/types/authFile';
import { hasCookieRulePool } from '@/utils/codexCookieSharing';
import styles from './AuthFileStateStatus.module.scss';

export function AuthFileCookieStatus({
  cookie,
  now,
  disabled,
  onAction,
}: {
  cookie: CodexCookieSnapshot;
  now: number;
  disabled: boolean;
  onAction: (action: string) => void;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`, { defaultValue: key });
  const bundles: Array<[string, CodexCookieBundleSnapshot | undefined]> = [
    ['main', cookie.main],
    ['candidate', cookie.candidate],
    ...(cookie.backups ?? []).map((b, i): [string, CodexCookieBundleSnapshot] => [
      `backup-${i + 1}`,
      b,
    ]),
  ];
  const poolName = cookie.pool?.slice(cookie.pool.indexOf(':') + 1);
  const poolLabel = !cookie.pool
    ? text('cookie-pool-mode_credential')
    : hasCookieRulePool({
          'cookie-pool-mode': cookie.pool.split(':')[0],
          'cookie-pool-group': poolName,
        })
      ? `${text('cookie_rule_pool')} · ${cookie.shared_models?.join(', ') || cookie.model}`
      : t(`codex_state.cookie_pool_${cookie.pool.split(':')[0]}`, { name: poolName });
  return (
    <details>
      <summary>
        {text('cookie_title')} · {poolLabel} · {text(`status_${cookie.status}`)}
      </summary>
      <p className={styles.counts}>{text('cookie_shared_hint')}</p>
      {cookie.acquisition_model && (
        <div>
          {text('cookie-acquisition-model')}：<code>{cookie.acquisition_model}</code>
        </div>
      )}
      {cookie.shared_models && (
        <div className={styles.counts}>
          {text('cookie_shared_models')}：{cookie.shared_models.join(', ')}
        </div>
      )}
      {cookie.backup_target !== undefined && (
        <p className={styles.counts}>
          {t('codex_state.cookie_backup_status', {
            count: cookie.backups?.length ?? 0,
            target: cookie.backup_target,
            promotions: cookie.promotions ?? 0,
          })}
        </p>
      )}
      {bundles.map(([kind, bundle]) => {
        if (!bundle) return null;
        return (
          <div key={String(kind)} className={styles.model}>
            <strong>
              {kind.startsWith('backup-')
                ? t('codex_state.cookie_backup_item', { index: kind.slice(7) })
                : text(`cookie_${kind}`)}
            </strong>{' '}
            · v{bundle.version} · <code>{bundle.digest}</code>
            <div>
              {t('codex_state.cookie_age', {
                seconds: Math.max(0, Math.floor((now - Date.parse(bundle.received_at)) / 1000)),
              })}
            </div>
            {bundle.expires_at && (
              <div>
                {text('cookie_declared_expiry')}：{new Date(bundle.expires_at).toLocaleString()}
              </div>
            )}
            {bundle.local_expires_at && (
              <div>
                {text('cookie_local_expiry')}：{new Date(bundle.local_expires_at).toLocaleString()}
              </div>
            )}
            {bundle.members.map((member) => (
              <div
                key={`${member.name}:${member.domain ?? ''}:${member.path}`}
                className={styles.counts}
              >
                {member.name} · {member.digest}
              </div>
            ))}
          </div>
        );
      })}
      <div>
        {text('cookie_last_result')}：
        {cookie.observation ? text(`reason_${cookie.observation}`) : '—'}
      </div>
      <div>
        {text('override_model')}：{cookie.last_returned_model || '—'} ·{' '}
        {text('cookie_returned_length')}：{cookie.last_returned_length ?? '—'}
      </div>
      <div className={styles.counts}>
        {t('codex_state.counts', {
          uses: cookie.uses,
          success: cookie.acquired,
          attempts: cookie.attempts,
        })}
      </div>
      {cookie.last_error && (
        <div className={styles.warning}>{text(`reason_${cookie.last_error}`)}</div>
      )}
      {cookie.next_attempt && (
        <div>
          {text('cookie_next_attempt')}：{new Date(cookie.next_attempt).toLocaleString()}
        </div>
      )}
      <div className={styles.actions}>
        {['refresh', 'acquire', cookie.status === 'paused' ? 'resume' : 'pause', 'clear'].map(
          (action) => (
            <Button
              key={action}
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onAction(action)}
            >
              {text(action)}
            </Button>
          )
        )}
      </div>
    </details>
  );
}
