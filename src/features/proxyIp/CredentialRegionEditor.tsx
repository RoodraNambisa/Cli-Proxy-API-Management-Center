import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';
import { proxyIPApi } from '@/services/api/proxyIp';
import { TimeContextFields } from './TimeContextEditor';
import { readTimeContext } from './settings';
import styles from './RegionSettings.module.scss';
export function CredentialRegionEditor({
  codex,
  value,
  onChange,
  disabled,
  connection,
}: {
  codex: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  connection?: ApiClientConnectionSnapshot;
}) {
  const { t } = useTranslation();
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setSupported(false);
    void proxyIPApi
      .get(connection ?? apiClient.captureConnection(), abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) setSupported(r.capabilities.credential_region === true);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [connection]);
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(value || '{}');
  } catch {
    /* Invalid raw source is handled by the parent editor. */
  }
  const update = (key: string, newValue: unknown) => {
    const next = { ...raw };
    if (newValue === undefined) delete next[key];
    else next[key] = newValue;
    onChange(JSON.stringify(next));
  };
  return (
    <section className={styles.credential}>
      <h3>{t('time_context.credential')}</h3>
      {!supported && <p>{t('proxy_ip.upgrade')}</p>}
      {codex ? (
        <TimeContextFields
          value={readTimeContext({ mode: 'inherit', ...raw })}
          credential
          disabled={disabled || !supported}
          onChange={(next) =>
            onChange(
              JSON.stringify({ ...next, enabled: next.mode === 'manual' || next.mode === 'proxy' })
            )
          }
        />
      ) : (
        <fieldset className={styles.fields} disabled={disabled || !supported}>
          {(['auto-timezone', 'auto-language'] as const).map((key) => (
            <label key={key}>
              {t(
                key === 'auto-timezone' ? 'time_context.web_timezone' : 'time_context.web_language'
              )}
              <select
                className="input"
                value={raw[key] === undefined ? 'inherit' : String(raw[key])}
                onChange={(e) =>
                  update(key, e.target.value === 'inherit' ? undefined : e.target.value === 'true')
                }
              >
                <option value="inherit">{t('time_context.inherit')}</option>
                <option value="true">{t('common.enabled')}</option>
                <option value="false">{t('common.disabled')}</option>
              </select>
            </label>
          ))}
          {(['timezone', 'language'] as const).map((key) => (
            <label key={key}>
              {t(
                key === 'timezone'
                  ? 'time_context.web_manual_timezone'
                  : 'time_context.web_manual_language'
              )}
              <input
                className="input"
                value={String(raw[key] ?? '')}
                onChange={(e) => update(key, e.target.value || undefined)}
              />
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
