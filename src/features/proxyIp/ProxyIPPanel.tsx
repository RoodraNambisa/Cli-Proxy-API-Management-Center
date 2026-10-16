import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyIPApi, type RegionSnapshot } from '@/services/api/proxyIp';
import { proxyIPDefaults, validProxyIP, type ProxyIPConfig } from './settings';
import styles from './RegionSettings.module.scss';

export function ProxyIPPanel() {
  const { t } = useTranslation();
  const connectionKey = useAuthStore((s) =>
    JSON.stringify([s.apiBase, s.managementAccessPath, s.connectionGeneration, s.connectionStatus])
  );
  const connection = useMemo(() => apiClient.captureConnection(), [connectionKey]);
  const current = useRef(connection);
  current.current = connection;
  const [baseline, setBaseline] = useState<ProxyIPConfig | null>(null),
    [draft, setDraft] = useState<ProxyIPConfig>(proxyIPDefaults);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<{
      entries: RegionSnapshot[];
      route_count: number;
      ip_count: number;
    } | null>(null),
    [offset, setOffset] = useState(0);
  const [index, setIndex] = useState(''),
    [preview, setPreview] = useState<RegionSnapshot | null>(null);
  const aborts = useRef(new Set<AbortController>());
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    const a = new AbortController();
    aborts.current.add(a);
    setError('');
    setBusy(true);
    try {
      await work(a.signal);
    } catch (e) {
      if (!a.signal.aborted && current.current === connection)
        setError((e as Error).message || t('proxy_ip.failed'));
    } finally {
      aborts.current.delete(a);
      if (!a.signal.aborted && current.current === connection) setBusy(false);
    }
  };
  useEffect(() => {
    const a = new AbortController();
    setBaseline(null);
    setSupported(false);
    setStatus(null);
    setPreview(null);
    setIndex('');
    setOffset(0);
    setError('');
    setBusy(false);
    void proxyIPApi
      .get(connection, a.signal)
      .then((r) => {
        if (!a.signal.aborted && current.current === connection) {
          if (!r.capabilities?.proxy_ip || !r.config || !validProxyIP(r.config)) {
            setError(t('proxy_ip.upgrade'));
            return;
          }
          setSupported(true);
          setBaseline(r.config);
          setDraft(r.config);
        }
      })
      .catch((error: unknown) => {
        const status = (error as { status?: number })?.status;
        if (!a.signal.aborted && current.current === connection)
          setError(
            t(
              status === 404 || status === 405 || status === 501
                ? 'proxy_ip.upgrade'
                : 'proxy_ip.failed'
            )
          );
      });
    const active = aborts.current;
    return () => {
      a.abort();
      active.forEach((a) => a.abort());
      active.clear();
    };
  }, [connection, t]);
  useEffect(() => {
    if (!supported) return;
    const a = new AbortController();
    void proxyIPApi
      .status(connection, offset, a.signal)
      .then((r) => {
        if (!a.signal.aborted && current.current === connection) setStatus(r);
      })
      .catch(() => {});
    return () => a.abort();
  }, [connection, supported, offset]);
  const save = () =>
    run(async (signal) => {
      if (!baseline || !validProxyIP(draft)) return;
      const patch = Object.fromEntries(
        Object.entries(draft).filter(([k, v]) => v !== baseline[k as keyof ProxyIPConfig])
      );
      await proxyIPApi.save(connection, patch, signal);
      if (!signal.aborted && current.current === connection) setBaseline(draft);
    });
  const reloadStatus = () =>
    run(async (signal) => {
      const r = await proxyIPApi.status(connection, offset, signal);
      if (!signal.aborted && current.current === connection) setStatus(r);
    });
  const lookup = (refresh: boolean) =>
    run(async (signal) => {
      const r = await proxyIPApi.preview(connection, index, refresh, signal);
      if (!signal.aborted && current.current === connection) setPreview(r);
    });
  const dirty = baseline !== null && JSON.stringify(baseline) !== JSON.stringify(draft);
  return (
    <section className={styles.panel} aria-label={t('proxy_ip.title')}>
      <h2>{t('proxy_ip.title')}</h2>
      <p>{t('proxy_ip.description')}</p>
      <p className="hint">{t('proxy_ip.migration')}</p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <fieldset disabled={!supported || busy} className={styles.fields}>
        {Object.entries(proxyIPDefaults).map(([key, value]) => (
          <label key={key}>
            {t(`proxy_ip.${key}`)}
            {key === 'refresh-mode' || key === 'cold-cache-mode' ? (
              <select
                className="input"
                value={String(draft[key])}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              >
                {(key === 'refresh-mode' ? ['lazy', 'scheduled'] : ['fallback', 'wait']).map(
                  (option) => (
                    <option key={option} value={option}>
                      {t(`proxy_ip.${option}`)}
                    </option>
                  )
                )}
              </select>
            ) : (
              <input
                className="input"
                type={typeof value === 'number' ? 'number' : 'text'}
                min={typeof value === 'number' ? 1 : undefined}
                value={draft[key as keyof ProxyIPConfig]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
      </fieldset>
      <p className="hint">{t('proxy_ip.refresh_hint')}</p>
      <p className="hint">{t('proxy_ip.cold_hint')}</p>
      {dirty && (
        <ul>
          {Object.entries(draft)
            .filter(([key, value]) => value !== baseline?.[key as keyof ProxyIPConfig])
            .map(([key, value]) => (
              <li key={key}>
                {t(`proxy_ip.${key}`)}: {String(baseline?.[key as keyof ProxyIPConfig])} →{' '}
                {String(value)}
              </li>
            ))}
        </ul>
      )}
      <Button
        disabled={!supported || busy || !dirty || !validProxyIP(draft)}
        onClick={() => void save()}
      >
        {t('common.save')}
      </Button>
      <h3>{t('proxy_ip.cache')}</h3>
      <p>
        {t('proxy_ip.counts', { routes: status?.route_count ?? 0, ips: status?.ip_count ?? 0 })}
      </p>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={!supported || busy}
          onClick={() => void reloadStatus()}
        >
          {t('common.refresh')}
        </Button>
        <Button
          variant="secondary"
          disabled={offset === 0 || busy}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          ←
        </Button>
        <Button
          variant="secondary"
          disabled={!status || offset + 50 >= status.route_count || busy}
          onClick={() => setOffset(offset + 50)}
        >
          →
        </Button>
      </div>
      <div className={styles.scroll}>
        <table>
          <thead>
            <tr>
              {['ip', 'timezone', 'language', 'cache_state', 'refresh_state', 'age', 'reason'].map(
                (k) => (
                  <th key={k}>{t(`proxy_ip.${k}`)}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {status?.entries.map((e) => (
              <tr key={e.route_id}>
                <td>{e.ip || '—'}</td>
                <td>{e.timezone || '—'}</td>
                <td>{e.suggested_language || '—'}</td>
                <td>{e.cache_state}</td>
                <td>{e.refresh_state}</td>
                <td>{e.cache_age_seconds}s</td>
                <td>
                  {e.reason || '—'}
                  {e.retry_after_seconds ? ` (${e.retry_after_seconds}s)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{t('proxy_ip.preview')}</h3>
      <label>
        {t('proxy_ip.auth_index')}
        <input className="input" value={index} onChange={(e) => setIndex(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <Button disabled={!supported || !index || busy} onClick={() => void lookup(false)}>
          {t('proxy_ip.preview')}
        </Button>
        <Button
          variant="secondary"
          disabled={!supported || !index || busy}
          onClick={() => void lookup(true)}
        >
          {t('proxy_ip.enqueue')}
        </Button>
      </div>
      {preview && <pre>{JSON.stringify(preview, null, 2)}</pre>}
    </section>
  );
}
