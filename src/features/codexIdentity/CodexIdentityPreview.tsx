import { useEffect, useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import { codexIdentityFields, type CodexIdentityPreviewResult } from '@/types/codexIdentity';
import { useCodexIdentitySupport } from './CodexIdentityEditor';
import styles from './CodexIdentity.module.scss';
export function CodexIdentityPreview({ authIndex }: { authIndex: string }) {
  const supported = useCodexIdentitySupport();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CodexIdentityPreviewResult>();
  const [error, setError] = useState('');
  const connectionKey = useAuthStore((s) => `${s.apiBase}:${s.connectionGeneration ?? 0}`);
  useEffect(() => {
    if (!open || !supported || !authIndex) return;
    const c = new AbortController();
    setData(undefined);
    setError('');
    const connection = apiClient.captureConnection();
    apiClient
      .postAtConnection<CodexIdentityPreviewResult>(
        connection,
        '/auth-files/codex/identity/preview',
        { auth_index: authIndex },
        { signal: c.signal }
      )
      .then((v) => {
        if (!c.signal.aborted) setData(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => c.abort();
  }, [open, supported, authIndex, connectionKey]);
  if (!supported || !authIndex) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t('codex_identity.preview')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('codex_identity.preview')}
        width={760}
      >
        <div className={styles.preview}>
          {error ? (
            <div role="alert" className="error-box">
              {error}
            </div>
          ) : !data ? (
            <div>{t('common.loading')}</div>
          ) : (
            <>
              <strong>
                {t('codex_identity.priority', { priority: data.priority })} ·{' '}
                {t(`codex_identity.reason.${data.reason}`)}
              </strong>
              <dl className={styles.policy}>
                {codexIdentityFields.map((key) => (
                  <Fragment key={key}>
                    <dt>{t(`codex_identity.${key}`)}</dt>
                    <dd>
                      {typeof data.policy[key] === 'boolean'
                        ? t(data.policy[key] ? 'codex_identity.on' : 'codex_identity.off')
                        : key === 'fingerprint-mode'
                          ? t(`auth_files.codex_fingerprint_modes.${data.policy[key]}`)
                          : key === 'turn-state-policy'
                            ? t(`codex_identity.turn.${data.policy[key]}`)
                            : String(data.policy[key] ?? '—') || '—'}
                      <span className={styles.source}>
                        {t(`codex_identity.source.${data.sources[key] ?? 'global'}`)}
                      </span>
                    </dd>
                  </Fragment>
                ))}
              </dl>
              {data.policy['enforce-software-identity'] && (
                <dl className={styles.policy}>
                  {Object.entries(data.software).map(([key, value]) => (
                    <Fragment key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}
              <div className={styles.hint}>
                {t('codex_identity.version', { version: data.version })}
                <br />
                {t('codex_identity.protected', { fields: data.protected_fields.join(', ') || '—' })}
                <br />
                {t('codex_identity.migration')}
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
