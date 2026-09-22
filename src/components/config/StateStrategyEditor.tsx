import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import styles from './CodexStateEditor.module.scss';

export function StateStrategyEditor({
  settings,
  onChange,
  disabled,
  inherit = true,
  strategy = 'state',
  poolMode = 'auto',
}: {
  settings: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  disabled?: boolean;
  inherit?: boolean;
  strategy?: string;
  poolMode?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const set = (key: string, value: unknown) => {
    const next = { ...settings };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const select = (key: string, values: string[], fallback: string) => (
    <div key={key}>
      <label>{text(key)}</label>
      <Select
        ariaLabel={text(key)}
        disabled={disabled}
        value={String(settings[key] ?? (inherit ? '' : fallback))}
        options={[
          ...(inherit ? [{ value: '', label: text('rule_inherit') }] : []),
          ...values.map((value) => ({ value, label: text(`${key}_${value}`) })),
        ]}
        onChange={(value) => set(key, value || undefined)}
      />
    </div>
  );
  const effective = String(settings.strategy ?? strategy);
  const effectivePool = String(settings['cookie-pool-mode'] ?? poolMode);
  const textField = (key: string, clearLabel: string) => (
    <div>
      <Input
        label={text(key)}
        disabled={disabled}
        value={String(settings[key] ?? '')}
        placeholder={text(inherit && settings[key] === undefined ? 'rule_inherit' : clearLabel)}
        onChange={(e) => set(key, e.target.value)}
      />
      {inherit && (
        <div className={styles.ruleActions}>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => set(key, undefined)}
          >
            {text('rule_inherit')}
          </Button>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => set(key, '')}>
            {text(clearLabel)}
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <>
      <div className={styles.grid}>
        {select('strategy', ['state', 'cookie-only'], 'state')}
        {select('missing-returned-state', ['ignore', 'reject'], 'ignore')}
        {effective === 'cookie-only' && (
          <>
            {textField('cookie-acquisition-model', 'cookie_source_self')}
            {select('cookie-pool-mode', ['auto', 'model', 'shared', 'credential'], 'auto')}
            {['auto', 'shared'].includes(effectivePool) &&
              textField('cookie-pool-group', 'cookie_group_none')}
          </>
        )}
        {effective === 'cookie-only' && (
          <div>
            <label>{text('cookie-verify-after-acquire')}</label>
            <Select
              ariaLabel={text('cookie-verify-after-acquire')}
              disabled={disabled}
              value={
                settings['cookie-verify-after-acquire'] === undefined
                  ? inherit
                    ? ''
                    : 'false'
                  : String(settings['cookie-verify-after-acquire'])
              }
              options={[
                ...(inherit ? [{ value: '', label: text('rule_inherit') }] : []),
                ...[true, false].map((v) => ({
                  value: String(v),
                  label: text(v ? 'rule_bool_true' : 'rule_bool_false'),
                })),
              ]}
              onChange={(v) =>
                set('cookie-verify-after-acquire', v === '' ? undefined : v === 'true')
              }
            />
          </div>
        )}
        {(effective === 'cookie-only'
          ? ['cookie-max-age-seconds', 'cookie-refresh-before-seconds', 'cookie-backup-count']
          : ['ttl-seconds', 'refresh-before-seconds']
        ).map((key) => (
          <Input
            key={key}
            type="number"
            min={key === 'ttl-seconds' ? 1 : 0}
            max={key === 'cookie-backup-count' ? 10 : 86400}
            label={text(key)}
            disabled={disabled}
            placeholder={text(inherit ? 'rule_inherit' : 'seconds_fallback')}
            value={settings[key] == null ? '' : String(settings[key])}
            onChange={(e) => set(key, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        ))}
      </div>
      <p className="hint">
        {text(effective === 'cookie-only' ? 'cookie_strategy_hint' : 'seconds_hint')}
      </p>
      {effective === 'cookie-only' && (
        <>
          <p className="hint">{text('cookie_model_rules_hint')}</p>
          <p className="hint">{text('cookie_backup_hint')}</p>
        </>
      )}
    </>
  );
}
