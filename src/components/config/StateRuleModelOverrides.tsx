import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { StateRuleSettingsEditor } from './StateRuleSettingsEditor';
import {
  readCodexState,
  stateListItemError,
  type CodexStateOverride,
  type CodexStateRule,
  type CodexStateRuleModelOverride,
} from '@/utils/codexStateOverride';
import {
  inheritedStateSettings,
  sameStateValue,
  STATE_SETTING_KEYS,
} from '@/utils/codexStateModelRules';
import { generateId } from '@/utils/helpers';
import styles from './CodexStateEditor.module.scss';

export function StateSettingsSummary({
  settings,
  inherited,
  parent = {},
  model,
}: {
  settings: Record<string, unknown>;
  inherited: CodexStateOverride;
  parent?: Record<string, unknown>;
  model?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const defaults = inheritedStateSettings(inherited, parent, model);
  const items = Object.entries(settings).filter(([key]) => STATE_SETTING_KEYS.includes(key));
  const format = (key: string, value: unknown) =>
    typeof value === 'boolean'
      ? text(value ? 'rule_bool_true' : 'rule_bool_false')
      : Array.isArray(value)
        ? value.join(', ') || text('picker_any_length')
        : ['mode', 'missing-policy', 'acquisition', 'proxy-mode'].includes(key)
          ? text(`${key}_${value}`)
          : typeof value === 'number'
            ? String(value)
            : text('rule_custom');
  return (
    <span className={styles.settingsSummary}>
      {items.length
        ? items.map(([key, v]) => (
            <span key={key}>
              {text(key === 'lengths' ? 'rule_lengths' : key)}: {format(key, v)}
              {sameStateValue(v, defaults[key]) &&
                !(key === 'lengths' && inherited['plan-lengths'].length) &&
                (model !== undefined || inherited['model-overrides'] === '[]') && (
                  <small> · {text('model_same_as_inherited')}</small>
                )}
            </span>
          ))
        : text('model_inherit_all')}
    </span>
  );
}

export function StateRuleModelOverrides({
  value,
  rule,
  onChange,
  disabled,
  supported,
  choices,
  load,
  loading,
  loadError,
  aliases = [],
}: {
  value: CodexStateOverride;
  rule: CodexStateRule;
  onChange: (items: CodexStateRuleModelOverride[]) => void;
  disabled?: boolean;
  supported: boolean;
  choices: { models: StateChoice[]; lengths: StateChoice[] };
  load: () => void;
  loading: boolean;
  loadError?: string;
  aliases?: Array<{ id: string; upstream_id: string }>;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const [open, setOpen] = useState<string>();
  const items = rule['model-overrides'] ?? [];
  const patch = (id: string, next: Partial<CodexStateRuleModelOverride>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...next } : item)));
  const blocked = disabled || !supported;
  return (
    <div className={styles.modelOverrides}>
      <div className={styles.planHeading}>
        <strong>{text('model_special_title')}</strong>
        <Button
          size="sm"
          variant="secondary"
          disabled={blocked || items.length >= 256}
          onClick={() => {
            const id = generateId();
            onChange([...items, { id, models: [], settings: {} }]);
            setOpen(id);
          }}
        >
          {text('model_special_add')}
        </Button>
      </div>
      <p className="hint">{text('model_special_hint')}</p>
      {!supported && (
        <p role="status" className="hint">
          {text('model_special_upgrade')}{' '}
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            {text('model_special_check')}
          </Button>
        </p>
      )}
      {!items.length && <p className="hint">{text('model_inherit_all')}</p>}
      {!!rule.models.length && (
        <div className={styles.modelTable}>
          <table>
            <thead>
              <tr>
                <th>{text('override_model')}</th>
                <th>{text('model_request_check')}</th>
                <th>{text('model_response_check')}</th>
              </tr>
            </thead>
            <tbody>
              {rule.models.map((model) => {
                const upstreams = [
                  ...new Set(aliases.filter((a) => a.id === model).map((a) => a.upstream_id)),
                ];
                const upstream = upstreams[0] ?? model;
                const names = new Set([
                  model,
                  upstream,
                  ...aliases.filter((a) => a.upstream_id === upstream).map((a) => a.id),
                ]);
                const matches = items.filter(
                  (x) => x.enabled !== false && x.models.some((m) => names.has(m))
                );
                const item = matches[0];
                const uncertain = upstreams.length > 1 || matches.length > 1;
                const inherited = inheritedStateSettings(value, rule.settings, upstream);
                return (
                  <tr key={model}>
                    <td>{model}</td>
                    {['match-model', 'invalidate-on-model-mismatch'].map((key) => (
                      <td key={key}>
                        {uncertain
                          ? text('model_check_preview')
                          : item?.settings[key] === undefined
                            ? `${text('model_inherit_effective')} · ${text(inherited[key] ? 'rule_bool_true' : 'rule_bool_false')}`
                            : text(item.settings[key] ? 'rule_bool_true' : 'rule_bool_false')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.map((item) => (
        <section key={item.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <button
              type="button"
              className={styles.ruleSummary}
              aria-expanded={open === item.id}
              onClick={() => setOpen(open === item.id ? undefined : item.id)}
            >
              <strong>{item.models.join(', ') || text('model_special_choose')}</strong>
              <StateSettingsSummary
                settings={item.settings}
                inherited={value}
                parent={rule.settings}
                model={item.models.length === 1 ? item.models[0] : undefined}
              />
            </button>
            <div className={styles.ruleActions}>
              <ToggleSwitch
                ariaLabel={`${text('rule_enabled')} ${item.id}`}
                checked={item.enabled !== false}
                disabled={blocked}
                onChange={(enabled) => patch(item.id, { enabled })}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={blocked}
                onClick={() =>
                  patch(item.id, {
                    settings: Object.fromEntries(
                      Object.entries(item.settings).filter(
                        ([key]) => !STATE_SETTING_KEYS.includes(key)
                      )
                    ),
                  })
                }
              >
                {text('model_restore')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={blocked}
                onClick={() => onChange(items.filter((x) => x.id !== item.id))}
              >
                {text('plan_remove')}
              </Button>
            </div>
          </div>
          {open === item.id && (
            <div className={styles.ruleBody}>
              <StateValuePicker
                label={text('model_special_models')}
                value={item.models}
                onChange={(models) => patch(item.id, { models })}
                choices={
                  rule.models.length
                    ? rule.models.map(
                        (m) => choices.models.find((c) => c.value === m) ?? { value: m, label: m }
                      )
                    : choices.models
                }
                emptyLabel={text('model_special_choose')}
                maxItems={256}
                disabled={blocked}
                validate={(m) =>
                  stateListItemError(m, 'model') || /[*?]/.test(m)
                    ? text('picker_invalid_identifier')
                    : undefined
                }
                onOpen={load}
                loading={loading}
                loadError={loadError}
              />
              <StateRuleSettingsEditor
                inheritLabel={text('model_inherit_parent')}
                settings={item.settings}
                inherited={readCodexState(
                  inheritedStateSettings(
                    value,
                    rule.settings,
                    item.models.length === 1 ? item.models[0] : undefined
                  )
                )}
                onChange={(settings) => patch(item.id, { settings })}
                disabled={blocked}
                lengths={choices.lengths}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
