import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Input } from '@/components/ui/Input';
import { emptyQueue, type QueueSettings } from './types';
import styles from './Traffic.module.scss';
export function QueueFields({
  value,
  onChange,
  disabled = false,
  inherit = false,
}: {
  value?: QueueSettings;
  onChange: (queue: QueueSettings | undefined) => void;
  disabled?: boolean;
  inherit?: boolean;
}) {
  const { t } = useTranslation();
  const queue = value ?? emptyQueue();
  return (
    <div className={styles.queueFields}>
      {inherit && (
        <label>
          {t('traffic.queue_policy')}
          <select
            className="input"
            value={value === undefined ? 'inherit' : queue.enabled ? 'on' : 'off'}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.value === 'inherit'
                  ? undefined
                  : { ...queue, enabled: e.target.value === 'on' }
              )
            }
          >
            <option value="inherit">{t('traffic.inherit')}</option>
            <option value="off">{t('traffic.no_queue')}</option>
            <option value="on">{t('traffic.queue_on')}</option>
          </select>
        </label>
      )}
      {!inherit && (
        <ToggleSwitch
          label={t('traffic.queue_on')}
          checked={queue.enabled}
          disabled={disabled}
          onChange={(enabled) => onChange({ ...queue, enabled })}
        />
      )}
      {queue.enabled && (
        <div className={styles.fields}>
          <Input
            label={t('traffic.max_waiting')}
            type="number"
            min={0}
            value={queue['max-waiting'] || ''}
            placeholder={t('traffic.process_bound')}
            disabled={disabled}
            onChange={(e) => onChange({ ...queue, 'max-waiting': Number(e.target.value) })}
          />
          <Input
            label={t('traffic.wait_seconds')}
            type="number"
            min={0}
            max={86400}
            value={queue['wait-timeout-seconds'] || ''}
            placeholder={t('traffic.no_timeout')}
            disabled={disabled}
            onChange={(e) => onChange({ ...queue, 'wait-timeout-seconds': Number(e.target.value) })}
          />
        </div>
      )}
      <div className="hint">{t('traffic.queue_hint')}</div>
    </div>
  );
}
