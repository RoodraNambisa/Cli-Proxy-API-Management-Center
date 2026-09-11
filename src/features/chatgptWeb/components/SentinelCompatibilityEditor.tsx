import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { SentinelPropertyType } from '@/types';
import type { SentinelCompatibilityDraft, SentinelPropertyDraft } from '../sentinelCompatibility';
import styles from './ChatGptWebSentinelPanel.module.scss';

export function SentinelCompatibilityEditor({
  draft,
  onChange,
  disabled,
  supported,
}: {
  draft: SentinelCompatibilityDraft;
  onChange: (draft: SentinelCompatibilityDraft) => void;
  disabled: boolean;
  supported: boolean;
}) {
  const { t } = useTranslation();
  const label = (key: string) => t(`chatgpt_web.sentinel.compatibility.${key}`);
  const updateProperty = (index: number, patch: Partial<SentinelPropertyDraft>) =>
    onChange({
      ...draft,
      properties: draft.properties.map((property, at) =>
        at === index ? { ...property, ...patch } : property
      ),
    });
  const controlsDisabled = disabled || !supported;
  return (
    <details className={styles.compatibilityEditor}>
      <summary>{label('title')}</summary>
      <p>{label('description')}</p>
      {!supported && <p role="status">{label('requires_backend')}</p>}
      <div className={styles.runtimeRow}>
        <strong>{label('enabled')}</strong>
        <ToggleSwitch
          checked={draft.enabled}
          onChange={(enabled) => onChange({ ...draft, enabled })}
          disabled={controlsDisabled}
          ariaLabel={label('enabled')}
        />
      </div>
      <div className={styles.runtimeRow}>
        <div>
          <strong>{label('auto_extend')}</strong>
          <span>{label('auto_extend_hint')}</span>
        </div>
        <ToggleSwitch
          checked={draft.autoExtend}
          onChange={(autoExtend) => onChange({ ...draft, autoExtend })}
          disabled={controlsDisabled || !draft.enabled}
          ariaLabel={label('auto_extend')}
        />
      </div>
      <label className={styles.compatibilityField}>
        <span>{label('writable')}</span>
        <textarea
          rows={3}
          value={draft.writable}
          disabled={controlsDisabled}
          onChange={(event) => onChange({ ...draft, writable: event.target.value })}
          placeholder="__example_owner"
        />
        <small>{label('writable_hint')}</small>
      </label>
      <div className={styles.statusHeading}>
        <h3>{label('properties')}</h3>
        <Button
          variant="secondary"
          size="sm"
          disabled={controlsDisabled || draft.properties.length >= 64}
          onClick={() =>
            onChange({
              ...draft,
              properties: [
                ...draft.properties,
                { path: '', type: 'string', value: '', enumerable: false },
              ],
            })
          }
        >
          {label('add')}
        </Button>
      </div>
      <p>{label('properties_hint')}</p>
      {draft.properties.map((property, index) => (
        <fieldset className={styles.compatibilityProperty} key={index} disabled={controlsDisabled}>
          <legend>
            {label('property')} {index + 1}
          </legend>
          <label>
            <span>{label('path')}</span>
            <input
              value={property.path}
              placeholder="window.__example_ready"
              onChange={(event) => updateProperty(index, { path: event.target.value })}
            />
          </label>
          <label>
            <span>{label('type')}</span>
            <select
              value={property.type}
              onChange={(event) => {
                const type = event.target.value as SentinelPropertyType;
                updateProperty(index, {
                  type,
                  value: type === 'boolean' ? 'false' : type === 'number' ? '0' : '',
                });
              }}
            >
              {(['string', 'boolean', 'number', 'null', 'undefined'] as const).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{label('value')}</span>
            {property.type === 'boolean' ? (
              <select
                value={property.value}
                onChange={(event) => updateProperty(index, { value: event.target.value })}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <input
                value={
                  property.type === 'null' || property.type === 'undefined'
                    ? property.type
                    : property.value
                }
                disabled={property.type === 'null' || property.type === 'undefined'}
                onChange={(event) => updateProperty(index, { value: event.target.value })}
              />
            )}
          </label>
          <label className={styles.compatibilityCheckbox}>
            <input
              type="checkbox"
              checked={property.enumerable}
              onChange={(event) => updateProperty(index, { enumerable: event.target.checked })}
            />
            <span>{label('enumerable')}</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ ...draft, properties: draft.properties.filter((_, at) => at !== index) })
            }
          >
            {label('remove')}
          </Button>
        </fieldset>
      ))}
    </details>
  );
}
