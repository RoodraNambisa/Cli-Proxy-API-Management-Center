import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { useAuthStore, useNotificationStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyPoolsApi } from '@/services/api/proxyPools';
import type { RegionPagination } from '@/services/api/proxyIp';
import type { ProxyBindingStatus, ProxyRebindResult } from '@/types';
import { ProxyRegionFieldStatus, ProxyRegionApplicationDetails } from './ProxyRegionApplication';
import styles from '@/pages/ProxyPoolsPage.module.scss';
import regionStyles from './ProxyRegionStatus.module.scss';

export function ProxyBindingsPanel({
  revision,
  onRebound,
}: {
  revision: number;
  onRebound: () => void;
}) {
  const { t } = useTranslation();
  const key = useAuthStore((s) =>
    JSON.stringify([s.apiBase, s.managementAccessPath, s.connectionGeneration, s.connectionStatus])
  );
  const disabled = useAuthStore((s) => s.connectionStatus !== 'connected');
  const connection = useMemo(() => ({ key, api: apiClient.captureConnection() }), [key]);
  const current = useRef(connection);
  current.current = connection;
  const notify = useNotificationStore((s) => s.showNotification);
  const [rows, setRows] = useState<ProxyBindingStatus[]>([]);
  const [pagination, setPagination] = useState<RegionPagination | null>(null);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false),
    [rebinding, setRebinding] = useState(false),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ProxyBindingStatus | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setRows([]);
    setPage(1);
    setSearch('');
    setSelected(new Set());
    setDetail(null);
    setError('');
    setRebinding(false);
  }, [connection]);
  useEffect(() => {
    if (disabled) return;
    const a = new AbortController();
    setLoading(true);
    setError('');
    setRows([]);
    setSelected(new Set());
    setDetail(null);
    const timer = setTimeout(() => {
      void proxyPoolsApi
        .getBindingsPage(connection.api, page, search, a.signal)
        .then((r) => {
          if (a.signal.aborted || current.current !== connection) return;
          setRows(r.bindings);
          setPagination(r.pagination ?? null);
          if (r.pagination) setPage(r.pagination.page);
        })
        .catch((e) => {
          if (!a.signal.aborted && current.current === connection) setError((e as Error).message);
        })
        .finally(() => {
          if (!a.signal.aborted && current.current === connection) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      a.abort();
    };
  }, [connection, disabled, page, search, revision, reload]);
  const rebind = async () => {
    setRebinding(true);
    setError('');
    try {
      const response = await apiClient.postAtConnection<{ results: ProxyRebindResult[] }>(
        connection.api,
        '/proxy-bindings/rebind',
        { auth_ids: [...selected] }
      );
      if (current.current !== connection) return;
      const failed = response.results.filter((r) => !r.updated).length;
      notify(
        t(failed ? 'proxy_pools.rebind_partial' : 'proxy_pools.rebind_success', {
          failed,
          total: response.results.length,
        }),
        failed ? 'warning' : 'success'
      );
      setSelected(new Set());
      setReload((n) => n + 1);
      onRebound();
    } catch (e) {
      if (current.current === connection) setError((e as Error).message);
    } finally {
      if (current.current === connection) setRebinding(false);
    }
  };
  const formatTime = (value?: string) => (value ? new Date(value).toLocaleString() : '—');
  return (
    <section className={styles.viewSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>{t('proxy_pools.bindings_title')}</h2>
          <p>{t('region_status.binding_hint')}</p>
        </div>
        <Button
          onClick={() => void rebind()}
          loading={rebinding}
          disabled={disabled || loading || !selected.size}
        >
          {t('proxy_pools.rebind_selected', { count: selected.size })}
        </Button>
      </div>
      <Input
        label={t('region_status.search')}
        placeholder={t('region_status.search_hint')}
        value={search}
        disabled={disabled || rebinding}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>{t('proxy_pools.bindings_empty')}</div>
      ) : (
        <div className={styles.bindingTableWrap}>
          <table className={`${styles.bindingTable} ${styles.regionBindingTable}`}>
            <thead>
              <tr>
                <th>
                  <SelectionCheckbox
                    checked={!!rows.length && selected.size === rows.length}
                    onChange={(checked) =>
                      setSelected(checked ? new Set(rows.map((r) => r.auth_id)) : new Set())
                    }
                    ariaLabel={t('region_status.select_page')}
                    disabled={rebinding}
                  />
                </th>
                {[
                  'proxy_pools.binding_auth',
                  'proxy_pools.binding_pool',
                  'proxy_pools.binding_exit',
                  'region_status.timezone',
                  'region_status.language',
                  'proxy_pools.binding_health',
                  'region_status.details',
                ].map((k) => (
                  <th key={k}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.binding_id || row.auth_id}>
                  <td>
                    <SelectionCheckbox
                      checked={selected.has(row.auth_id)}
                      ariaLabel={row.auth_index || row.auth_id}
                      disabled={rebinding}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.auth_id)) next.delete(row.auth_id);
                          else next.add(row.auth_id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <strong>{row.name || row.auth_index || row.auth_id}</strong>
                    <span>{row.auth_index || row.auth_id}</span>
                    <span>{row.provider || '—'}</span>
                  </td>
                  <td>
                    {row.direct ? (
                      t('proxy_pools.rule_target_direct')
                    ) : (
                      <>
                        <strong>{row.pool || '—'}</strong>
                        <span>
                          {row.entry || '—'}
                          {row.port ? `:${row.port}` : ''}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    {row.direct ? (
                      '—'
                    ) : (
                      <>
                        <strong>{row.ip || '—'}</strong>
                        <span>{row.loc || '—'}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <ProxyRegionFieldStatus
                      field={row.application?.timezone}
                      authDisabled={row.application?.auth_disabled}
                    />
                  </td>
                  <td>
                    <ProxyRegionFieldStatus
                      field={row.application?.language}
                      authDisabled={row.application?.auth_disabled}
                    />
                  </td>
                  <td>
                    <strong
                      className={
                        row.healthy === true
                          ? styles.healthGood
                          : row.healthy === false
                            ? styles.healthBad
                            : styles.healthUnknown
                      }
                    >
                      {t(
                        `proxy_pools.health.${row.direct ? 'not_applicable' : row.healthy === true ? 'healthy' : row.healthy === false ? 'unhealthy' : 'unknown'}`
                      )}
                    </strong>
                    <span>{row.direct ? '—' : `${row.elapsed_ms ?? '—'} ms`}</span>
                    <span>{formatTime(row.last_check_at)}</span>
                  </td>
                  <td>
                    <Button size="sm" variant="secondary" onClick={() => setDetail(row)}>
                      {t('region_status.details')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={regionStyles.pagination}>
        <span>{t('region_status.matches', { count: pagination?.total ?? 0 })}</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || rebinding || page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {t('proxy_ip.previous_page')}
        </Button>
        <span>
          {page} / {pagination?.total_pages ?? 1}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || rebinding || !pagination || page >= pagination.total_pages}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('proxy_ip.next_page')}
        </Button>
      </div>
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={t('region_status.details')}
        width={720}
      >
        {detail && (
          <>
            <p className={regionStyles.hint}>
              {detail.name || detail.auth_index || detail.auth_id}
            </p>
            <ProxyRegionApplicationDetails value={detail.application} />
          </>
        )}
      </Modal>
    </section>
  );
}
