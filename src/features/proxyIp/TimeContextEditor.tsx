import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SettingsDisclosure } from '@/components/config/SettingsDisclosure';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { proxyIPApi } from '@/services/api/proxyIp';
import type { TimeContext } from './settings';
import { validTimeContext } from './settings';
import styles from './RegionSettings.module.scss';
export function TimeContextFields({
  value,
  onChange,
  disabled,
  credential = false,
}: {
  value: TimeContext;
  onChange: (value: TimeContext) => void;
  disabled?: boolean;
  credential?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className={styles.fields} disabled={disabled}>
      {!credential && (
        <ToggleSwitch
          label={t('time_context.enabled')}
          checked={value.enabled}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
      )}
      <label>
        {t('time_context.mode')}
        <select
          className="input"
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as TimeContext['mode'] })}
        >
          {(credential ? ['inherit', 'off', 'proxy', 'manual'] : ['proxy', 'manual']).map(
            (mode) => (
              <option key={mode} value={mode}>
                {t(`time_context.${mode}`)}
              </option>
            )
          )}
        </select>
      </label>
      {value.mode === 'manual' && (
        <label>
          {t('time_context.timezone')}
          <input
            className="input"
            value={value.timezone}
            onChange={(e) => onChange({ ...value, timezone: e.target.value })}
            placeholder="Asia/Tokyo"
          />
        </label>
      )}
      {value.mode === 'proxy' && (
        <>
          <label>
            {t('time_context.lookup-failure')}
            <select
              className="input"
              value={value['lookup-failure']}
              onChange={(e) =>
                onChange({
                  ...value,
                  'lookup-failure': e.target.value as TimeContext['lookup-failure'],
                })
              }
            >
              <option value="preserve">{t('time_context.preserve')}</option>
              <option value="fallback">{t('time_context.fallback')}</option>
            </select>
          </label>
          {value['lookup-failure'] === 'fallback' && (
            <label>
              {t('time_context.fallback-timezone')}
              <input
                className="input"
                value={value['fallback-timezone']}
                onChange={(e) => onChange({ ...value, 'fallback-timezone': e.target.value })}
              />
            </label>
          )}
        </>
      )}
    </fieldset>
  );
}
export function TimeContextEditor({
  value,
  onChange,
  disabled,
  dirty,
  focusTarget,
}: {
  value: TimeContext;
  onChange: (value: TimeContext) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
}) {
  const { t } = useTranslation();
  const key = useAuthStore((s) =>
    JSON.stringify([s.apiBase, s.managementAccessPath, s.connectionGeneration, s.connectionStatus])
  );
  const connection = useMemo(() => apiClient.captureConnection(), [key]);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(false);
    const a = new AbortController();
    void proxyIPApi
      .timeContext(connection, a.signal)
      .then((r) => {
        if (!a.signal.aborted) setSupported(r.capabilities.codex_time_context === true);
      })
      .catch(() => {});
    return () => a.abort();
  }, [connection]);
  return (
    <SettingsDisclosure
      id="config-codex-time-context"
      title={t('time_context.title')}
      description={t('time_context.description')}
      summary={t(value.enabled ? 'common.enabled' : 'common.disabled')}
      dirty={dirty}
      focusTarget={focusTarget}
      errorCount={validTimeContext(value) ? 0 : 1}
    >
      {!supported && <p role="status">{t('proxy_ip.upgrade')}</p>}
      <TimeContextFields value={value} onChange={onChange} disabled={disabled || !supported} />
      {!validTimeContext(value) && <p role="alert">{t('time_context.invalid')}</p>}
      <p className="hint">{t('time_context.hint')}</p>
      <Link to="/proxy-pools">{t('proxy_ip.shared_link')}</Link>
    </SettingsDisclosure>
  );
}
