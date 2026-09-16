import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { RequestScopedErrorsEditor } from '@/components/providers/RequestScopedErrorsEditor';
import type { OAuthRequestScopedErrors } from '@/types/requestScopedErrors';
import { OAUTH_PROVIDER_OPTIONS } from '@/utils/providers';
import { ConfigTable, ConfigTableRow } from './ConfigTable';
import { validateRequestScopedErrorRule } from '@/utils/requestScopedErrors';
import styles from './VisualConfigEditor.module.scss';

export function OAuthRequestScopedErrorsEditor({ value, onChange, disabled }: {
  value: OAuthRequestScopedErrors;
  onChange: (value: OAuthRequestScopedErrors) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const used = new Set(Object.keys(value).map((provider) => provider.trim().toLowerCase()));
  const options = OAUTH_PROVIDER_OPTIONS.filter((provider) => !used.has(provider.value));
  return (
    <div className={styles.blockStack}>
      {Object.keys(value).length > 0 && <ConfigTable label={`${t('request_scoped_errors.provider')} · ${t('request_scoped_errors.title')}`} columns={[
        t('request_scoped_errors.provider'), t('config_management.visual.common.rule_column'), t('config_management.visual.common.actions'),
      ]}>
      {Object.entries(value).map(([provider, rules]) => (
        <ConfigTableRow key={provider} title={provider} initialExpanded={rules.length === 0}
          invalid={rules.some((rule) => Boolean(validateRequestScopedErrorRule(rule)))}
          labels={[t('request_scoped_errors.provider'), t('config_management.visual.common.rule_column')]}
          cells={[<strong>{provider}</strong>, t('config_management.settings_center.rules_summary', { count: rules.length })]}
          actions={<Button type="button" variant="ghost" size="sm" disabled={disabled}
              onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([key]) => key !== provider)))}
            >{t('request_scoped_errors.remove_provider')}</Button>}
        >
          <RequestScopedErrorsEditor value={rules} disabled={disabled} onChange={(next) => onChange({ ...value, [provider]: next })} />
        </ConfigTableRow>
      ))}
      </ConfigTable>}
      {options.length > 0 && <Select value="" options={options} ariaLabel={t('request_scoped_errors.provider')}
        placeholder={t('request_scoped_errors.add_provider')} disabled={disabled}
        onChange={(provider) => onChange({ ...value, [provider]: [] })} />}
      {Object.keys(value).length === 0 && <div className="hint">{t('request_scoped_errors.empty')}</div>}
    </div>
  );
}
