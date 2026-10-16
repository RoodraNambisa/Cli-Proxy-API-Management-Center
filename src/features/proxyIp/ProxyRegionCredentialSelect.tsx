import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ApiClientConnectionSnapshot } from '@/services/api/client';
import {
  proxyIPApi,
  type ProxyRegionCredential,
  type RegionPagination,
} from '@/services/api/proxyIp';
import styles from './ProxyRegionStatus.module.scss';

export function ProxyRegionCredentialSelect({
  connection,
  provider,
  value,
  onChange,
  disabled = false,
  active = true,
}: {
  connection: ApiClientConnectionSnapshot;
  provider?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState('bound');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ProxyRegionCredential[]>([]);
  const [pagination, setPagination] = useState<RegionPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    setScope('bound');
    setSearch('');
    setPage(1);
    setItems([]);
    setPagination(null);
    setUnsupported(false);
    setError('');
  }, [connection]);
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    setLoading(true);
    setItems([]);
    setPagination(null);
    setError('');
    const timer = setTimeout(() => {
      void proxyIPApi
        .credentials(connection, { scope, provider, search, page, page_size: 20 }, abort.signal)
        .then((r) => {
          if (abort.signal.aborted) return;
          setItems(r.credentials);
          setPagination(r.pagination);
          setPage(r.pagination.page);
          setUnsupported(false);
        })
        .catch((e) => {
          if (abort.signal.aborted) return;
          const unavailable = [404, 405, 501].includes((e as { status?: number })?.status ?? 0);
          setUnsupported(unavailable);
          setError(t(unavailable ? 'region_status.selector_upgrade' : 'proxy_ip.failed'));
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [active, connection, provider, scope, search, page, t]);
  return (
    <div className={styles.selector}>
      <div className={styles.filters}>
        <label>
          {t('region_status.filter')}
          <select
            className="input"
            value={scope}
            disabled={disabled || unsupported}
            onChange={(e) => {
              setScope(e.target.value);
              setPage(1);
              onChange('');
            }}
          >
            {['bound', 'custom', 'all'].map((k) => (
              <option key={k} value={k}>
                {t(`region_status.filter_${k}`)}
              </option>
            ))}
          </select>
        </label>
        <Input
          label={t('region_status.search')}
          value={search}
          placeholder={t('region_status.search_hint')}
          disabled={disabled || unsupported}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            onChange('');
          }}
        />
      </div>
      {error && (
        <p role="alert" className={styles.hint}>
          {error}
        </p>
      )}
      {unsupported ? (
        <Input
          label={t('proxy_ip.auth_index')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      ) : (
        <>
          <label>
            {t('region_status.credential')}
            <select
              className="input"
              value={value}
              disabled={disabled || loading}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="">{t(loading ? 'common.loading' : 'region_status.select')}</option>
              {value && !items.some((i) => i.auth_index === value) && (
                <option value={value}>{value}</option>
              )}
              {items.map((item) => (
                <option key={item.auth_id} value={item.auth_index} disabled={!item.auth_index}>
                  {item.name}
                  {item.pool ? ` · ${item.pool}${item.entry ? ` / ${item.entry}` : ''}` : ''}
                  {item.disabled ? ` · ${t('common.disabled')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.pagination}>
            <span>
              {loading
                ? t('common.loading')
                : t('region_status.matches', { count: pagination?.total ?? 0 })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || loading || page <= 1}
              onClick={() => {
                setPage(page - 1);
                onChange('');
              }}
            >
              {t('proxy_ip.previous_page')}
            </Button>
            <span>
              {pagination?.page ?? 1} / {pagination?.total_pages ?? 1}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || loading || !pagination || page >= pagination.total_pages}
              onClick={() => {
                setPage(page + 1);
                onChange('');
              }}
            >
              {t('proxy_ip.next_page')}
            </Button>
          </div>
          {!loading && !error && pagination?.total === 0 && (
            <p className={styles.hint}>{t('region_status.no_matches')}</p>
          )}
        </>
      )}
    </div>
  );
}
