import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { SettingsDisclosure } from './SettingsDisclosure';
import {
  codexStateError,
  STATE_NUMBER_DEFAULTS,
  type CodexStateOverride,
  type StateNumberField,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

export function CodexStateEditor({
  value,
  onChange,
  disabled,
  dirty,
  focusTarget,
  strip,
}: {
  value: CodexStateOverride;
  onChange: (value: CodexStateOverride) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
  strip: boolean;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const patch = (next: Partial<CodexStateOverride>) => onChange({ ...value, ...next });
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
      | 'models'
      | 'priorities'
      | 'excluded-credentials'
      | 'proxy-url'
      | 'lengths'
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
      <div className={styles.grid}>
        {field('priorities')}
        {field('models')}
        {field('excluded-credentials')}
      </div>
      <p className="hint">{text('scope_hint')}</p>
      <div className={styles.grid}>
        {select('mode', ['override', 'missing'])}
        {select('missing-policy', ['continue', 'error'])}
        {select('acquisition', ['active', 'all', 'manual'])}
      </div>
      <p className="hint">{text('missing_hint')}</p>
      <div className={styles.grid}>
        {select('proxy-mode', ['inherit', 'direct', 'custom'])}
        {value['proxy-mode'] === 'custom' && field('proxy-url')}
      </div>
      <p className="hint">{text('proxy_hint')}</p>
      <div className={styles.grid}>
        {Object.keys(STATE_NUMBER_DEFAULTS).map((k) => {
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
        {field('lengths')}
        <ToggleSwitch
          label={text('match-model')}
          checked={value['match-model']}
          disabled={disabled}
          onChange={(v) => patch({ 'match-model': v })}
        />
        {field('response-contains')}
      </div>
      {field('prompt')}
      <details>
        <summary>{text('model_overrides')}</summary>
        <p className="hint">{text('model_overrides_hint')}</p>
        <textarea
          aria-label={text('model_overrides')}
          rows={6}
          className={styles.json}
          disabled={disabled}
          value={value['model-overrides']}
          onChange={(e) => patch({ 'model-overrides': e.target.value })}
        />
      </details>
      <p className="hint">{text('validation_hint')}</p>
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
