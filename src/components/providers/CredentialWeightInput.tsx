import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { isValidCredentialWeight, MAX_CREDENTIAL_WEIGHT } from '@/utils/credentialWeight';

export function CredentialWeightInput({
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
      label={t('ai_providers.weight_label')}
      hint={t('ai_providers.weight_hint')}
      placeholder={t('ai_providers.weight_inherit')}
      type="number"
      min={0}
      max={MAX_CREDENTIAL_WEIGHT}
      step={1}
      value={value !== undefined && Number.isFinite(value) ? value : ''}
      error={isValidCredentialWeight(value) ? undefined : t('ai_providers.weight_invalid')}
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
