import { CodexStateRulesEditor } from './CodexStateRulesEditor';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsDisclosure } from './SettingsDisclosure';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { StateModelOverridesEditor } from './StateModelOverridesEditor';
import { StateProxyCheck } from './StateProxyCheck';
import { useCodexStateOptions } from '@/hooks/useCodexStateOptions';
import {
  codexStateError,
  migrateCodexStateRules,
  splitStateList,
  stateListItemError,
  STATE_NUMBER_DEFAULTS,
  type CodexStateOverride,
  type StateNumberField,
  type StateListKind,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

export function CodexStateEditor({
  value,
  onChange,
  disabled,
  dirty,
  focusTarget,
  strip,
  defaultsOnly = false,
}: {
  value: CodexStateOverride;
  onChange: (value: CodexStateOverride) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
  strip: boolean;
  defaultsOnly?: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const patch = (next: Partial<CodexStateOverride>) => onChange({ ...value, ...next });
  const catalog = useCodexStateOptions();
  const [planRevision, setPlanRevision] = useState(0);
  const load = () => {
    void catalog.refresh();
  };
  const priorities: StateChoice[] = [...new Set([0, ...catalog.data.priorities])]
    .sort((a, b) => a - b)
    .map((priority) => ({ value: String(priority), label: String(priority) }));
  const credentials: StateChoice[] = catalog.data.credentials.map((credential) => ({
    value: credential.id,
    label: credential.alias ? `${credential.alias} · ${credential.name}` : credential.name,
    detail: `${text('priorities')} ${credential.priority} · ${credential.plan}${credential.disabled ? ` · ${text('disabled')}` : ''}`,
  }));
  const modelMap = new Map<string, Set<string>>();
  const upstreamMap = new Map<string, Set<string>>();
  for (const model of catalog.data.models) {
    const upstream = model.upstream_id || model.id;
    if (!modelMap.has(model.id)) modelMap.set(model.id, new Set());
    modelMap.get(model.id)!.add(upstream);
    if (!upstreamMap.has(upstream)) upstreamMap.set(upstream, new Set());
    upstreamMap.get(upstream)!.add(model.id);
  }
  const models: StateChoice[] = [...modelMap].map(([id, upstreams]) => ({
    value: id,
    label: id,
    detail:
      upstreams.size === 1 && upstreams.has(id)
        ? undefined
        : `${text('picker_upstream')}: ${[...upstreams].join(', ')}`,
  }));
  const upstreamModels: StateChoice[] = [...upstreamMap].map(([id, aliases]) => ({
    value: id,
    label: id,
    detail: [...aliases].filter((alias) => alias !== id).join(', ') || undefined,
  }));
  const plans: StateChoice[] = [
    ...new Set([
      'plus',
      'pro',
      'business',
      'team',
      'free',
      'enterprise',
      'edu',
      'unknown',
      ...catalog.data.plans,
    ]),
  ].map((plan) => ({ value: plan, label: plan }));
  const lengths: StateChoice[] = ['292', '332'].map((length) => ({
    value: length,
    label: length,
    detail: text('picker_length_example'),
  }));
  const list = (
    label: string,
    raw: string,
    update: (raw: string) => void,
    kind: StateListKind,
    choices: StateChoice[],
    empty: string,
    limit: number,
    dynamic = true,
    listKey = label
  ) => (
    <StateValuePicker
      key={`${catalog.scope}:${listKey}`}
      label={label}
      value={splitStateList(raw)}
      onChange={(items) => update(items.join(', '))}
      choices={choices}
      emptyLabel={text(empty)}
      maxItems={limit}
      disabled={disabled}
      validate={(item) => {
        const error = stateListItemError(item, kind);
        return error ? text(error) : undefined;
      }}
      normalize={(item) =>
        (kind === 'length' || kind === 'priority') && /^-?\d+$/.test(item)
          ? String(Number(item))
          : item
      }
      onOpen={dynamic ? load : undefined}
      loading={dynamic && catalog.loading}
      loadError={dynamic ? catalog.error : undefined}
    />
  );
  const select = (
    key: 'mode' | 'missing-policy' | 'acquisition' | 'proxy-mode',
    options: string[]
  ) => (
    <div className="form-group">
      <label htmlFor={`state-${key}`}>{text(key)}</label>
      <Select
        id={`state-${key}`}
        value={value[key]}
        disabled={disabled}
        options={options.map((v) => ({ value: v, label: text(`${key}_${v}`) }))}
        onChange={(v) => patch({ [key]: v })}
      />
    </div>
  );
  const field = (
    key:
      | 'proxy-url'
      | 'prompt'
      | 'response-contains'
      | 'error-type'
      | 'error-code'
      | 'error-message'
  ) => (
    <Input
      key={key}
      label={text(key)}
      value={value[key]}
      disabled={disabled}
      onChange={(e) => patch({ [key]: e.target.value })}
      autoComplete={key === 'proxy-url' ? 'off' : undefined}
    />
  );
  if (!defaultsOnly && value.rules !== undefined)
    return (
      <SettingsDisclosure
        id="config-codex-state"
        title={text('title')}
        summary={text(value.enabled ? 'enabled' : 'disabled')}
        focusTarget={focusTarget}
        dirty={dirty}
        errorCount={codexStateError(value) || (value.enabled && strip) ? 1 : 0}
      >
        <ToggleSwitch
          label={text('enabled')}
          checked={value.enabled}
          disabled={disabled}
          onChange={(enabled) => patch({ enabled })}
        />
        <p className="hint">{text('memory_hint')}</p>
        <p className="hint">{text('ws_hint')}</p>
        {value.enabled && strip && (
          <div role="alert" className="error-box">
            {text('strip_conflict')}
          </div>
        )}
        {codexStateError(value) && (
          <div role="alert" className="error-box">
            {text('invalid')}
          </div>
        )}
        <Input
          type="number"
          min={1}
          max={16}
          label={text('concurrency')}
          value={value.concurrency}
          disabled={disabled}
          onChange={(e) => patch({ concurrency: e.target.value })}
        />
        <CodexStateEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          strip={strip}
          defaultsOnly
        />
        <CodexStateRulesEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          choices={{ priorities, credentials, models, plans, lengths }}
          modelOverridesSupported={catalog.data.features?.rule_model_overrides === true}
          modelAliases={catalog.data.models}
          load={load}
          loading={catalog.loading}
          loadError={catalog.error}
        />
      </SettingsDisclosure>
    );
  return (
    <SettingsDisclosure
      id={defaultsOnly ? 'config-codex-state-defaults' : 'config-codex-state'}
      title={text(defaultsOnly ? 'rule_defaults' : 'title')}
      summary={defaultsOnly ? text('rule_inherit') : text(value.enabled ? 'enabled' : 'disabled')}
      focusTarget={focusTarget}
      dirty={dirty}
      errorCount={codexStateError(value) || (value.enabled && strip) ? 1 : 0}
    >
      {!defaultsOnly && (
        <>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(migrateCodexStateRules(value))}
          >
            {text('rules_convert')}
          </Button>
          <p className="hint">{text('rules_convert_hint')}</p>
          <ToggleSwitch
            label={text('enabled')}
            checked={value.enabled}
            disabled={disabled}
            onChange={(enabled) => patch({ enabled })}
          />
          <p className="hint">{text('memory_hint')}</p>
          <p className="hint">{text('ws_hint')}</p>
          {value.enabled && strip && (
            <div role="alert" className="error-box">
              {text('strip_conflict')}
            </div>
          )}
          {codexStateError(value) && (
            <div role="alert" className="error-box">
              {text('invalid')}
            </div>
          )}
          <div className={styles.grid}>
            {list(
              text('priorities'),
              value.priorities,
              (priorities) => patch({ priorities }),
              'priority',
              priorities,
              'picker_no_priority',
              128
            )}
            {list(
              text('included-credentials'),
              value['included-credentials'],
              (v) => patch({ 'included-credentials': v }),
              'credential',
              credentials,
              'picker_no_included',
              1024
            )}
            {list(
              text('excluded-credentials'),
              value['excluded-credentials'],
              (v) => patch({ 'excluded-credentials': v }),
              'credential',
              credentials,
              'picker_no_excluded',
              1024
            )}
          </div>
          <p className="hint">{text('credential_scope_hint')}</p>
          {list(
            text('models'),
            value.models,
            (models) => patch({ models }),
            'model',
            models,
            'picker_all_models',
            256
          )}
          <p className="hint">{text('scope_hint')}</p>
        </>
      )}
      <div className={styles.grid}>
        {select('mode', ['override', 'missing'])}
        {select('missing-policy', ['continue', 'error', 'hide'])}
        {select('acquisition', ['active', 'all', 'manual'])}
      </div>
      <p className="hint">{text('missing_hint')}</p>
      <div className={styles.grid}>
        {select('proxy-mode', ['inherit', 'direct', 'custom'])}
        {value['proxy-mode'] === 'custom' && (
          <div>
            {field('proxy-url')}
            <StateProxyCheck proxyUrl={value['proxy-url']} disabled={disabled} />
          </div>
        )}
      </div>
      <p className="hint">{text('proxy_hint')}</p>
      <div className={styles.grid}>
        {Object.keys(STATE_NUMBER_DEFAULTS)
          .filter((k) => !defaultsOnly || k !== 'concurrency')
          .map((k) => {
            const key = k as StateNumberField;
            return (
              <Input
                key={key}
                label={text(key)}
                type="number"
                value={value[key]}
                disabled={disabled}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            );
          })}
      </div>
      <p className="hint">{text('retry_hint')}</p>
      <div className={styles.grid}>
        {list(
          text('lengths'),
          value.lengths,
          (lengths) => patch({ lengths }),
          'length',
          lengths,
          'picker_any_length',
          32,
          false
        )}
        <div className={styles.alignedToggle}>
          <span className={styles.controlLabel}>{text('match-model')}</span>
          <div>
            <ToggleSwitch
              label={text('override_true')}
              checked={value['match-model']}
              disabled={disabled}
              onChange={(v) => patch({ 'match-model': v })}
            />
          </div>
        </div>
        {field('response-contains')}
      </div>
      {field('prompt')}
      <div className={styles.planHeading}>
        <strong>{text('plan_lengths')}</strong>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || value['plan-lengths'].length >= 64}
          onClick={() =>
            patch({
              'plan-lengths': [
                ...value['plan-lengths'],
                { planTypes: '', models: '', lengths: value.lengths, extra: {} },
              ],
            })
          }
        >
          {text('plan_add')}
        </Button>
      </div>
      <p className="hint">{text('plan_lengths_hint')}</p>
      <div className={styles.planRules}>
        {value['plan-lengths'].map((rule, index) => (
          <div className={styles.planRule} key={`${planRevision}:${index}`}>
            {(['planTypes', 'models', 'lengths'] as const).map((field) =>
              list(
                text(field === 'lengths' ? 'plan_lengths_field' : `plan_${field}`),
                rule[field],
                (next) =>
                  patch({
                    'plan-lengths': value['plan-lengths'].map((current, i) =>
                      i === index ? { ...current, [field]: next } : current
                    ),
                  }),
                field === 'planTypes' ? 'plan' : field === 'models' ? 'model' : 'length',
                field === 'planTypes' ? plans : field === 'models' ? upstreamModels : lengths,
                field === 'planTypes'
                  ? 'picker_plan_required'
                  : field === 'models'
                    ? 'picker_all_models'
                    : 'picker_any_length',
                field === 'models' ? 256 : 32,
                field !== 'lengths',
                `plan-${index}-${field}`
              )
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              aria-label={`${text('plan_remove')} ${index + 1}`}
              onClick={() => {
                setPlanRevision((revision) => revision + 1);
                patch({ 'plan-lengths': value['plan-lengths'].filter((_, i) => i !== index) });
              }}
            >
              {text('plan_remove')}
            </Button>
          </div>
        ))}
      </div>
      <StateModelOverridesEditor
        key={catalog.scope}
        value={value}
        onChange={(raw) => patch({ 'model-overrides': raw })}
        models={upstreamModels}
        lengths={lengths}
        disabled={disabled}
        loadModels={load}
        loading={catalog.loading}
        loadError={catalog.error}
      />
      <p className="hint">{text('validation_hint')}</p>
      <strong>{text('response_watch')}</strong>
      <div className={styles.grid}>
        {(['invalidate-on-state-length-mismatch', 'invalidate-on-model-mismatch'] as const).map(
          (field) => (
            <ToggleSwitch
              key={field}
              label={text(field)}
              checked={value[field]}
              disabled={disabled}
              onChange={(enabled) => patch({ [field]: enabled })}
            />
          )
        )}
      </div>
      <p className="hint">{text('response_watch_hint')}</p>
      {value['missing-policy'] === 'error' && (
        <>
          <div className={styles.grid}>
            {field('error-type')}
            {field('error-code')}
            {field('error-message')}
          </div>
          <p className="hint">{text('error_hint')}</p>
        </>
      )}
    </SettingsDisclosure>
  );
}
