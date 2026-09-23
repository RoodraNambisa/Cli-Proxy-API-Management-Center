import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { StateRuleMergeButton } from './StateRuleMergeButton';
import { StateRuleSettingsEditor } from './StateRuleSettingsEditor';
import { StateRuleModelOverrides, StateSettingsSummary } from './StateRuleModelOverrides';
import { apiClient } from '@/services/api/client';
import { authFilesApi, type CodexStatePreview } from '@/services/api/authFiles';
import { useAuthStore } from '@/stores';
import { copyCookieRulePools } from '@/utils/codexCookieSharing';
import {
  codexStateError,
  newCodexStateRule,
  serializeCodexState,
  stateListItemError,
  type CodexStateOverride,
  type CodexStateRule,
  type StateListKind,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

type Choices = {
  priorities: StateChoice[];
  credentials: StateChoice[];
  models: StateChoice[];
  plans: StateChoice[];
  lengths: StateChoice[];
};
type Props = {
  value: CodexStateOverride;
  onChange: (v: CodexStateOverride) => void;
  disabled?: boolean;
  choices: Choices;
  load: () => void;
  loading: boolean;
  loadError?: string;
  modelOverridesSupported?: boolean;
  modelAliases?: Array<{ id: string; upstream_id: string }>;
};
export function CodexStateRulesEditor({
  value,
  onChange,
  disabled,
  choices,
  load,
  loading,
  loadError,
  modelOverridesSupported = false,
  modelAliases = [],
}: Props) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const rules = value.rules ?? [];
  const [open, setOpen] = useState<string>();
  const change = (rules: CodexStateRule[]) => onChange({ ...value, rules });
  const patch = (id: string, fields: Partial<CodexStateRule>) =>
    change(rules.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  const list = (
    label: string,
    values: (string | number)[],
    kind: StateListKind,
    available: StateChoice[],
    update: (items: string[]) => void
  ) => (
    <StateValuePicker
      label={label}
      value={values.map(String)}
      onChange={update}
      choices={available}
      emptyLabel={text('rule_any')}
      maxItems={
        kind === 'credential'
          ? 1024
          : kind === 'length' || kind === 'plan'
            ? 32
            : kind === 'priority'
              ? 128
              : 256
      }
      disabled={disabled}
      validate={(v) => {
        const error = stateListItemError(v, kind);
        return error ? text(error) : undefined;
      }}
      onOpen={kind === 'length' ? undefined : load}
      loading={kind !== 'length' && loading}
      loadError={loadError}
    />
  );
  const move = (i: number, d: number) => {
    const next = [...rules];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    change(next);
  };
  return (
    <div className={styles.rulesRoot}>
      <div className={styles.planHeading}>
        <strong>
          {text('rules_title')} · {rules.length}
        </strong>
        <Button
          variant="secondary"
          disabled={disabled || rules.length >= 128}
          onClick={() => {
            const r = newCodexStateRule();
            change([...rules, r]);
            setOpen(r.id);
          }}
        >
          {text('rule_add')}
        </Button>
      </div>
      <p className="hint">{text('rules_hint')}</p>
      {!modelOverridesSupported && (
        <div className="hint">
          {text('model_special_upgrade')}{' '}
          <Button size="sm" variant="secondary" disabled={loading} onClick={load}>
            {text('model_special_check')}
          </Button>
        </div>
      )}
      {!rules.length && <p className="hint">{text('rules_empty')}</p>}
      {rules.map((r, i) => (
        <section key={r.id} className={styles.ruleCard}>
          <div className={styles.ruleHeader}>
            <button
              type="button"
              className={styles.ruleSummary}
              aria-expanded={open === r.id}
              onClick={() => {
                setOpen(open === r.id ? undefined : r.id);
                if (open !== r.id) load();
              }}
            >
              <strong>
                {i + 1}. {r.name || text('rule_unnamed')}
              </strong>
              <span>
                {text(r.action === 'skip' ? 'rule_skip' : 'rule_manage')} ·{' '}
                {r.priorities.length ? `${text('priorities')}: ${r.priorities.join(', ')}` : ''}{' '}
                {r.credentials.length
                  ? `${text('rule_credentials')}: ${r.credentials.map((id) => choices.credentials.find((c) => c.value === id)?.label || id).join(', ')}`
                  : ''}{' '}
                · {r.models.join(', ') || text('picker_all_models')}
              </span>
              <StateSettingsSummary settings={r.settings} inherited={value} />
              {(r['model-overrides'] ?? [])
                .filter((item) => item.enabled !== false)
                .map((item) => (
                  <span key={item.id}>
                    {item.models.join(', ')}:{' '}
                    <StateSettingsSummary
                      settings={item.settings}
                      inherited={value}
                      parent={r.settings}
                    />
                  </span>
                ))}
            </button>
            <div className={styles.ruleActions}>
              <StateRuleMergeButton
                value={value}
                index={i}
                onChange={change}
                disabled={disabled}
                supported={modelOverridesSupported}
                aliases={modelAliases}
              />
              <ToggleSwitch
                ariaLabel={`${text('rule_enabled')} ${i + 1}`}
                checked={r.enabled !== false}
                disabled={disabled}
                onChange={(enabled) => patch(r.id, { enabled })}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || i === 0}
                aria-label={`${text('rule_up')} ${i + 1}`}
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || i === rules.length - 1}
                aria-label={`${text('rule_down')} ${i + 1}`}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || rules.length >= 128}
                onClick={() => {
                  const copy = copyCookieRulePools(r);
                  copy.id = newCodexStateRule().id;
                  copy.name = `${r.name || text('rule_unnamed')} (${text('rule_copy')})`;
                  change([...rules.slice(0, i + 1), copy, ...rules.slice(i + 1)]);
                  setOpen(copy.id);
                }}
              >
                {text('rule_copy')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => change(rules.filter((v) => v.id !== r.id))}
              >
                {text('plan_remove')}
              </Button>
            </div>
          </div>
          {open === r.id && (
            <div className={styles.ruleBody}>
              <Input
                label={text('rule_name')}
                value={r.name}
                disabled={disabled}
                onChange={(e) => patch(r.id, { name: e.target.value })}
              />
              <div className={styles.grid}>
                <div>
                  <label>{text('rule_action')}</label>
                  <Select
                    ariaLabel={text('rule_action')}
                    value={r.action}
                    disabled={disabled}
                    onChange={(v) => patch(r.id, { action: v as CodexStateRule['action'] })}
                    options={['manage', 'skip'].map((v) => ({
                      value: v,
                      label: text(`rule_${v}`),
                    }))}
                  />
                </div>
                {list(text('priorities'), r.priorities, 'priority', choices.priorities, (v) =>
                  patch(r.id, { priorities: v.map(Number) })
                )}
                {list(
                  text('rule_credentials'),
                  r.credentials,
                  'credential',
                  choices.credentials,
                  (credentials) => patch(r.id, { credentials })
                )}
                {list(
                  text('excluded-credentials'),
                  r['excluded-credentials'],
                  'credential',
                  choices.credentials,
                  (v) => patch(r.id, { 'excluded-credentials': v })
                )}
                {list(text('plan_planTypes'), r['plan-types'], 'plan', choices.plans, (v) =>
                  patch(r.id, { 'plan-types': v })
                )}
              </div>
              {list(text('models'), r.models, 'model', choices.models, (models) =>
                patch(r.id, { models })
              )}
              <p className="hint">{text('rule_match_hint')}</p>
              {r.action === 'manage' && (
                <>
                  <StateRuleSettingsEditor
                    settings={r.settings}
                    inherited={value}
                    onChange={(settings) => patch(r.id, { settings })}
                    disabled={disabled}
                    lengths={choices.lengths}
                  />
                  <StateRuleModelOverrides
                    value={value}
                    rule={r}
                    onChange={(items) => patch(r.id, { 'model-overrides': items })}
                    disabled={disabled}
                    supported={modelOverridesSupported}
                    aliases={modelAliases}
                    choices={choices}
                    load={load}
                    loading={loading}
                    loadError={loadError}
                  />
                </>
              )}
            </div>
          )}
        </section>
      ))}
      <StateRulePreview value={value} choices={choices} load={load} disabled={disabled} />
    </div>
  );
}

function StateRulePreview({
  value,
  choices,
  load,
  disabled,
}: Pick<Props, 'value' | 'choices' | 'load' | 'disabled'>) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const credentialId = useId();
  const scope = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration}`
  );
  const [credential, setCredential] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<CodexStatePreview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    setResult(undefined);
    setError('');
    setBusy(false);
    return () => request.current?.abort();
  }, [value, credential, model, scope]);
  const preview = async () => {
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    setError('');
    try {
      const r = await authFilesApi.previewCodexState(
        credential,
        model,
        serializeCodexState(value),
        apiClient.captureConnection(),
        c.signal
      );
      if (!c.signal.aborted) setResult(r);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };
  return (
    <details
      className={styles.preview}
      onToggle={(e) => {
        if (e.currentTarget.open) load();
      }}
    >
      <summary>{text('rule_preview')}</summary>
      <p className="hint">{text('rule_preview_hint')}</p>
      <div className={styles.previewGrid}>
        <div className="form-group">
          <label htmlFor={credentialId}>{text('rule_preview_credential')}</label>
          <Select
            id={credentialId}
            className={styles.previewCredential}
            ariaLabel={text('rule_preview_credential')}
            value={credential}
            disabled={disabled}
            options={[
              { value: '', label: text('rule_preview_credential') },
              ...choices.credentials.map((c) => ({ value: c.value, label: c.label })),
            ]}
            onChange={setCredential}
          />
        </div>
        <Input
          label={text('rule_preview_model')}
          list="state-rule-preview-models"
          value={model}
          disabled={disabled}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id="state-rule-preview-models">
          {choices.models.map((m) => (
            <option value={m.value} key={m.value} />
          ))}
        </datalist>
        <Button
          disabled={disabled || busy || !credential || !model.trim() || codexStateError(value)}
          loading={busy}
          onClick={() => void preview()}
        >
          {text('rule_preview_run')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {result && (
        <div className={styles.previewResult} role="status">
          <strong>
            {text('rule_matched')}:{' '}
            {result.match.rule_name ||
              result.match.rule_id ||
              text(`rule_result_${result.match.action}`)}
          </strong>
          <p>
            {text('picker_upstream')}: {result.upstream_model} ·{' '}
            {text(result.managed ? 'rule_manage' : 'rule_skip')}
          </p>
          {result.match.model_override_id && (
            <p>
              {text('model_special_title')}: {result.match.model_override_id}
            </p>
          )}
          {!!result.match.conflicts?.length && (
            <p role="alert">
              {text('model_conflict')}: {result.match.conflicts.join(', ')}
            </p>
          )}
          {!result.registered && <p className="hint">{text('rule_unregistered')}</p>}
          {result.managed && (
            <dl>
              {Object.entries(result.policy).map(([key, v]) => (
                <div key={key}>
                  <dt>{text(key === 'lengths' ? 'rule_lengths' : key)}</dt>
                  <dd>
                    {Array.isArray(v)
                      ? v.join(', ') || text('picker_any_length')
                      : typeof v === 'boolean'
                        ? text(v ? 'rule_bool_true' : 'rule_bool_false')
                        : ['mode', 'acquisition', 'missing-policy', 'proxy-mode'].includes(key)
                          ? text(`${key}_${v}`)
                          : String(v)}{' '}
                    <small>
                      (
                      {text(
                        (
                          {
                            rule: 'rule_source',
                            'model-override': 'model_special_source',
                            'global-model': 'model_global_source',
                            plan: 'model_plan_source',
                          } as Record<string, string>
                        )[result.match.sources?.[key] ?? ''] ?? 'rule_default_source'
                      )}
                      )
                    </small>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </details>
  );
}
