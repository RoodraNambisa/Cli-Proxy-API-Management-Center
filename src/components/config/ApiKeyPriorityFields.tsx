import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { API_KEY_PRIORITY_LIMIT } from '@/utils/apiKeyGroups';
import styles from './VisualConfigEditor.module.scss';

export type ApiKeyPriorityField = 'allowedPriorities' | 'excludedPriorities';

type Props = {
  options: number[];
  allowedPriorities?: number[];
  excludedPriorities?: number[];
  disabled?: boolean;
  onChange: (field: ApiKeyPriorityField, values: number[]) => Promise<boolean>;
};

function PriorityList({ field, selected, options, disabled, onChange }: Props & { field: ApiKeyPriorityField; selected: number[] }) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const name = field === 'allowedPriorities' ? 'priority_allowed' : 'priority_excluded';
  const title = t(`config_management.visual.api_keys.${name}`);
  const toggle = (priority: number, checked: boolean) => onChange(
    field,
    checked ? [...new Set([...selected, priority])] : selected.filter((value) => value !== priority)
  );
  const add = async () => {
    const value = Number(draft);
    if (!draft.trim() || !Number.isSafeInteger(value)) {
      setInvalid(true);
      return;
    }
    if (await toggle(value, true)) {
      setDraft('');
      setInvalid(false);
    }
  };
  return (
    <fieldset className={styles.apiKeyPriorityList} disabled={disabled}>
      <legend>{title}</legend>
      <div className={styles.apiKeyProviderOptions}>
        {options.map((priority) => (
          <SelectionCheckbox
            key={priority}
            checked={selected.includes(priority)}
            disabled={disabled}
            label={String(priority)}
            ariaLabel={`${title}: ${priority}`}
            onChange={(checked) => void toggle(priority, checked)}
          />
        ))}
      </div>
      <label htmlFor={id} className="hint">{t('config_management.visual.api_keys.priority_custom')}</label>
      <div className={styles.apiKeyPriorityAdd}>
        <input
          id={id}
          className="input"
          type="number"
          min={-API_KEY_PRIORITY_LIMIT}
          max={API_KEY_PRIORITY_LIMIT}
          step={1}
          value={draft}
          aria-label={`${title}: ${t('config_management.visual.api_keys.priority_custom')}`}
          aria-invalid={invalid}
          onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void add(); } }}
        />
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => void add()}>{t('config_management.visual.api_keys.priority_add')}</Button>
      </div>
      {invalid && <div role="alert" className="error-box">{t('config_management.visual.api_keys.priority_invalid')}</div>}
    </fieldset>
  );
}

export function ApiKeyPriorityFields(props: Props) {
  return <div className={styles.apiKeyPriorityFields}>
    <PriorityList {...props} field="allowedPriorities" selected={props.allowedPriorities ?? []} />
    <PriorityList {...props} field="excludedPriorities" selected={props.excludedPriorities ?? []} />
  </div>;
}
