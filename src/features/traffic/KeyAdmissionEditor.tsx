import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ClientApiKeyGroup } from '@/types/config';
import { apiKeysApi } from '@/services/api/apiKeys';
import { emptyQueue } from './types';
import { QueueFields } from './QueueFields';
import styles from './Traffic.module.scss';
export function KeyAdmissionEditor({
  apiKey,
  value,
  disabled,
  onSaved,
}: {
  apiKey: string;
  value?: ClientApiKeyGroup;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [concurrencyLimit, setConcurrency] = useState(value?.concurrencyLimit ?? 0);
  const [rpmLimit, setRPM] = useState(value?.rpmLimit ?? 0);
  const [queue, setQueue] = useState(value?.queue ?? emptyQueue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty =
    concurrencyLimit !== (value?.concurrencyLimit ?? 0) ||
    rpmLimit !== (value?.rpmLimit ?? 0) ||
    JSON.stringify(queue) !== JSON.stringify(value?.queue ?? emptyQueue());
  const valid =
    [concurrencyLimit, rpmLimit, queue['max-waiting'], queue['wait-timeout-seconds']].every(
      (n) => Number.isSafeInteger(n) && n >= 0
    ) && queue['wait-timeout-seconds'] <= 86400;
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiKeysApi.updateAdmission(apiKey, { concurrencyLimit, rpmLimit, queue });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={styles.editor}>
      <strong>{t('traffic.key_limits')}</strong>
      <div className={styles.fields}>
        <Input
          type="number"
          min={0}
          label={t('traffic.concurrency_limit')}
          value={concurrencyLimit}
          disabled={disabled || saving}
          onChange={(e) => setConcurrency(Number(e.target.value))}
        />
        <Input
          type="number"
          min={0}
          label={t('traffic.key_rpm')}
          value={rpmLimit}
          disabled={disabled || saving}
          onChange={(e) => setRPM(Number(e.target.value))}
        />
      </div>
      <div className="hint">
        {t('traffic.zero_unlimited')} · {t('traffic.key_active_hint')}
      </div>
      <QueueFields
        value={queue}
        disabled={disabled || saving}
        onChange={(next) => setQueue(next ?? emptyQueue())}
      />
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div>
        <Button
          size="sm"
          loading={saving}
          disabled={disabled || !dirty || !valid}
          onClick={() => void save()}
        >
          {t('traffic.save_limits')}
        </Button>
      </div>
    </div>
  );
}
