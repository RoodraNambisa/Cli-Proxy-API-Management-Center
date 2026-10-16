import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyIPApi } from '@/services/api/proxyIp';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { validTimezone } from './settings';
import styles from './ProxyRegionFields.module.scss';

export type ProxyRegion = { timezone?: string; language?: string };
export function readProxyRegion(raw: string): ProxyRegion {
  try {
    return JSON.parse(raw || '{}') as ProxyRegion;
  } catch {
    return {};
  }
}
export function validProxyRegion(value: ProxyRegion) {
  if (value.timezone && !validTimezone(value.timezone)) return false;
  try {
    if (value.language) Intl.getCanonicalLocales(value.language);
  } catch {
    return false;
  }
  return true;
}
export function useProxyRegionCapability() {
  const key = useAuthStore((s) =>
    JSON.stringify([s.apiBase, s.managementAccessPath, s.connectionGeneration])
  );
  const connection = useMemo(() => apiClient.captureConnection(), [key]);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setSupported(false);
    void proxyIPApi
      .get(connection, abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) setSupported(r.capabilities?.proxy_region === true);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [connection]);
  return supported;
}
export function ProxyRegionFields({
  value = {},
  onChange,
  disabled = false,
  scope = 'proxy',
}: {
  value?: ProxyRegion;
  onChange: (value: ProxyRegion) => void;
  disabled?: boolean;
  scope?: 'proxy' | 'pool' | 'entry';
}) {
  const { t } = useTranslation();
  return (
    <fieldset disabled={disabled} className={styles.fields}>
      <legend>
        {t(scope === 'proxy' ? 'proxy_ip.manual_region' : `proxy_ip.manual_${scope}`)}
      </legend>
      <p className={styles.hint}>
        {t(scope === 'proxy' ? 'proxy_ip.manual_hint' : `proxy_ip.manual_${scope}_hint`)}
      </p>
      <div className={styles.grid}>
        {(['timezone', 'language'] as const).map((key) => (
          <Input
            key={key}
            label={t(`proxy_ip.manual_${key}`)}
            value={value[key] ?? ''}
            placeholder={key === 'timezone' ? 'Asia/Tokyo' : 'ja-JP'}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            spellCheck={false}
          />
        ))}
      </div>
      {!validProxyRegion(value) && (
        <p className={styles.error} role="alert">
          {t('proxy_ip.manual_invalid')}
        </p>
      )}
    </fieldset>
  );
}
export function GlobalProxyRegionEditor({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const key = useAuthStore((s) =>
    JSON.stringify([s.apiBase, s.managementAccessPath, s.connectionGeneration])
  );
  const connection = useMemo(() => apiClient.captureConnection(), [key]);
  const current = useRef(connection);
  current.current = connection;
  const [value, setValue] = useState<ProxyRegion>({}),
    [base, setBase] = useState<ProxyRegion>({}),
    [supported, setSupported] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    const a = new AbortController();
    setSupported(false);
    setValue({});
    setBase({});
    setError('');
    setSaved(false);
    setBusy(false);
    void proxyIPApi
      .get(connection, a.signal)
      .then((r) => {
        if (!a.signal.aborted) {
          setSupported(r.capabilities?.proxy_region === true);
          setValue(r.proxy_region ?? {});
          setBase(r.proxy_region ?? {});
        }
      })
      .catch(() => {});
    return () => a.abort();
  }, [connection]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.patchAtConnection(connection, '/proxy-ip', { 'proxy-region': value });
      if (current.current === connection) {
        setBase(value);
        setSaved(true);
      }
    } catch (e) {
      if (current.current === connection) setError((e as Error).message);
    } finally {
      if (current.current === connection) setBusy(false);
    }
  };
  return (
    <section className={styles.editor}>
      <ProxyRegionFields
        value={value}
        onChange={(next) => {
          setValue(next);
          setSaved(false);
        }}
        disabled={disabled || !supported || busy}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.footer}>
        <p className={styles.hint} role={saved ? 'status' : undefined}>
          {t(saved ? 'region_status.saved' : 'proxy_ip.manual_save_hint')}
        </p>
        <Button
          type="button"
          size="sm"
          loading={busy}
          disabled={
            disabled ||
            !supported ||
            busy ||
            !validProxyRegion(value) ||
            JSON.stringify(base) === JSON.stringify(value)
          }
          onClick={() => void save()}
        >
          {t('proxy_ip.manual_save')}
        </Button>
      </div>
    </section>
  );
}
