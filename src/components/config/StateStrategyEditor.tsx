import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StateCookieRoutingEditor } from './StateCookieRoutingEditor';
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
  const routing =
    effective === 'cookie-only' ? (
      <StateCookieRoutingEditor
        settings={settings}
        onChange={onChange}
        disabled={disabled}
        inherit={inherit}
        poolMode={poolMode}
      />
    ) : null;
  return (
    <>
      {inherit && routing}
      <div className={styles.grid}>
        {select('strategy', ['state', 'cookie-only'], 'state')}
        {select('missing-returned-state', ['ignore', 'reject'], 'ignore')}
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
      {!inherit && routing}
      <p className="hint">
        {text(effective === 'cookie-only' ? 'cookie_strategy_hint' : 'seconds_hint')}
      </p>
      {effective === 'cookie-only' && (
        <p className="hint">{text('cookie_backup_hint')}</p>
      )}
    </>
  );
}
