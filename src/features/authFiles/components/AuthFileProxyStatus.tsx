import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { AuthFileItem, AuthFileProxyRoute } from '@/types/authFile';
import { formatDateTime } from '@/utils/format';
import styles from './AuthFileProxyStatus.module.scss';

export function AuthFileProxyStatus({ file, disabled }: { file: AuthFileItem; disabled: boolean }) {
  const { t } = useTranslation();
  const connectionKey = useAuthStore((state) =>
    JSON.stringify([
      state.apiBase,
      state.managementAccessPath,
      state.connectionGeneration ?? 0,
      state.connectionStatus,
    ])
  );
  const scope = `${connectionKey}:${file.name}:${file.proxy_route?.id ?? ''}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    scope: string;
    busy?: boolean;
    route?: AuthFileProxyRoute;
    error?: string;
  }>();
  const newerSnapshot =
    file.proxy_route?.checked_at &&
    state?.route?.checked_at &&
    Date.parse(file.proxy_route.checked_at) > Date.parse(state.route.checked_at);
  const current = state?.scope === scope && (!newerSnapshot || state.busy) ? state : undefined;
  const route = current?.route ?? file.proxy_route;

  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [scope]
  );

  const check = async () => {
    if (controller.current || disabled) return;
    const abort = new AbortController();
    controller.current = abort;
    setState({ scope, busy: true, route });
    try {
      const response = await authFilesApi.checkProxy(
        file.name,
        apiClient.captureConnection(),
        abort.signal
      );
      if (!abort.signal.aborted && activeScope.current === scope)
        setState({ scope, route: response.proxy_route });
    } catch (error) {
      if (!abort.signal.aborted && activeScope.current === scope)
        setState({ scope, route, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  };

  if (!route && !file.request_limit) return null;
  const limit = file.request_limit;
  const limitRow = limit && (
    <div className={styles.line} title={t('credential_proxy.limit_hint')}>
      <span className={styles.label}>{t('credential_proxy.limit')}</span>
      <strong>
        {limit.limit > 0
          ? t('credential_proxy.limit_value', { count: limit.limit, minutes: limit.window_minutes })
          : t('credential_proxy.unlimited')}
      </strong>
      <span className={styles.source}>
        {t(`credential_proxy.limit_sources.${limit.source}`)}
        {limit.rule ? ` #${limit.rule}` : ''}
      </span>
    </div>
  );
  if (!route) return <div className={styles.root}>{limitRow}</div>;
  const source = [
    'auth',
    'pool',
    'global',
    'inherit',
    'direct',
    'source_snapshot',
    'relay',
  ].includes(route.source)
    ? route.source
    : 'inherit';
  const relay = source === 'relay';
  const failed = route.ok === false || route.mode === 'invalid' || Boolean(current?.error);
  const address = relay
    ? t('credential_proxy.relay')
    : route.mode === 'invalid'
      ? t('credential_proxy.invalid')
      : route.pending
        ? t('credential_proxy.pending')
        : route.mode === 'direct'
          ? t('credential_proxy.direct')
          : route.address || t('credential_proxy.inherit');
  const title = [
    route.linked ? t('credential_proxy.linked') : '',
    t('credential_proxy.check_hint'),
    route.checked_at
      ? `${t('credential_proxy.checked_at')}: ${formatDateTime(route.checked_at)}`
      : '',
    current?.error,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className={styles.root} title={title}>
      <div className={styles.line}>
        <span className={styles.label}>{t('credential_proxy.label')}</span>
        <span className={styles.source}>
          {t(`credential_proxy.sources.${source}`)}
          {route.pool ? ` · ${route.pool}` : ''}
          {route.linked ? ` · ${t('credential_proxy.linked')}` : ''}
        </span>
        <span className={styles.address}>{address}</span>
      </div>
      {!relay && (
        <div className={styles.line}>
          <span className={styles.label}>{t('credential_proxy.ip')}</span>
          <span className={failed ? styles.failed : styles.value} role="status">
            {current?.busy
              ? t('credential_proxy.checking')
              : failed
                ? t('credential_proxy.failed')
                : route.ip
                  ? `${route.ip}${route.loc ? ` · ${route.loc}` : ''}`
                  : t('credential_proxy.unchecked')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || current?.busy}
            onClick={() => void check()}
            aria-label={`${t('credential_proxy.check')}: ${file.name}`}
          >
            {t('credential_proxy.check')}
          </Button>
        </div>
      )}
      {route.checked_at && (
        <span className={styles.timestamp}>
          {t('credential_proxy.checked_at')} {formatDateTime(route.checked_at)}
        </span>
      )}
      {limitRow}
      {current?.error && (
        <span className={styles.failed} role="alert">
          {current.error}
        </span>
      )}
    </div>
  );
}
