import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfigTable, ConfigTableRow } from './ConfigTable';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import {
  readStateModelOverrides,
  stateListItemError,
  type CodexStateOverride,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

export function StateModelOverridesEditor({
  value,
  onChange,
  models,
  lengths,
  disabled,
  loadModels,
  loading,
  loadError,
}: {
  value: CodexStateOverride;
  onChange: (raw: string) => void;
  models: StateChoice[];
  lengths: StateChoice[];
  disabled?: boolean;
  loadModels: () => void;
  loading: boolean;
  loadError?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const rules = readStateModelOverrides(value['model-overrides']);
  const [revision, setRevision] = useState(0);
  const save = (rules: Record<string, unknown>[]) => onChange(JSON.stringify(rules, null, 2));
  const update = (index: number, patch: Record<string, unknown>) => {
    if (!rules) return;
    save(
      rules.map((rule, position) =>
        position === index
          ? Object.fromEntries(
              Object.entries({ ...rule, ...patch }).filter(([, v]) => v !== undefined)
            )
          : rule
      )
    );
  };
  const columns = [text('override_model'), text('override_settings'), t('common.action')];
  return (
    <details className={styles.overrides}>
      <summary>{text('model_overrides')}</summary>
      <p className="hint">{text('model_overrides_hint')}</p>
      {rules ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || rules.length >= 256}
            onClick={() => save([...rules, { model: '' }])}
          >
            {text('override_add')}
          </Button>
          {rules.length > 0 ? (
            <ConfigTable label={text('model_overrides')} columns={columns}>
              {rules.map((rule, index) => {
                const model = typeof rule.model === 'string' ? rule.model : '';
                const invalid =
                  !model || rules.some((other, i) => i !== index && other.model === model);
                const settings =
                  ['lengths', 'match-model', 'prompt', 'response-contains']
                    .filter((key) => rule[key] != null)
                    .map(text)
                    .join(' · ') || text('override_inherit_all');
                const mode = (field: 'lengths' | 'prompt' | 'response-contains') =>
                  rule[field] == null ? 'inherit' : 'custom';
                const modeSelect = (field: 'lengths' | 'prompt' | 'response-contains') => (
                  <div className="form-group">
                    <label htmlFor={`state-override-${index}-${field}`}>
                      {text(field === 'lengths' ? 'plan_lengths_field' : field)}
                    </label>
                    <Select
                      id={`state-override-${index}-${field}`}
                      value={mode(field)}
                      disabled={disabled}
                      options={['inherit', 'custom'].map((v) => ({
                        value: v,
                        label: text(`override_${v}`),
                      }))}
                      onChange={(v) =>
                        update(index, {
                          [field]:
                            v === 'inherit'
                              ? undefined
                              : field === 'lengths'
                                ? []
                                : field === 'prompt'
                                  ? value.prompt
                                  : '',
                        })
                      }
                    />
                  </div>
                );
                return (
                  <ConfigTableRow
                    key={`${revision}:${index}`}
                    title={`${text('override_rule')} ${index + 1}`}
                    labels={columns}
                    cells={[model || text('override_model_required'), settings]}
                    initialExpanded={!model}
                    invalid={invalid}
                    actions={
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`${text('plan_remove')} ${index + 1}`}
                        onClick={() => {
                          setRevision((value) => value + 1);
                          save(rules.filter((_, position) => position !== index));
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    }
                  >
                    <StateValuePicker
                      label={text('override_model')}
                      value={model ? [model] : []}
                      choices={models}
                      maxItems={1}
                      emptyLabel={text('override_model_required')}
                      disabled={disabled}
                      onOpen={loadModels}
                      loading={loading}
                      loadError={loadError}
                      validate={(item) =>
                        stateListItemError(item, 'model')
                          ? text('picker_invalid_identifier')
                          : rules.some((r, i) => i !== index && r.model === item)
                            ? text('override_duplicate')
                            : undefined
                      }
                      onChange={(items) => update(index, { model: items[0] ?? '' })}
                    />
                    <div className={styles.grid}>
                      <div>
                        {modeSelect('lengths')}
                        {mode('lengths') === 'custom' && (
                          <StateValuePicker
                            label={text('plan_lengths_field')}
                            value={Array.isArray(rule.lengths) ? rule.lengths.map(String) : []}
                            choices={lengths}
                            maxItems={32}
                            emptyLabel={text('picker_any_length')}
                            disabled={disabled}
                            validate={(item) =>
                              stateListItemError(item, 'length')
                                ? text('picker_invalid_length')
                                : undefined
                            }
                            normalize={(item) => (/^\d+$/.test(item) ? String(Number(item)) : item)}
                            onChange={(items) => update(index, { lengths: items.map(Number) })}
                          />
                        )}
                      </div>
                      <div className="form-group">
                        <label htmlFor={`state-override-${index}-match`}>
                          {text('match-model')}
                        </label>
                        <Select
                          id={`state-override-${index}-match`}
                          value={
                            typeof rule['match-model'] === 'boolean'
                              ? String(rule['match-model'])
                              : 'inherit'
                          }
                          disabled={disabled}
                          options={['inherit', 'true', 'false'].map((v) => ({
                            value: v,
                            label: text(`override_${v}`),
                          }))}
                          onChange={(v) =>
                            update(index, {
                              'match-model': v === 'inherit' ? undefined : v === 'true',
                            })
                          }
                        />
                      </div>
                      <div>
                        {modeSelect('response-contains')}
                        {mode('response-contains') === 'custom' && (
                          <Input
                            label={text('response-contains')}
                            disabled={disabled}
                            value={String(rule['response-contains'] ?? '')}
                            maxLength={1024}
                            hint={text('override_contains_empty')}
                            onChange={(event) =>
                              update(index, { 'response-contains': event.target.value })
                            }
                          />
                        )}
                      </div>
                    </div>
                    {modeSelect('prompt')}
                    {mode('prompt') === 'custom' && (
                      <Input
                        label={text('prompt')}
                        disabled={disabled}
                        value={String(rule.prompt ?? '')}
                        maxLength={4096}
                        hint={text('override_prompt_empty')}
                        onChange={(event) => update(index, { prompt: event.target.value })}
                      />
                    )}
                  </ConfigTableRow>
                );
              })}
            </ConfigTable>
          ) : (
            <p className="hint">{text('override_none')}</p>
          )}
        </>
      ) : (
        <div role="alert" className="error-box">
          {text('override_parse_error')}
        </div>
      )}
      <details>
        <summary>{text('override_json')}</summary>
        <textarea
          aria-label={text('override_json')}
          rows={6}
          className={styles.json}
          disabled={disabled}
          value={value['model-overrides']}
          onChange={(event) => {
            setRevision((value) => value + 1);
            onChange(event.target.value);
          }}
        />
      </details>
    </details>
  );
}
