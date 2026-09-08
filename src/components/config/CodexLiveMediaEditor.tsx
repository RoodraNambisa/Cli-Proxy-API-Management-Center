import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { CodexLiveMediaVisualConfig, CodexLiveICEVisualEntry } from '@/types/codexLiveMedia';
import { makeClientId } from '@/types/visualConfig';
import { codexLiveMediaErrors } from '@/utils/codexLiveMedia';
import styles from './VisualConfigEditor.module.scss';

export function CodexLiveMediaEditor({ value, onChange, disabled }: {
  value: CodexLiveMediaVisualConfig;
  onChange: (value: CodexLiveMediaVisualConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const text = (key: string) => t(`config_management.visual.sections.codex_media.${key}`);
  const errors = codexLiveMediaErrors(value);
  const error = (field: string) => {
    const code = errors[`codexLiveMediaRelay.${field}`];
    return code ? t(`config_management.visual.validation.${code}`) : undefined;
  };
  const patch = (changes: Partial<CodexLiveMediaVisualConfig>) => onChange({ ...value, ...changes });
  const updateServer = (index: number, changes: Partial<CodexLiveICEVisualEntry>) =>
    patch({ iceServers: value.iceServers.map((server, i) => i === index ? { ...server, ...changes } : server) });

  return (
    <div className={styles.blockStack}>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <div className={styles.toggleTitle}>{text('enabled')}</div>
          <div className={styles.toggleDescription}>{text('enabled_desc')}</div>
        </div>
        <ToggleSwitch checked={value.enabled} disabled={disabled} ariaLabel={text('enabled')}
          onChange={(enabled) => patch({ enabled })} />
      </div>
      <div className={styles.sectionGrid}>
        <Input label={text('max_sessions')} hint={text('max_sessions_hint')} type="number" min={0} max={2147483647} step={1}
          value={value.maxSessions} disabled={disabled} error={error('maxSessions')}
          onChange={(event) => patch({ maxSessions: event.target.value })} />
        <Input label={text('public_ip')} hint={text('public_ip_hint')} value={value.publicIp} disabled={disabled}
          error={error('publicIp')} onChange={(event) => patch({ publicIp: event.target.value })} />
        <Input label={text('udp_min')} hint={text('ports_hint')} type="number" min={0} max={65535} step={1}
          value={value.udpPortMin} disabled={disabled} error={error('udpPortMin')}
          onChange={(event) => patch({ udpPortMin: event.target.value })} />
        <Input label={text('udp_max')} type="number" min={0} max={65535} step={1}
          value={value.udpPortMax} disabled={disabled} error={error('udpPortMax')}
          onChange={(event) => patch({ udpPortMax: event.target.value })} />
      </div>
      <div className={styles.toggleRow}>
        <div className={styles.toggleCopy}>
          <div className={styles.toggleTitle}>{text('disable_private')}</div>
          <div className={styles.toggleDescription}>{text('disable_private_desc')}</div>
        </div>
        <ToggleSwitch checked={value.disablePrivateRemoteIps} disabled={disabled} ariaLabel={text('disable_private')}
          onChange={(disablePrivateRemoteIps) => patch({ disablePrivateRemoteIps })} />
      </div>
      <div className="hint">{text('ice_hint')}</div>
      {value.iceServers.map((server, index) => {
        const urlsId = `${id}-${server.id}`;
        const urlError = error(`iceServers.${server.id}.urls`);
        return (
          <div className={styles.ruleCard} key={server.id}>
            <div className={styles.ruleCardHeader}>
              <div className={styles.ruleCardTitle}>{text('ice_server')} {index + 1}</div>
              <Button type="button" variant="ghost" size="sm" disabled={disabled}
                aria-label={`${text('remove_ice')} ${index + 1}`}
                onClick={() => patch({ iceServers: value.iceServers.filter((_, i) => i !== index) })}
              >{text('remove_ice')}</Button>
            </div>
            <div className="form-group">
              <label htmlFor={urlsId}>{text('ice_urls')}</label>
              <textarea id={urlsId} className="input" rows={2} value={server.urls} disabled={disabled}
                aria-invalid={Boolean(urlError)} aria-describedby={urlError ? `${urlsId}-error` : undefined}
                onChange={(event) => updateServer(index, { urls: event.target.value })} />
              {urlError && <div className="error-box" id={`${urlsId}-error`}>{urlError}</div>}
            </div>
            <div className={styles.sectionGrid}>
              <Input label={text('ice_username')} autoComplete="off" value={server.username} disabled={disabled}
                onChange={(event) => updateServer(index, { username: event.target.value })} />
              <Input label={text('ice_credential')} hint={text('secret_hint')} type="password" autoComplete="off"
                value={server.credential} disabled={disabled} error={error(`iceServers.${server.id}.credential`)}
                onChange={(event) => updateServer(index, { credential: event.target.value })} />
            </div>
          </div>
        );
      })}
      <Button type="button" variant="secondary" size="sm" disabled={disabled}
        onClick={() => patch({ iceServers: [...value.iceServers, { id: makeClientId(), urls: '', username: '', credential: '' }] })}
      >{text('add_ice')}</Button>
    </div>
  );
}
