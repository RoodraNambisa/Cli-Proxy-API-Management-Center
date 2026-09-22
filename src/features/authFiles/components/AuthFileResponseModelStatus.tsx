import type { GuardRecord } from '@/utils/codexResponseGuard';
import { ResponseGuardDetails } from './ResponseGuardDetails';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconEye, IconRefreshCw } from '@/components/ui/icons';
import { ConfigHelp } from '@/components/config/ConfigHelp';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';
import type { AuthFileItem } from '@/types/authFile';
import type { ResponseModelRewriteSummary } from '@/utils/responseModelRewrite';
import { formatDateTime } from '@/utils/format';
import styles from './AuthFileResponseModelStatus.module.scss';

export function AuthFileResponseModelStatus({
  file,
  disabled,
}: {
  file: AuthFileItem;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_model_rewrite.${key}`);
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
  const [selectedDetail, setSelectedDetail] = useState<{ scope: string; record: GuardRecord }>();
  const [result, setResult] = useState<{
    scope: string;
    revision: number;
    data?: ResponseModelRewriteSummary;
    error?: string;
  }>();
  const open = openScope === scope;
  const detail = open && selectedDetail?.scope === scope ? selectedDetail.record : undefined;
  const close = () => {
    setOpenScope(undefined);
    setSelectedDetail(undefined);
  };
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void authFilesApi
      .responseModelRewrite(file.name, apiClient.captureConnection(), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ scope, revision, data });
      })
      .catch((error) => {
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
  const busy = open && !current;
  const data = open ? (current?.data ?? file.response_model_rewrite) : file.response_model_rewrite;
  if (!data) return null;
  const recentData = result?.scope === scope ? result.data : undefined;
  const visibleTotal =
    recentData?.since === data.since ? Math.max(data.total, recentData.total) : data.total;
  const rewriteLabel = data.enabled
    ? text(data.conditional ? 'conditional' : 'enabled')
    : text('disabled');
  const stateLabel =
    data.guard_enabled !== undefined
      ? `${t(data.guard_enabled ? 'response_guard.enabled' : 'response_guard.disabled')} · ${t('response_guard.rewrite_status', { status: rewriteLabel })}`
      : rewriteLabel;
  return (
    <>
      <div className={styles.line}>
        <span className={styles.label}>{text('card_title')}</span>
        <span>{stateLabel}</span>
        <span className={styles.count}>
          {t('response_model_rewrite.count', { count: visibleTotal })}
          {data.guard_enabled || data.blocked
            ? ` · ${t('response_guard.blocked_count', { count: data.blocked ?? 0 })}`
            : ''}
        </span>
        <Button
          size="sm"
          variant="ghost"
          title={text('details')}
          aria-label={`${text('details')}: ${file.name}`}
          disabled={disabled}
          onClick={() => {
            setRevision((value) => value + 1);
            setSelectedDetail(undefined);
            setOpenScope(scope);
          }}
        >
          <IconEye size={15} />
        </Button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title={detail ? t('response_guard.details') : text('details')}
        width={1100}
        footer={
          <Button variant="secondary" onClick={close}>
            {t('common.close')}
          </Button>
        }
      >
        {detail ? (
          <div className={styles.detailView}>
            <Button
              autoFocus
              size="sm"
              variant="secondary"
              onClick={() => setSelectedDetail(undefined)}
            >
              {t('response_guard.back_records')}
            </Button>
            <ResponseGuardDetails record={detail} />
          </div>
        ) : (
          <>
            <div className={styles.heading}>
              <strong>{file.name}</strong>
              <ConfigHelp compact title={text('total')} text={text('history_scope')} />
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
            {current?.error && (
              <div className="error-box" role="alert">
                {current.error}
              </div>
            )}
            {busy ? (
              <p role="status">{text('loading')}</p>
            ) : (
              <>
                <dl className={styles.summary}>
                  <div>
                    <dt>{text('status')}</dt>
                    <dd>{stateLabel}</dd>
                  </div>
                  <div>
                    <dt>{text('total')}</dt>
                    <dd>{data.total}</dd>
                  </div>
                  <div>
                    <dt>{t('response_guard.blocked')}</dt>
                    <dd>{data.blocked ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{t('response_guard.observed')}</dt>
                    <dd>{data.observed ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{text('since')}</dt>
                    <dd>{formatDateTime(data.since)}</dd>
                  </div>
                </dl>
                <div className={styles.rules}>
                  <strong>{text('effective_rules')}</strong>
                  {data.rules.length ? (
                    data.rules.map((rule) => (
                      <div key={rule.rule}>
                        <span>#{rule.rule}</span>
                        <code>{rule.models?.join(', ') || text('all')}</code>
                      </div>
                    ))
                  ) : (
                    <span>{text('no_match')}</span>
                  )}
                </div>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          'time',
                          'requested',
                          'original',
                          'returned',
                          'rule',
                          'mode',
                          'validation',
                        ].map((key) => (
                          <th key={key}>{text(key)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent?.length ? (
                        data.recent.map((row, index) => (
                          <tr key={`${row.at}-${index}`}>
                            <td>{formatDateTime(row.at)}</td>
                            <td>
                              <code>{row.requested_model}</code>
                            </td>
                            <td>
                              <code>{row.original_model}</code>
                            </td>
                            <td>
                              <code>
                                {row.validation &&
                                ['blocked', 'aborted'].includes(row.validation.outcome)
                                  ? t(`response_guard.outcome_${row.validation.outcome}`)
                                  : row.response_model || '—'}
                              </code>
                            </td>
                            <td>
                              {row.validation && (
                                <div>
                                  {t('response_guard.rule_short')}{' '}
                                  {row.validation.rule
                                    ? `#${row.validation.rule}`
                                    : t('response_guard.defaults')}
                                </div>
                              )}
                              {row.rule ? (
                                <div>
                                  {t('response_guard.rewrite_short')} #{row.rule}
                                </div>
                              ) : !row.validation ? (
                                '—'
                              ) : null}
                            </td>
                            <td>{text(row.stream ? 'stream' : 'nonstream')}</td>
                            <td>
                              {row.validation ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setSelectedDetail({ scope, record: row.validation! })
                                  }
                                >
                                  {t(`response_guard.outcome_${row.validation.outcome}`)} ·{' '}
                                  {t('response_guard.view_details')}
                                </Button>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7}>{text('empty')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
