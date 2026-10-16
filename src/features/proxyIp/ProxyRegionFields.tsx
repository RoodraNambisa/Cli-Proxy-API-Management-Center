import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyIPApi } from '@/services/api/proxyIp';
import { Button } from '@/components/ui/Button';
import { validTimezone } from './settings';

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
}: {
  value?: ProxyRegion;
  onChange: (value: ProxyRegion) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset disabled={disabled}>
      <legend>{t('proxy_ip.manual_region')}</legend>
      <p className="hint">{t('proxy_ip.manual_hint')}</p>
      {(['timezone', 'language'] as const).map((key) => (
        <label key={key}>
          {t(`proxy_ip.manual_${key}`)}
          <input
            className="input"
            value={value[key] ?? ''}
            placeholder={key === 'timezone' ? 'Asia/Tokyo' : 'ja-JP'}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
      {!validProxyRegion(value) && <p role="alert">{t('proxy_ip.manual_invalid')}</p>}
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
    [error, setError] = useState('');
  useEffect(() => {
    const a = new AbortController();
    setSupported(false);
    setValue({});
    setBase({});
    setError('');
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
      if (current.current === connection) setBase(value);
    } catch (e) {
      if (current.current === connection) setError((e as Error).message);
    } finally {
      if (current.current === connection) setBusy(false);
    }
  };
  return (
    <section>
      <ProxyRegionFields
        value={value}
        onChange={setValue}
        disabled={disabled || !supported || busy}
      />
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={
          disabled ||
          !supported ||
          busy ||
          !validProxyRegion(value) ||
          JSON.stringify(base) === JSON.stringify(value)
        }
        onClick={() => void save()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
