import { Fragment, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Input } from './Input';
import { ModelThinkingEditor } from './ModelThinkingEditor';
import { ModelInputModalitiesEditor } from './ModelInputModalitiesEditor';
import { ToggleSwitch } from './ToggleSwitch';
import { isValidModelContextLength, MAX_MODEL_CONTEXT_LENGTH } from '@/utils/modelContextLength';
import { IconX } from './icons';
import type { ModelEntry } from './modelInputListUtils';

interface ModelInputListProps {
  entries: ModelEntry[];
  onChange: (entries: ModelEntry[]) => void;
  addLabel?: string;
  disabled?: boolean;
  namePlaceholder?: string;
  aliasPlaceholder?: string;
  showDisplayName?: boolean;
  showContextLength?: boolean;
  showThinking?: boolean;
  showInputModalities?: boolean;
  showCompatibility?: boolean;
  hideAddButton?: boolean;
  onAdd?: () => void;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  removeButtonClassName?: string;
  removeButtonTitle?: string;
  removeButtonAriaLabel?: string;
}

export function ModelInputList({
  entries,
  onChange,
  addLabel,
  disabled = false,
  namePlaceholder = 'model-name',
  aliasPlaceholder = 'alias (optional)',
  showDisplayName = false,
  showContextLength = false,
  showThinking = false,
  showInputModalities = false,
  showCompatibility = false,
  hideAddButton = false,
  onAdd,
  className = '',
  rowClassName = '',
  inputClassName = '',
  removeButtonClassName = '',
  removeButtonTitle = 'Remove',
  removeButtonAriaLabel = 'Remove',
}: ModelInputListProps) {
  const { t } = useTranslation();
  const displayNameId = useId();
  const currentEntries = entries.length ? entries : [{ name: '', alias: '' }];
  const containerClassName = ['header-input-list', className].filter(Boolean).join(' ');
  const inputClassNames = ['input', inputClassName].filter(Boolean).join(' ');
  const rowClassNames = ['header-input-row', rowClassName].filter(Boolean).join(' ');

  const updateEntry = (index: number, field: 'name' | 'alias' | 'displayName', value: string) => {
    const next = currentEntries.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry));
    onChange(next);
  };

  const addEntry = () => {
    if (onAdd) {
      onAdd();
    } else {
      onChange([...currentEntries, { name: '', alias: '' }]);
    }
  };

  const removeEntry = (index: number) => {
    const next = currentEntries.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [{ name: '', alias: '' }]);
  };

  return (
    <div className={containerClassName}>
      {currentEntries.map((entry, index) => (
        <Fragment key={index}>
          <div className={rowClassNames}>
            <input
              className={inputClassNames}
              placeholder={namePlaceholder}
              value={entry.name}
              onChange={(e) => updateEntry(index, 'name', e.target.value)}
              disabled={disabled}
            />
            <span className="header-separator">→</span>
            <input
              className={inputClassNames}
              placeholder={aliasPlaceholder}
              value={entry.alias}
              onChange={(e) => updateEntry(index, 'alias', e.target.value)}
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeEntry(index)}
              disabled={disabled || currentEntries.length <= 1}
              className={removeButtonClassName}
              title={removeButtonTitle}
              aria-label={removeButtonAriaLabel}
            >
              <IconX size={14} />
            </Button>
          </div>
          {showDisplayName && (
            <div className="form-group">
              <label htmlFor={`${displayNameId}-${index}`}>
                {t('common.model_display_name_label')} {index + 1}
              </label>
              <input
                id={`${displayNameId}-${index}`}
                className={inputClassNames}
                placeholder={t('common.model_display_name_placeholder')}
                aria-describedby={`${displayNameId}-${index}-hint`}
                value={entry.displayName ?? ''}
                onChange={(e) => updateEntry(index, 'displayName', e.target.value)}
                disabled={disabled}
              />
              <div id={`${displayNameId}-${index}-hint`} className="hint">{t('common.model_display_name_hint')}</div>
            </div>
          )}
          {showInputModalities && (
            <ModelInputModalitiesEditor
              value={entry.inputModalities}
              index={index}
              disabled={disabled}
              onChange={(inputModalities) => onChange(currentEntries.map((item, idx) => idx === index ? { ...item, inputModalities } : item))}
            />
          )}
          {showContextLength && (
            <Input
              label={`${t('common.model_context_length_label')} ${index + 1}`}
              hint={t('common.model_context_length_hint')}
              placeholder={t('common.model_context_length_inherit')}
              type="number"
              min={0}
              max={MAX_MODEL_CONTEXT_LENGTH}
              step={1}
              value={entry.maxContextLength !== undefined && Number.isFinite(entry.maxContextLength) ? entry.maxContextLength : ''}
              error={isValidModelContextLength(entry.maxContextLength) ? undefined : t('common.model_context_length_invalid')}
              disabled={disabled}
              onChange={(event) => {
                const value = event.currentTarget.validity.badInput ? NaN
                  : event.currentTarget.value.trim() === '' ? undefined : Number(event.currentTarget.value);
                onChange(currentEntries.map((current, idx) => idx === index ? { ...current, maxContextLength: value } : current));
              }}
            />
          )}
          {showCompatibility && (
            <div className="form-group">
              <ToggleSwitch
                checked={entry.isCompat === true}
                label={`${t('model_compatibility.label')} ${index + 1}`}
                ariaLabel={`${t('model_compatibility.label')} ${index + 1}`}
                disabled={disabled}
                onChange={(isCompat) => onChange(currentEntries.map((current, idx) => idx === index ? { ...current, isCompat } : current))}
              />
              <p className="hint">{t('model_compatibility.hint')}</p>
            </div>
          )}
          {showThinking && (
            <ModelThinkingEditor
              index={index}
              value={entry.thinking}
              disabled={disabled}
              onChange={(thinking) => onChange(currentEntries.map((current, idx) => idx === index ? { ...current, thinking } : current))}
            />
          )}
        </Fragment>
      ))}
      {!hideAddButton && addLabel && (
        <Button variant="secondary" size="sm" onClick={addEntry} disabled={disabled} className="align-start">
          {addLabel}
        </Button>
      )}
    </div>
  );
}
