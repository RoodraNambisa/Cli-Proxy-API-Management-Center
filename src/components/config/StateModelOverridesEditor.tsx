import { StateStrategyEditor } from './StateStrategyEditor';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfigTable, ConfigTableRow } from './ConfigTable';
import { StateSettingsSummary } from './StateRuleModelOverrides';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { sameStateValue } from '@/utils/codexStateModelRules';
import { generateId } from '@/utils/helpers';
import { shareCookieRule } from '@/utils/codexCookieSharing';
import {
  readStateModelOverrides,
  stateListItemError,
  type CodexStateOverride,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

type ModelDefaultGroup = {
  id: string;
  models: string[];
  settings: Record<string, unknown>;
};

function groupDefaults(raw: string): ModelDefaultGroup[] | undefined {
  const entries = readStateModelOverrides(raw);
  if (!entries || entries.some((entry) => typeof entry.model !== 'string')) return;
  const groups: ModelDefaultGroup[] = [];
  for (const { model, ...settings } of entries) {
    const name = model as string;
    const previous = groups[groups.length - 1];
    // Group identical adjacent defaults without merging different criteria or extensions.
    if (
      name &&
      previous?.models.length &&
      !previous.models.includes(name) &&
      sameStateValue(previous.settings, settings)
    ) {
      previous.models.push(name);
    } else {
      groups.push({ id: generateId(), models: name ? [name] : [], settings });
    }
  }
  return groups;
}

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
  const raw = value['model-overrides'];
  const [draft, setDraft] = useState(() => ({ raw, groups: groupDefaults(raw) }));
  let groups = draft.groups;
  if (draft.raw !== raw) {
    groups = groupDefaults(raw);
    setDraft({ raw, groups });
  }
  const save = (next: ModelDefaultGroup[]) => {
    const serialized = JSON.stringify(
      next.flatMap(({ models, settings }) =>
        (models.length ? models : ['']).map((model) => ({ model, ...settings }))
      ),
      null,
      2
    );
    setDraft({ raw: serialized, groups: next });
    onChange(serialized);
  };
  const replace = (index: number, patch: Partial<ModelDefaultGroup>) => {
    if (groups) save(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  };
  const update = (index: number, patch: Record<string, unknown>) => {
    if (!groups) return;
    replace(index, {
      settings: Object.fromEntries(
        Object.entries({ ...groups[index].settings, ...patch }).filter(([, v]) => v !== undefined)
      ),
    });
  };
  const count = groups?.reduce((sum, group) => sum + Math.max(group.models.length, 1), 0) ?? 0;
  const columns = [text('default_rule_models'), text('override_settings'), t('common.action')];
  return (
    <section className={styles.overrides} aria-label={text('model_overrides')}>
      <div className={styles.planHeading}>
        <strong>
          {text('model_overrides')}
          {groups ? ` · ${groups.length}` : ''}
        </strong>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !groups || count >= 256}
          onClick={() =>
            groups &&
            save([
              ...groups,
              {
                id: generateId(),
                models: [],
                settings:
                  value.strategy === 'cookie-only'
                    ? shareCookieRule({ 'cookie-acquisition-model': '' })
                    : {},
              },
            ])
          }
        >
          {text('override_add')}
        </Button>
      </div>
      <p className="hint">{text('model_overrides_hint')}</p>
      {groups ? (
        <>
          {groups.length > 0 ? (
            <ConfigTable label={text('model_overrides')} columns={columns}>
              {groups.map((group, index) => {
                const rule = group.settings;
                const invalid =
                  !group.models.length ||
                  groups.some(
                    (other, i) =>
                      i !== index && other.models.some((model) => group.models.includes(model))
                  );
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
                    key={group.id}
                    title={`${text('override_rule')} ${index + 1}`}
                    labels={columns}
                    cells={[
                      group.models.join(', ') || text('default_rule_models_required'),
                      <StateSettingsSummary settings={rule} inherited={value} />,
                    ]}
                    initialExpanded={!group.models.length}
                    invalid={invalid}
                    actions={
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`${text('plan_remove')} ${index + 1}`}
                        onClick={() => {
                          save(groups.filter((_, position) => position !== index));
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    }
                  >
                    <StateValuePicker
                      label={text('default_rule_models')}
                      value={group.models}
                      choices={models}
                      maxItems={256 - count + Math.max(group.models.length, 1)}
                      emptyLabel={text('default_rule_models_required')}
                      disabled={disabled}
                      onOpen={loadModels}
                      loading={loading}
                      loadError={loadError}
                      validate={(item) =>
                        stateListItemError(item, 'model')
                          ? text('picker_invalid_identifier')
                          : groups.some((other, i) => i !== index && other.models.includes(item))
                            ? text('override_duplicate')
                            : undefined
                      }
                      onChange={(models) => replace(index, { models })}
                    />
                    <StateStrategyEditor
                      settings={rule}
                      strategy={value.strategy}
                      poolMode={value['cookie-pool-mode']}
                      disabled={disabled}
                      onChange={(settings) => replace(index, { settings })}
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
          onChange={(event) => onChange(event.target.value)}
        />
      </details>
    </section>
  );
}
