import { useTranslation } from 'react-i18next';
import type { ModelInputModality } from '@/types/provider';
import { MODEL_INPUT_MODALITIES } from '@/utils/modelInputModalities';
import { SelectionCheckbox } from './SelectionCheckbox';
import { Button } from './Button';
import styles from './ModelInputModalitiesEditor.module.scss';

export function ModelInputModalitiesEditor({ value, index, onChange, disabled = false }: {
  value?: ModelInputModality[];
  index: number;
  onChange: (value: ModelInputModality[] | undefined) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const selected = new Set(value ?? []);
  const status = selected.size === 0 ? 'inherit' : selected.size === 1 && selected.has('text') ? 'text_only' : 'declared';
  return (
    <fieldset className={styles.editor} disabled={disabled}>
      <legend>{t('model_input_modalities.title')} {index + 1}</legend>
      <div className={styles.content}>
        <p className="hint">{t('model_input_modalities.hint')}</p>
        <div className={styles.choices}>
          {MODEL_INPUT_MODALITIES.map((modality) => (
            <SelectionCheckbox
              key={modality}
              label={t(`model_input_modalities.${modality}`)}
              ariaLabel={`${t('model_input_modalities.title')} ${index + 1}: ${t(`model_input_modalities.${modality}`)}`}
              checked={selected.has(modality)}
              disabled={disabled}
              onChange={(checked) => {
                const next = new Set(selected);
                if (checked) next.add(modality); else next.delete(modality);
                const values = MODEL_INPUT_MODALITIES.filter((candidate) => next.has(candidate));
                onChange(values.length ? values : undefined);
              }}
            />
          ))}
        </div>
        <p className="hint">{t(`model_input_modalities.${status}`)}</p>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || selected.size === 0} onClick={() => onChange(undefined)}>{t('model_input_modalities.reset')}</Button>
      </div>
    </fieldset>
  );
}
