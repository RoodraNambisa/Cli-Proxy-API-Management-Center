import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { apiClient } from '@/services/api/client';
import { supportsImageAggregation } from '../imageAggregation';

type Status = 'supported' | 'unsupported' | 'error';
export function ChatGptWebImageAggregation({
  value,
  error,
  onChange,
  connectionKey,
  active,
  disabled,
  enabled,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  connectionKey: string;
  active: boolean;
  disabled?: boolean;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const scope = useMemo(() => ({ connectionKey, active }), [connectionKey, active]);
  const [result, setResult] = useState<{ scope: typeof scope; status: Status } | null>(null);
  useEffect(() => {
    if (!scope.active) return;
    const controller = new AbortController();
    void supportsImageAggregation(apiClient.captureConnection(), controller.signal).then(
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
  return (
    <Input
      id="config-chatgpt-web-n-aggregation-concurrency"
      type="number"
      min={1}
      max={10}
      step={1}
      label={t('chatgpt_web.n_aggregation.title')}
      hint={t(
        `chatgpt_web.n_aggregation.${status === 'supported' ? (enabled ? 'hint' : 'inactive') : status}`
      )}
      value={value}
      error={error}
      disabled={disabled || status !== 'supported'}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
