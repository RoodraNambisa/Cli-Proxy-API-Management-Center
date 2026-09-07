import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import {
  isValidCredentialRequestRetry,
  MAX_CREDENTIAL_REQUEST_RETRY,
} from '@/utils/credentialRequestRetry';

export function CredentialRequestRetryInput({
  value,
  onChange,
  disabled,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Input
      label={t('ai_providers.request_retry_label')}
      hint={t('ai_providers.request_retry_hint')}
      placeholder={t('ai_providers.request_retry_inherit')}
      type="number"
      min={0}
      max={MAX_CREDENTIAL_REQUEST_RETRY}
      step={1}
      value={value !== undefined && Number.isFinite(value) ? value : ''}
      error={
        isValidCredentialRequestRetry(value) ? undefined : t('ai_providers.request_retry_invalid')
      }
      disabled={disabled}
      onChange={(event) =>
        onChange(
          event.currentTarget.validity.badInput
            ? NaN
            : event.currentTarget.value.trim() === ''
              ? undefined
              : Number(event.currentTarget.value)
        )
      }
    />
  );
}
