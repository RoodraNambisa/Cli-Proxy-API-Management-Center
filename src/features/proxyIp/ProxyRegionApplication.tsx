import { useTranslation } from 'react-i18next';
import type {
  ProxyRegionApplication as Application,
  ProxyRegionField,
} from '@/services/api/proxyIp';
import styles from './ProxyRegionStatus.module.scss';
export function ProxyRegionFieldStatus({
  field,
  authDisabled = false,
}: {
  field?: ProxyRegionField;
  authDisabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!field) return <span className={styles.hint}>{t('region_status.unavailable')}</span>;
  return (
    <div className={styles.fieldStatus}>
      <strong>
        {field.value ||
          t(
            ['disabled', 'preserved'].includes(field.state)
              ? 'region_status.preserve_value'
              : 'region_status.empty_value'
          )}
      </strong>
      {field.source && !['disabled', 'preserved'].includes(field.state) && (
        <span>{t(`region_status.sources.${field.source}`, { defaultValue: field.source })}</span>
      )}
      <span className={styles.badge} data-state={authDisabled ? 'disabled' : field.state}>
        {t(`region_status.states.${authDisabled ? 'credential_disabled' : field.state}`, {
          defaultValue: field.state,
        })}
      </span>
    </div>
  );
}
export function ProxyRegionApplicationDetails({ value }: { value?: Application }) {
  const { t } = useTranslation();
  if (!value) return <p className={styles.hint}>{t('region_status.unavailable')}</p>;
  return (
    <div className={styles.details}>
      <p className={styles.hint}>{t('region_status.preview_hint')}</p>
      <p className={styles.hint}>
        {t('region_status.evaluated_at')}: {new Date(value.evaluated_at).toLocaleString()}
      </p>
      <div className={styles.detailGrid}>
        {(['timezone', 'language'] as const).map((k) => (
          <section key={k}>
            <h4>{t(`region_status.${k}`)}</h4>
            <ProxyRegionFieldStatus field={value[k]} authDisabled={value.auth_disabled} />
            <dl>
              <dt>{t('region_status.proxy_candidate')}</dt>
              <dd>{value[k].proxy_value || '—'}</dd>
              <dt>{t('region_status.source')}</dt>
              <dd>
                {value[k].proxy_source
                  ? t(`region_status.sources.${value[k].proxy_source}`, {
                      defaultValue: value[k].proxy_source,
                    })
                  : '—'}
              </dd>
            </dl>
          </section>
        ))}
      </div>
      {value.reason && (
        <p className={styles.hint}>
          {t('proxy_ip.reason')}:{' '}
          {t(`chatgpt_web.browser_region.values.${value.reason}`, { defaultValue: value.reason })}
        </p>
      )}
      {value.scope && (
        <p className={styles.hint}>
          {t('region_status.scope')}: {value.scope}
        </p>
      )}
      <p className={styles.hint}>{t('region_status.actual_request_hint')}</p>
      <div className={styles.links}>
        <a href="#/config?section=config-chatgpt-web-browser-region">
          {t('region_status.web_settings')}
        </a>
        <a href="#/config?section=config-codex-time-context">{t('region_status.codex_settings')}</a>
      </div>
    </div>
  );
}
