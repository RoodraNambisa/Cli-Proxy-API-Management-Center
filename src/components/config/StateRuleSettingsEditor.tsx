import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { StateValuePicker, type StateChoice } from './StateValuePicker';
import { StateProxyCheck } from './StateProxyCheck';
import {
  stateListItemError,
  STATE_NUMBER_DEFAULTS,
  type CodexStateOverride,
  type StateListKind,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';
export function StateRuleSettingsEditor({
  settings,
  inherited,
  onChange,
  disabled,
  lengths,
  inheritLabel,
}: {
  settings: Record<string, unknown>;
  inherited: CodexStateOverride;
  onChange: (settings: Record<string, unknown>) => void;
  disabled?: boolean;
  lengths: StateChoice[];
  inheritLabel?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const inheritText = inheritLabel ?? text('rule_inherit');
  const r = { settings },
    value = inherited,
    choices = { lengths };
  const load = () => {},
    loading = false,
    loadError = undefined;
  const setting = (_r: unknown, key: string, next: unknown) => {
    const updated = { ...settings };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };
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
  const select = (r: { settings: Record<string, unknown> }, key: string, options: string[]) => (
    <div key={key}>
      <label>{text(key)}</label>
      <Select
        ariaLabel={text(key)}
        value={String(r.settings[key] ?? '')}
        disabled={disabled}
        onChange={(v) => setting(r, key, v || undefined)}
        options={[
          { value: '', label: inheritText },
          ...options.map((v) => ({ value: v, label: text(`${key}_${v}`) })),
        ]}
      />
    </div>
  );
  return (
    <>
      <div className={styles.grid}>
        {select(r, 'acquisition', ['active', 'all', 'manual'])}
        {select(r, 'mode', ['override', 'missing'])}
        {select(r, 'missing-policy', ['continue', 'error', 'hide'])}
        <div>
          <label>{text('rule_lengths')}</label>
          <Select
            ariaLabel={text('rule_lengths')}
            disabled={disabled}
            value={
              r.settings.lengths === undefined
                ? 'inherit'
                : Array.isArray(r.settings.lengths) && !r.settings.lengths.length
                  ? 'any'
                  : 'custom'
            }
            options={['inherit', 'any', 'custom'].map((v) => ({
              value: v,
              label: v === 'inherit' ? inheritText : text(`rule_lengths_${v}`),
            }))}
            onChange={(v) =>
              setting(r, 'lengths', v === 'inherit' ? undefined : v === 'any' ? [] : [292])
            }
          />
          {Array.isArray(r.settings.lengths) &&
            r.settings.lengths.length > 0 &&
            list(
              text('plan_lengths_field'),
              r.settings.lengths as number[],
              'length',
              choices.lengths,
              (v) => setting(r, 'lengths', v.map(Number))
            )}
        </div>
        {['match-model', 'invalidate-on-state-length-mismatch', 'invalidate-on-model-mismatch'].map(
          (key) => (
            <div key={key}>
              <label>{text(key)}</label>
              <Select
                ariaLabel={text(key)}
                disabled={disabled}
                value={r.settings[key] === undefined ? '' : String(r.settings[key])}
                options={[
                  {
                    value: '',
                    label: `${inheritText} (${text(value[key as keyof CodexStateOverride] ? 'rule_bool_true' : 'rule_bool_false')})`,
                  },
                  { value: 'true', label: text('rule_bool_true') },
                  { value: 'false', label: text('rule_bool_false') },
                ]}
                onChange={(v) => setting(r, key, v === '' ? undefined : v === 'true')}
              />
            </div>
          )
        )}
      </div>
      <details className={styles.ruleAdvanced}>
        <summary>{text('rule_advanced')}</summary>
        <div className={styles.grid}>
          {Object.keys(STATE_NUMBER_DEFAULTS)
            .filter((key) => key !== 'concurrency')
            .map((key) => (
              <Input
                key={key}
                type="number"
                min={1}
                label={text(key)}
                placeholder={`${inheritText} (${value[key as keyof typeof STATE_NUMBER_DEFAULTS]})`}
                value={r.settings[key] === undefined ? '' : String(r.settings[key])}
                disabled={disabled}
                onChange={(e) =>
                  setting(r, key, e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            ))}
          {select(r, 'proxy-mode', ['inherit', 'direct', 'custom'])}
        </div>
        {[
          'proxy-url',
          'prompt',
          'response-contains',
          'error-type',
          'error-code',
          'error-message',
        ].map((key) => (
          <div className={styles.ruleText} key={key}>
            <ToggleSwitch
              label={`${text(key)} · ${text('rule_custom')}`}
              checked={r.settings[key] !== undefined}
              disabled={disabled}
              onChange={(v) =>
                setting(r, key, v ? value[key as keyof CodexStateOverride] : undefined)
              }
            />
            {r.settings[key] !== undefined && (
              <Input
                aria-label={text(key)}
                value={String(r.settings[key])}
                disabled={disabled}
                onChange={(e) => setting(r, key, e.target.value)}
                autoComplete="off"
              />
            )}
          </div>
        ))}
        {(r.settings['proxy-mode'] ?? value['proxy-mode']) === 'custom' && (
          <StateProxyCheck
            proxyUrl={String(r.settings['proxy-url'] ?? value['proxy-url'])}
            disabled={disabled}
          />
        )}
        <p className="hint">{text('retry_hint')}</p>
      </details>
    </>
  );
}
