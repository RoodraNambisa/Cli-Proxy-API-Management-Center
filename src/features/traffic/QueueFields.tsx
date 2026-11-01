import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
  const labelId = useId();
  const queue = value ?? emptyQueue();
  return (
    <div className={styles.queueFields}>
      {inherit && (
        <div className="form-group">
          <label id={labelId}>{t('traffic.queue_policy')}</label>
          <Select
            ariaLabelledBy={labelId}
            value={value === undefined ? 'inherit' : queue.enabled ? 'on' : 'off'}
            disabled={disabled}
            options={[
              { value: 'inherit', label: t('traffic.inherit') },
              { value: 'off', label: t('traffic.no_queue') },
              { value: 'on', label: t('traffic.queue_on') },
            ]}
            onChange={(selected) =>
              onChange(
                selected === 'inherit'
                  ? undefined
                  : { ...queue, enabled: selected === 'on' }
              )
            }
          />
        </div>
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
