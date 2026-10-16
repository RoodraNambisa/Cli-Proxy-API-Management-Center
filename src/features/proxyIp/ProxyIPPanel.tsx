import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyIPApi, type RegionSnapshot } from '@/services/api/proxyIp';
import { proxyIPDefaults, validProxyIP, type ProxyIPConfig } from './settings';
import styles from './ProxyIPPanel.module.scss';

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
      counts?: Record<string, number>;
    } | null>(null),
    [offset, setOffset] = useState(0);
  const [statusError, setStatusError] = useState(false);
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
    setStatusError(false);
    setPreview(null);
    setIndex('');
    setOffset(0);
    setError('');
    setBusy(false);
    void proxyIPApi
      .get(connection, a.signal)
      .then((r) => {
        if (!a.signal.aborted && current.current === connection) {
          if (
            !r.capabilities?.region_lifecycle ||
            !r.capabilities?.proxy_ip ||
            !r.config ||
            !validProxyIP(r.config)
          ) {
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
    setStatusError(false);
    void proxyIPApi
      .status(connection, offset, a.signal)
      .then((r) => {
        if (!a.signal.aborted && current.current === connection) setStatus(r);
      })
      .catch(() => {
        if (!a.signal.aborted && current.current === connection) setStatusError(true);
      });
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
      if (!signal.aborted && current.current === connection) {
        setStatus(r);
        setStatusError(false);
      }
    });
  const lookup = (refresh: boolean) =>
    run(async (signal) => {
      const r = await proxyIPApi.preview(connection, index, refresh, signal);
      if (!signal.aborted && current.current === connection) setPreview(r);
    });
  const dirty = baseline !== null && JSON.stringify(baseline) !== JSON.stringify(draft);
  const field = (key: keyof ProxyIPConfig) => (
    <label className={styles.field} key={key}>
      <span>
        {t(
          key === 'cold-cache-mode' && draft['refresh-mode'] === 'lazy'
            ? 'proxy_ip.lazy_initial'
            : `proxy_ip.${key}`
        )}
      </span>
      {key === 'refresh-mode' || key === 'cold-cache-mode' ? (
        <select
          className="input"
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        >
          {(key === 'refresh-mode' ? ['lazy', 'scheduled'] : ['fallback', 'wait']).map((option) => (
            <option key={option} value={option}>
              {t(
                key === 'cold-cache-mode' && draft['refresh-mode'] === 'lazy'
                  ? `proxy_ip.lazy_${option}`
                  : `proxy_ip.${option}`
              )}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={typeof proxyIPDefaults[key] === 'number' ? 'number' : 'text'}
          min={typeof proxyIPDefaults[key] === 'number' ? 1 : undefined}
          value={draft[key]}
          onChange={(e) =>
            setDraft({
              ...draft,
              [key]:
                typeof proxyIPDefaults[key] === 'number' ? Number(e.target.value) : e.target.value,
            })
          }
        />
      )}
    </label>
  );
  const formatTime = (value?: string) =>
    value && !value.startsWith('0001-') ? new Date(value).toLocaleString() : '—';
  const modeHint =
    draft['refresh-mode'] === 'scheduled'
      ? 'scheduled_hint'
      : draft['cold-cache-mode'] === 'wait'
        ? 'lazy_wait_hint'
        : 'lazy_fallback_hint';

  return (
    <section className={styles.panel} aria-label={t('proxy_ip.title')}>
      <header className={styles.header}>
        <h2>{t('proxy_ip.title')}</h2>
        <p>{t('proxy_ip.description')}</p>
      </header>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}

      <div className={styles.settings}>
        <fieldset disabled={!supported || busy} className={styles.section}>
          <legend>{t('proxy_ip.policy_section')}</legend>
          <div className={styles.fields}>
            {field('refresh-mode')}
            {field('cold-cache-mode')}
          </div>
          <p className={styles.hint}>{t(`proxy_ip.${modeHint}`)}</p>
          <p className={styles.hint}>{t('proxy_ip.cold_hint')}</p>
        </fieldset>

        <fieldset disabled={!supported || busy} className={styles.section}>
          <legend>{t('proxy_ip.lookup_section')}</legend>
          <div className={styles.fields}>
            <div className={styles.wide}>{field('lookup-url')}</div>
            {field('lookup-timeout-seconds')}
            {field('lookup-concurrency')}
            {field('ip-cache-ttl-seconds')}
            {field('ip-cache-size')}
          </div>
          <p className={styles.hint}>{t('proxy_ip.cache_hint')}</p>
        </fieldset>

        <details className={styles.advanced}>
          <summary>{t('proxy_ip.advanced_section')}</summary>
          <div className={styles.advancedContent}>
            <fieldset disabled={!supported || busy} className={styles.section}>
              <legend>{t('proxy_ip.batch_section')}</legend>
              <div className={styles.fields}>
                {field('refresh-batch-size')}
                {field('refresh-interval-seconds')}
              </div>
            </fieldset>
            <fieldset disabled={!supported || busy} className={styles.section}>
              <legend>{t('proxy_ip.route_section')}</legend>
              <p className={styles.sectionDescription}>{t('proxy_ip.route_hint')}</p>
              <div className={styles.fields}>
                {field('temporary-route-check-interval-seconds')}
                {field('temporary-route-cache-size')}
              </div>
            </fieldset>
            <p className={styles.hint}>{t('proxy_ip.migration')}</p>
          </div>
        </details>

        <div className={styles.saveBar}>
          {dirty && (
            <ul className={styles.changes}>
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
            type="button"
            disabled={!supported || busy || !dirty || !validProxyIP(draft)}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

      <section className={styles.statusSection} aria-label={t('proxy_ip.cache')}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>{t('proxy_ip.cache')}</h3>
            <p className={styles.hint}>
              {t('proxy_ip.counts', {
                routes: status?.route_count ?? '—',
                ips: status?.ip_count ?? '—',
              })}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!supported || busy}
            onClick={() => void reloadStatus()}
          >
            {t('common.refresh')}
          </Button>
        </div>
        <dl className={styles.stats}>
          {['active_ips', 'idle_ips', 'pending', 'running'].map((key) => (
            <div key={key}>
              <dt>{t(`proxy_ip.stat_${key}`)}</dt>
              <dd>{status ? (status.counts?.[key] ?? '—').toLocaleString() : '—'}</dd>
            </div>
          ))}
        </dl>
        {statusError && (
          <p role="alert" className="error-box">
            {t('proxy_ip.status_failed')}
          </p>
        )}
        {status?.entries.length ? (
          <>
            <div
              className={styles.scroll}
              tabIndex={0}
              role="region"
              aria-label={t('proxy_ip.cache')}
            >
              <table>
                <thead>
                  <tr>
                    {[
                      'ip',
                      'region_details',
                      'cache_state',
                      'refresh_state',
                      'recent_activity',
                      'next_retry',
                    ].map((key) => (
                      <th key={key} scope="col">
                        {t(`proxy_ip.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.entries.map((e) => (
                    <tr key={e.route_id}>
                      <td className={styles.ip}>{e.ip || '—'}</td>
                      <td>
                        <span>{e.timezone || '—'}</span>
                        <span className={styles.secondary}>{e.suggested_language || '—'}</span>
                      </td>
                      <td>
                        <span>{e.cache_state}</span>
                        <span className={styles.secondary}>
                          {t('proxy_ip.age')}: {e.cache_age_seconds}s
                        </span>
                      </td>
                      <td className={styles.reason}>
                        <span>{e.refresh_state}</span>
                        {e.reason && <span className={styles.secondary}>{e.reason}</span>}
                      </td>
                      <td>
                        <span className={styles.secondary}>
                          {t('proxy_ip.last_success')}: {formatTime(e.detected_at)}
                        </span>
                        <span className={styles.secondary}>
                          {t('proxy_ip.last_failure')}: {formatTime(e.last_failure)}
                        </span>
                      </td>
                      <td>
                        <span>{formatTime(e.next_retry)}</span>
                        {!!e.retry_after_seconds && (
                          <span className={styles.secondary}>{e.retry_after_seconds}s</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : status && !statusError ? (
          <EmptyState title={t('proxy_ip.empty_title')} description={t('proxy_ip.empty_hint')} />
        ) : !statusError && supported ? (
          <p className={styles.hint} role="status">
            {t('common.loading')}
          </p>
        ) : null}
        {status && (offset > 0 || status.route_count > 50) && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              {t('proxy_ip.previous_page')}
            </Button>
            <span>
              {status.entries.length ? offset + 1 : 0}–
              {status.entries.length
                ? Math.min(offset + status.entries.length, status.route_count)
                : 0}{' '}
              / {status.route_count}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset + 50 >= status.route_count || busy}
              onClick={() => setOffset(offset + 50)}
            >
              {t('proxy_ip.next_page')}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.previewSection} aria-label={t('proxy_ip.preview_section')}>
        <h3>{t('proxy_ip.preview_section')}</h3>
        <p className={styles.hint}>{t('proxy_ip.preview_hint')}</p>
        <div className={styles.previewForm}>
          <Input
            label={t('proxy_ip.auth_index')}
            value={index}
            onChange={(e) => setIndex(e.target.value)}
          />
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
        </div>
        {preview && <pre className={styles.previewResult}>{JSON.stringify(preview, null, 2)}</pre>}
      </section>
    </section>
  );
}
