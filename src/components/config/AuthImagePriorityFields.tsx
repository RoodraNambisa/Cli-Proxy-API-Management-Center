import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import { TagListEditor } from './VisualConfigEditorBlocks';
import type { AuthModelExclusionVisualEntry } from '@/types/visualConfig';
import { authImagePriorityScope } from '@/utils/authModelExclusions';
import styles from './AuthImagePriorityFields.module.scss';

export function AuthImagePriorityFields({
  rule,
  disabled,
  error,
  onChange,
}: {
  rule: AuthModelExclusionVisualEntry;
  disabled?: boolean;
  error?: string;
  onChange: (patch: Partial<AuthModelExclusionVisualEntry>) => void;
}) {
  const { t } = useTranslation();
  const scope = authImagePriorityScope(rule);
  const selected = rule.disableImageGenerationPriorities ?? [];
  const options = [...new Set(rule.priorities.map((p) => p.trim()).filter(Boolean))];
  const invalid = selected.filter(
    (p) => options.length && !options.some((v) => Number(v) === Number(p))
  );
  const label = t('auth_image_priority.scope');
  return (
    <div className={styles.fields}>
      <label id={`${rule.clientId}-image-scope`}>{label}</label>
      <Select
        ariaLabelledBy={`${rule.clientId}-image-scope`}
        value={scope}
        disabled={disabled}
        options={[
          { value: 'all', label: t('auth_image_priority.all') },
          { value: 'selected', label: t('auth_image_priority.selected') },
        ]}
        onChange={(value) =>
          onChange({
            disableImageGenerationScope: value as 'all' | 'selected',
            disableImageGenerationPriorities: value === 'all' ? [] : selected,
          })
        }
      />
      {scope === 'selected' && (
        <div>
          {options.length ? (
            <div
              className={styles.choices}
              role="group"
              aria-label={t('auth_image_priority.priorities')}
            >
              {[...options, ...invalid].map((priority) => (
                <label key={priority} className={styles.choice}>
                  <input
                    type="checkbox"
                    disabled={disabled || invalid.includes(priority)}
                    checked={selected.some((p) => Number(p) === Number(priority))}
                    onChange={(event) =>
                      onChange({
                        disableImageGenerationPriorities: event.target.checked
                          ? [...selected, priority]
                          : selected.filter((p) => Number(p) !== Number(priority)),
                      })
                    }
                  />
                  {t('auth_image_priority.priority', { priority })}
                  {invalid.includes(priority) && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          disableImageGenerationPriorities: selected.filter((p) => p !== priority),
                        })
                      }
                    >
                      {t('auth_image_priority.remove')}
                    </button>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <TagListEditor
              value={selected}
              disabled={disabled}
              inputAriaLabel={t('auth_image_priority.priorities')}
              placeholder={t('auth_image_priority.placeholder')}
              ariaInvalid={Boolean(error)}
              onChange={(disableImageGenerationPriorities) =>
                onChange({ disableImageGenerationPriorities })
              }
            />
          )}
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>
      )}
      <p className={styles.hint}>{t('auth_image_priority.hint')}</p>
    </div>
  );
}
