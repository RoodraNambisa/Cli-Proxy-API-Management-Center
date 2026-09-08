import { useTranslation } from 'react-i18next';
import type { ModelThinking } from '@/types/modelThinking';
import { isValidModelThinking, MAX_MODEL_THINKING_BUDGET, MODEL_THINKING_LEVELS } from '@/utils/modelThinking';
import { Button } from './Button';
import { Input } from './Input';
import { SelectionCheckbox } from './SelectionCheckbox';
import { ToggleSwitch } from './ToggleSwitch';
import styles from './ModelThinkingEditor.module.scss';

interface ModelThinkingEditorProps {
  value?: ModelThinking;
  onChange: (value: ModelThinking | undefined) => void;
  index: number;
  disabled?: boolean;
}

export function ModelThinkingEditor({ value, onChange, index, disabled = false }: ModelThinkingEditorProps) {
  const { t } = useTranslation();
  const selected = new Set(value?.levels?.map((level) => level.trim().toLowerCase()) ?? []);
  const valid = isValidModelThinking(value);
  const patch = (update: Partial<ModelThinking>) => {
    const next = { ...value, ...update };
    for (const key of Object.keys(update)) if (next[key] === undefined) delete next[key];
    onChange(next);
  };
  const ordinal = index + 1;

  return (
    <details className={styles.editor} open={value !== undefined}>
      <summary>
        <span>{t('model_thinking.title')} {ordinal}</span>
        <span className={styles.status}>{t(value === undefined ? 'model_thinking.inherit' : 'model_thinking.custom')}</span>
      </summary>
      <div className={styles.content}>
        <p className="hint">{t('model_thinking.hint')}</p>
        <fieldset className={styles.levels} disabled={disabled}>
          <legend>{t('model_thinking.levels')}</legend>
          <div className={styles.choices}>
            {MODEL_THINKING_LEVELS.map((level) => (
              <SelectionCheckbox
                key={level}
                checked={selected.has(level)}
                disabled={disabled}
                ariaLabel={`${t('model_thinking.levels')} ${ordinal}: ${level}`}
                label={<span>{t(`model_thinking.level_${level}`)} <code>{level}</code></span>}
                onChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(level); else next.delete(level);
                  patch({ levels: MODEL_THINKING_LEVELS.filter((candidate) => next.has(candidate)) });
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className={styles.budgets}>
          {(['min', 'max'] as const).map((field) => (
            <Input
              key={field}
              label={`${t(`model_thinking.${field}`)} ${ordinal}`}
              type="number"
              min={0}
              max={MAX_MODEL_THINKING_BUDGET}
              step={1}
              placeholder="0"
              value={value?.[field] !== undefined && Number.isFinite(value[field]) ? value[field] : ''}
              disabled={disabled}
              onChange={(event) => patch({ [field]: event.currentTarget.validity.badInput ? NaN : event.currentTarget.value.trim() === '' ? undefined : Number(event.currentTarget.value) })}
            />
          ))}
        </div>
        <p className="hint">{t('model_thinking.budget_hint')}</p>
        <div className={styles.flags}>
          <ToggleSwitch
            checked={Boolean(value?.zeroAllowed) || selected.has('none')}
            onChange={(zeroAllowed) => patch({ zeroAllowed })}
            label={t('model_thinking.zero')}
            ariaLabel={`${t('model_thinking.zero')} ${ordinal}`}
            disabled={disabled || selected.has('none')}
          />
          <ToggleSwitch
            checked={Boolean(value?.dynamicAllowed) || selected.has('auto')}
            onChange={(dynamicAllowed) => patch({ dynamicAllowed })}
            label={t('model_thinking.dynamic')}
            ariaLabel={`${t('model_thinking.dynamic')} ${ordinal}`}
            disabled={disabled || selected.has('auto')}
          />
        </div>
        <p className="hint">{t('model_thinking.derived_hint')}</p>
        {!valid && <div className={styles.error} role="alert">{t('model_thinking.invalid')}</div>}
        <Button type="button" variant="secondary" size="sm" className="align-start" disabled={disabled || value === undefined} onClick={() => onChange(undefined)}>
          {t('model_thinking.reset')}
        </Button>
      </div>
    </details>
  );
}
