import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { hasCookieRulePool, shareCookieRule } from '@/utils/codexCookieSharing';
import styles from './CodexStateEditor.module.scss';

export function StateCookieRoutingEditor({
  settings,
  onChange,
  disabled,
  inherit,
  poolMode,
}: {
  settings: Record<string, unknown>;
  onChange: (settings: Record<string, unknown>) => void;
  disabled?: boolean;
  inherit: boolean;
  poolMode: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const patch = (fields: Record<string, unknown>) =>
    onChange(
      Object.fromEntries(
        Object.entries({ ...settings, ...fields }).filter(([, value]) => value !== undefined)
      )
    );
  const kind = hasCookieRulePool(settings)
    ? 'rule'
    : settings['cookie-pool-mode'] === 'model'
      ? 'model'
      : settings['cookie-pool-mode'] === undefined && settings['cookie-pool-group'] === undefined
        ? 'inherit'
        : 'legacy';
  const field = (key: string, emptyLabel: string) => (
    <div>
      <Input
        label={text(
          inherit
            ? key === 'cookie-acquisition-model'
              ? 'cookie_unified_model'
              : key
            : `${key}_default`
        )}
        value={String(settings[key] ?? '')}
        placeholder={text(inherit && settings[key] === undefined ? 'rule_inherit' : emptyLabel)}
        disabled={disabled}
        onChange={(event) => patch({ [key]: event.target.value })}
      />
      {inherit && (
        <div className={styles.ruleActions}>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => patch({ [key]: undefined })}
          >
            {text('rule_inherit')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => patch({ [key]: '' })}
          >
            {text(emptyLabel)}
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <>
      {inherit && (
        <>
          <div className={styles.grid}>
            <div>
              <label>{text('cookie_sharing')}</label>
              <Select
                ariaLabel={text('cookie_sharing')}
                value={kind}
                disabled={disabled}
                options={['inherit', 'rule', 'model', ...(kind === 'legacy' ? ['legacy'] : [])].map(
                  (value) => ({ value, label: text(`cookie_sharing_${value}`) })
                )}
                onChange={(value) => {
                  if (value === 'rule') onChange(shareCookieRule(settings));
                  else if (value === 'inherit')
                    patch({ 'cookie-pool-mode': undefined, 'cookie-pool-group': undefined });
                  else if (value === 'model')
                    patch({ 'cookie-pool-mode': 'model', 'cookie-pool-group': '' });
                }}
              />
            </div>
            {field('cookie-acquisition-model', 'cookie_source_self')}
          </div>
          <p className="hint">{text('cookie_sharing_hint')}</p>
        </>
      )}
      {(!inherit || kind === 'legacy') && (
        <details className={styles.ruleAdvanced}>
          <summary>{text(inherit ? 'cookie_legacy_routing' : 'cookie_legacy_defaults')}</summary>
          <p className="hint">{text('cookie_legacy_hint')}</p>
          <div className={styles.grid}>
            {!inherit && field('cookie-acquisition-model', 'cookie_source_self')}
            <div>
              <label>{text('cookie-pool-mode')}</label>
              <Select
                ariaLabel={text('cookie-pool-mode')}
                value={String(settings['cookie-pool-mode'] ?? (inherit ? '' : 'auto'))}
                disabled={disabled}
                options={[
                  ...(inherit ? [{ value: '', label: text('rule_inherit') }] : []),
                  ...['auto', 'model', 'shared', 'credential'].map((value) => ({
                    value,
                    label: text(`cookie-pool-mode_${value}`),
                  })),
                ]}
                onChange={(value) => patch({ 'cookie-pool-mode': value || undefined })}
              />
            </div>
            {['auto', 'shared'].includes(String(settings['cookie-pool-mode'] ?? poolMode)) &&
              field('cookie-pool-group', 'cookie_group_none')}
          </div>
          <p className="hint">{text('cookie_model_rules_hint')}</p>
        </details>
      )}
    </>
  );
}
