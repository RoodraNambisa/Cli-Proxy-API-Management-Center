import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsDisclosure } from './SettingsDisclosure';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { useCodexStateOptions } from '@/hooks/useCodexStateOptions';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { API_KEY_PRIORITY_LIMIT } from '@/utils/apiKeyGroups';
import {
  GUARD_DEFAULTS,
  guardNameError,
  newGuardRule,
  responseGuardError,
  type CodexResponseGuard,
  type GuardRule,
  type GuardSettings,
  type GuardPreview,
} from '@/utils/codexResponseGuard';
import styles from './CodexResponseGuardEditor.module.scss';

type Catalog = ReturnType<typeof useCodexStateOptions>;
const enumFields = {
  mode: ['off', 'observe', 'enforce'],
  'length-mode': ['off', 'allow', 'deny'],
  'missing-model': ['allow', 'reject'],
  'missing-state': ['allow', 'reject'],
  'on-reject': ['error', 'retry'],
  'clear-affinity': ['none', 'session', 'credential'],
  'late-mismatch': ['observe', 'abort'],
} as const;

export function GuardSettingsEditor({
  value,
  onChange,
  inherited = {},
  disabled,
}: {
  value: GuardSettings;
  onChange: (v: GuardSettings) => void;
  inherited?: GuardSettings;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_guard.${key}`);
  const effective = { ...GUARD_DEFAULTS, ...inherited };
  const patch = (key: keyof GuardSettings, next: unknown) => {
    const updated = { ...value, [key]: next };
    if (next === undefined) delete updated[key];
    onChange(updated);
  };
  return (
    <div className={styles.settings}>
      <div className={styles.grid}>
        {Object.entries(enumFields).map(([field, choices]) => {
          const key = field as keyof typeof enumFields;
          return (
            <div className={styles.field} key={key}>
              <label>{text(key)}</label>
              <Select
                ariaLabel={text(key)}
                value={value[key] ?? 'inherit'}
                disabled={disabled}
                options={[
                  {
                    value: 'inherit',
                    label: `${text('inherit')} (${text(`${key}_${effective[key]}`)})`,
                  },
                  ...choices.map((v) => ({ value: v, label: text(`${key}_${v}`) })),
                ]}
                onChange={(v) => patch(key, v === 'inherit' ? undefined : v)}
              />
            </div>
          );
        })}
        <div className={styles.field}>
          <label>{text('match-model')}</label>
          <Select
            ariaLabel={text('match-model')}
            value={value['match-model'] === undefined ? 'inherit' : String(value['match-model'])}
            disabled={disabled}
            options={[
              {
                value: 'inherit',
                label: `${text('inherit')} (${text(effective['match-model'] ? 'yes' : 'no')})`,
              },
              { value: 'true', label: text('yes') },
              { value: 'false', label: text('no') },
            ]}
            onChange={(v) => patch('match-model', v === 'inherit' ? undefined : v === 'true')}
          />
        </div>
      </div>
      <div className={styles.grid}>
        {(['allowed-returned-models', 'lengths'] as const).map((key) => {
          const active = value[key] !== undefined;
          return (
            <div key={key} className={styles.list}>
              <ToggleSwitch
                checked={active}
                disabled={disabled}
                label={`${text('customize')} ${text(key)}`}
                onChange={(enabled) => patch(key, enabled ? [...effective[key]] : undefined)}
              />
              <StateValuePicker
                label={text(key)}
                value={(value[key] ?? effective[key]).map(String)}
                choices={[]}
                emptyLabel={text(key === 'lengths' ? 'lengths_empty' : 'models_empty')}
                hint={text(`${key}_hint`)}
                maxItems={128}
                disabled={disabled || !active}
                onChange={(v) => patch(key, key === 'lengths' ? v.map(Number) : v)}
                validate={(v) =>
                  key === 'lengths'
                    ? /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 8192
                      ? undefined
                      : text('invalid_length')
                    : guardNameError(v)
                      ? text('invalid_name')
                      : undefined
                }
              />
            </div>
          );
        })}
      </div>
      <div className={styles.grid}>
        {(['error-type', 'error-code', 'error-message'] as const).map((key) => (
          <Input
            key={key}
            label={text(key)}
            value={value[key] ?? ''}
            placeholder={`${text('inherit')}: ${effective[key]}`}
            disabled={disabled}
            onChange={(e) => patch(key, e.target.value || undefined)}
          />
        ))}
      </div>
    </div>
  );
}

export function CodexResponseGuardEditor({
  value,
  onChange,
  disabled,
  dirty,
  focusTarget,
}: {
  value: CodexResponseGuard;
  onChange: (v: CodexResponseGuard) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_guard.${key}`);
  const catalog = useCodexStateOptions('response-guard');
  const rules = Array.isArray(value.rules) ? value.rules : [];
  const changeRules = (next: GuardRule[]) => onChange({ ...value, rules: next });
  const choices: Record<string, StateChoice[]> = {
    credentials: catalog.data.credentials.map((c) => ({
      value: c.id,
      label: c.alias ? `${c.alias} · ${c.name}` : c.name,
      detail: `${c.id} · ${c.plan} · ${c.priority}`,
    })),
    priorities: [...new Set([0, ...catalog.data.priorities])].map((n) => ({
      value: String(n),
      label: String(n),
    })),
    'plan-types': catalog.data.plans.map((p) => ({ value: p, label: p })),
    models: catalog.data.models.map((m) => ({ value: m.id, label: m.id, detail: m.upstream_id })),
  };
  const list = (field: string, current: (number | string)[], update: (v: string[]) => void) => (
    <StateValuePicker
      label={text(field)}
      value={current.map(String)}
      choices={choices[field === 'excluded-credentials' ? 'credentials' : field] ?? []}
      emptyLabel={text(field === 'excluded-credentials' ? 'excluded_empty' : 'any')}
      maxItems={128}
      disabled={disabled}
      onChange={update}
      onOpen={() => void catalog.refresh()}
      loading={catalog.loading}
      loadError={catalog.error}
      validate={(v) =>
        field === 'priorities'
          ? /^-?\d+$/.test(v) &&
            Number.isSafeInteger(Number(v)) &&
            Math.abs(Number(v)) <= API_KEY_PRIORITY_LIMIT
            ? undefined
            : text('invalid_priority')
          : guardNameError(v)
            ? text('invalid_name')
            : undefined
      }
    />
  );
  const invalid = responseGuardError(value);
  return (
    <SettingsDisclosure
      id="config-codex-response-guard"
      title={text('title')}
      description={text('description')}
      dirty={dirty}
      focusTarget={focusTarget}
      errorCount={invalid ? 1 : 0}
      summary={value.enabled ? text('enabled') : text('disabled')}
    >
      <div className={styles.heading}>
        <ToggleSwitch
          label={text('enable')}
          checked={value.enabled}
          disabled={disabled}
          onChange={(enabled) =>
            onChange({
              ...value,
              enabled,
              ...(enabled && value.mode === undefined ? { mode: 'observe' } : {}),
            })
          }
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={catalog.loading}
          onClick={() => void catalog.refresh()}
        >
          {text('check_support')}
        </Button>
      </div>
      {catalog.error && (
        <p role="alert" className="error-box">
          {catalog.error}
        </p>
      )}
      {catalog.data.features?.response_guard === true ? (
        <p className="hint">{text('supported')}</p>
      ) : (
        <p className="hint">
          {text(catalog.data.features === undefined ? 'support_unknown' : 'upgrade')}
        </p>
      )}
      <p className="hint">{text('independent')}</p>
      {invalid && (
        <p className="error-box" role="alert">
          {text('invalid')}
        </p>
      )}
      <h4>{text('defaults')}</h4>
      <GuardSettingsEditor
        value={value}
        onChange={(settings) => onChange(settings as CodexResponseGuard)}
        disabled={disabled}
      />
      <div className={styles.heading}>
        <h4>{text('rules')}</h4>
        <Button
          variant="secondary"
          disabled={disabled || rules.length >= 128}
          onClick={() => changeRules([...rules, newGuardRule()])}
        >
          {text('add_rule')}
        </Button>
      </div>
      <p className="hint">{text('rules_hint')}</p>
      {value.rules !== undefined && !rules.length && (
        <div className={styles.heading}>
          <span className="hint">{text('empty_rules')}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              const next = { ...value };
              delete next.rules;
              onChange(next);
            }}
          >
            {text('use_defaults')}
          </Button>
        </div>
      )}
      {rules.map((rule, index) => {
        const patch = (next: Partial<GuardRule>) =>
          changeRules(rules.map((r, i) => (i === index ? { ...r, ...next } : r)));
        const move = (d: number) => {
          const next = [...rules];
          [next[index], next[index + d]] = [next[index + d], next[index]];
          changeRules(next);
        };
        return (
          <details className={styles.rule} key={rule.id}>
            <summary>
              <strong>
                #{index + 1} · {rule.name || text('unnamed')}
              </strong>
              <span>
                {rule.models?.join(', ') || text('any_model')} ·{' '}
                {text(`mode_${rule.settings?.mode ?? value.mode ?? 'off'}`)}
              </span>
            </summary>
            <div className={styles.ruleBody}>
              <div className={styles.heading}>
                <ToggleSwitch
                  label={text('rule_enabled')}
                  checked={rule.enabled !== false}
                  disabled={disabled}
                  onChange={(enabled) => patch({ enabled })}
                />
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={text('move_up')}
                    disabled={disabled || index === 0}
                    onClick={() => move(-1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={text('move_down')}
                    disabled={disabled || index === rules.length - 1}
                    onClick={() => move(1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={disabled}
                    onClick={() => changeRules(rules.filter((_, i) => i !== index))}
                  >
                    {text('remove')}
                  </Button>
                </div>
              </div>
              <Input
                label={text('name')}
                value={rule.name ?? ''}
                disabled={disabled}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <div className={styles.grid}>
                {(
                  [
                    'credentials',
                    'excluded-credentials',
                    'priorities',
                    'plan-types',
                    'models',
                  ] as const
                ).map((field) => (
                  <div key={field}>
                    {list(field, rule[field] ?? [], (v) =>
                      patch({ [field]: field === 'priorities' ? v.map(Number) : v })
                    )}
                  </div>
                ))}
              </div>
              <GuardSettingsEditor
                value={rule.settings ?? {}}
                inherited={value}
                onChange={(settings) => patch({ settings })}
                disabled={disabled}
              />
              <div className={styles.heading}>
                <h4>{text('model_overrides')}</h4>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      'model-overrides': [
                        ...(rule['model-overrides'] ?? []),
                        { id: crypto.randomUUID(), models: [], settings: {} },
                      ],
                    })
                  }
                >
                  {text('add_override')}
                </Button>
              </div>
              {(rule['model-overrides'] ?? []).map((override, i) => {
                const update = (fields: Partial<typeof override>) =>
                  patch({
                    'model-overrides': rule['model-overrides']!.map((o, n) =>
                      n === i ? { ...o, ...fields } : o
                    ),
                  });
                return (
                  <details className={styles.rule} key={override.id}>
                    <summary>{override.models.join(', ') || text('select_models')}</summary>
                    <div className={styles.ruleBody}>
                      <div className={styles.heading}>
                        <ToggleSwitch
                          label={text('rule_enabled')}
                          checked={override.enabled !== false}
                          disabled={disabled}
                          onChange={(enabled) => update({ enabled })}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={disabled}
                          onClick={() =>
                            patch({
                              'model-overrides': rule['model-overrides']!.filter((_, n) => n !== i),
                            })
                          }
                        >
                          {text('remove')}
                        </Button>
                      </div>
                      {list('models', override.models, (models) => update({ models }))}
                      <GuardSettingsEditor
                        value={override.settings}
                        inherited={{ ...value, ...rule.settings }}
                        disabled={disabled}
                        onChange={(settings) => update({ settings })}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
      <GuardPreviewPanel
        key={catalog.scope}
        value={value}
        catalog={catalog}
        disabled={disabled || invalid}
      />
    </SettingsDisclosure>
  );
}

function GuardPreviewPanel({
  value,
  catalog,
  disabled,
}: {
  value: CodexResponseGuard;
  catalog: Catalog;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_guard.${key}`);
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [returned, setReturned] = useState('');
  const [present, setPresent] = useState(false);
  const [length, setLength] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    signature: string;
    data?: GuardPreview;
    error?: string;
  }>();
  const request = useRef<AbortController | null>(null);
  const signature = JSON.stringify([value, name, model, returned, present, length, catalog.scope]);
  useEffect(() => {
    setBusy(false);
    return () => request.current?.abort();
  }, [signature]);
  const preview = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const data = await authFilesApi.previewCodexResponseGuard(
        {
          name,
          model,
          returned_model: returned,
          state_present: present,
          state_length: present ? Number(length) : 0,
          config: value,
        },
        apiClient.captureConnection(),
        controller.signal
      );
      if (!controller.signal.aborted) setResult({ signature, data });
    } catch (error) {
      if (!controller.signal.aborted)
        setResult({ signature, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const current = result?.signature === signature ? result : undefined;
  return (
    <section className={styles.preview}>
      <h4>{text('preview')}</h4>
      <p className="hint">{text('preview_hint')}</p>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label>{text('credential')}</label>
          <Select
            ariaLabel={text('credential')}
            value={name}
            disabled={disabled}
            options={[
              { value: '', label: text('select_credential') },
              ...catalog.data.credentials.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={setName}
          />
        </div>
        <Input
          label={text('requested_model')}
          value={model}
          disabled={disabled}
          onChange={(e) => setModel(e.target.value)}
        />
        <Input
          label={text('returned_model')}
          value={returned}
          disabled={disabled}
          onChange={(e) => setReturned(e.target.value)}
          placeholder={text('missing_placeholder')}
        />
        <ToggleSwitch
          label={text('state_present')}
          checked={present}
          disabled={disabled}
          onChange={setPresent}
        />
        <Input
          label={text('state_length')}
          type="number"
          min={1}
          max={8192}
          value={length}
          disabled={disabled || !present}
          onChange={(e) => setLength(e.target.value)}
        />
      </div>
      <Button
        variant="secondary"
        disabled={
          disabled ||
          busy ||
          !name ||
          !model.trim() ||
          guardNameError(model) ||
          Boolean(returned && guardNameError(returned)) ||
          (present && (!/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 8192)) ||
          catalog.data.features?.response_guard !== true
        }
        onClick={() => void preview()}
      >
        {busy ? text('loading') : text('preview_action')}
      </Button>
      {current?.error && (
        <p role="alert" className="error-box">
          {current.error}
        </p>
      )}
      {current?.data && (
        <div className={styles.result} role="status">
          <strong>{text(`outcome_${current.data.outcome}`)}</strong>
          <dl>
            <dt>{text('upstream_model')}</dt>
            <dd>
              <code>{current.data.upstream_model}</code>
            </dd>
            <dt>{text('match-model')}</dt>
            <dd>{text(`verdict_${current.data.verdict.model}`)}</dd>
            <dt>{text('state_length')}</dt>
            <dd>{text(`verdict_${current.data.verdict.state}`)}</dd>
            <dt>{text('public_model')}</dt>
            <dd>
              <code>
                {current.data.outcome === 'blocked'
                  ? text('outcome_blocked')
                  : current.data.response_model || '—'}
              </code>
            </dd>
            <dt>{text('rule')}</dt>
            <dd>
              {current.data.policy.rule
                ? `#${current.data.policy.rule} ${current.data.policy.rule_name ?? ''}`
                : text('defaults')}
            </dd>
            <dt>{text('resource_scope')}</dt>
            <dd>{text(current.data.managed ? 'resource_managed' : 'resource_unmanaged')}</dd>
          </dl>
          {current.data.verdict.reasons.map((reason) => (
            <p key={reason}>{text(`reason_${reason}`)}</p>
          ))}
          <details>
            <summary>{text('sources')}</summary>
            <pre>
              {JSON.stringify(
                {
                  sources: current.data.policy.sources,
                  resource_acceptance: current.data.resource_acceptance,
                },
                null,
                2
              )}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
