import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { RequestScopedErrorsEditor } from '@/components/providers/RequestScopedErrorsEditor';
import type { OAuthRequestScopedErrors } from '@/types/requestScopedErrors';
import { RUNTIME_PROVIDER_OPTIONS } from './runtimeProviderOptions';
import styles from './VisualConfigEditor.module.scss';

const channels = new Set(['vertex', 'aistudio', 'antigravity', 'claude', 'codex', 'kimi', 'xai']);

export function OAuthRequestScopedErrorsEditor({ value, onChange, disabled }: {
  value: OAuthRequestScopedErrors;
  onChange: (value: OAuthRequestScopedErrors) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const used = new Set(Object.keys(value).map((provider) => provider.trim().toLowerCase()));
  const options = RUNTIME_PROVIDER_OPTIONS.filter((provider) => channels.has(provider.value) && !used.has(provider.value));
  return (
    <div className={styles.blockStack}>
      {Object.entries(value).map(([provider, rules]) => (
        <div className={styles.ruleCard} key={provider}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>{provider}</div>
            <Button type="button" variant="ghost" size="sm" disabled={disabled}
              onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([key]) => key !== provider)))}
            >{t('request_scoped_errors.remove_provider')}</Button>
          </div>
          <RequestScopedErrorsEditor value={rules} disabled={disabled} onChange={(next) => onChange({ ...value, [provider]: next })} />
        </div>
      ))}
      {options.length > 0 && <Select value="" options={options} ariaLabel={t('request_scoped_errors.provider')}
        placeholder={t('request_scoped_errors.add_provider')} disabled={disabled}
        onChange={(provider) => onChange({ ...value, [provider]: [] })} />}
      {Object.keys(value).length === 0 && <div className="hint">{t('request_scoped_errors.empty')}</div>}
    </div>
  );
}
