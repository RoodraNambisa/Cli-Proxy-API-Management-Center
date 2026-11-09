import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { apiClient } from '@/services/api/client';
import { supportsImageRefill } from '../imageRefill';

type Status = 'supported' | 'unsupported' | 'error';
export function ChatGptWebImageRefill({
  retries,
  partial,
  onRetriesChange,
  onPartialChange,
  connectionKey,
  active,
  disabled,
  error,
}: {
  retries: string;
  partial: boolean;
  onRetriesChange: (value: string) => void;
  onPartialChange: (value: boolean) => void;
  connectionKey: string;
  active: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const scope = useMemo(() => ({ connectionKey, active }), [connectionKey, active]);
  const [result, setResult] = useState<{ scope: typeof scope; status: Status } | null>(null);
  useEffect(() => {
    if (!scope.active) return;
    const controller = new AbortController();
    void supportsImageRefill(apiClient.captureConnection(), controller.signal).then(
      (supported) => {
        if (!controller.signal.aborted)
          setResult({ scope, status: supported ? 'supported' : 'unsupported' });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            scope,
            status: [404, 405, 501].includes((error as { status?: number }).status ?? 0)
              ? 'unsupported'
              : 'error',
          });
      }
    );
    return () => controller.abort();
  }, [scope]);
  const status = active && result?.scope === scope ? result.status : 'loading';
  const blocked = disabled || status !== 'supported';
  return (
    <>
      <Input
        id="config-chatgpt-web-n-aggregation-max-retries"
        type="number"
        min={0}
        max={3}
        step={1}
        label={t('chatgpt_web.image_refill.retries')}
        value={retries}
        error={error}
        disabled={blocked}
        hint={t(`chatgpt_web.image_refill.${status === 'supported' ? 'retry_hint' : status}`)}
        onChange={(event) => onRetriesChange(event.target.value)}
      />
      <div id="config-chatgpt-web-n-aggregation-return-partial">
        <ToggleSwitch
          checked={partial}
          disabled={blocked}
          onChange={onPartialChange}
          label={t('chatgpt_web.image_refill.partial')}
          ariaLabel={t('chatgpt_web.image_refill.partial')}
        />
        <p className="hint">{t('chatgpt_web.image_refill.partial_hint')}</p>
      </div>
    </>
  );
}
