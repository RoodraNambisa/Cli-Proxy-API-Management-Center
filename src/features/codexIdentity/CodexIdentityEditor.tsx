import { useTranslation } from 'react-i18next';
import { useConfigStore } from '@/stores/useConfigStore';
import { SettingsDisclosure } from '@/components/config/SettingsDisclosure';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { codexIdentityBooleans, type CodexIdentityOverride } from '@/types/codexIdentity';
import styles from './CodexIdentity.module.scss';

export function useCodexIdentitySupport() {
  return useConfigStore((s) => s.config?.raw?.['codex-identity-policy-supported'] === true);
}
export function CodexIdentityEditor({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value?: CodexIdentityOverride;
  onChange: (v: CodexIdentityOverride | undefined) => void;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const fields = value ?? {};
  const set = (key: keyof CodexIdentityOverride, next: unknown) => {
    const copy = { ...fields };
    if (next === undefined) delete copy[key];
    else Object.assign(copy, { [key]: next });
    onChange(Object.keys(copy).length ? copy : undefined);
  };
  const inherit = { value: '', label: t('codex_identity.inherit') };
  const choices = (options: string[], prefix: string) => [
    inherit,
    ...options.map((v) => ({ value: v, label: t(`${prefix}.${v}`) })),
  ];
  return (
    <SettingsDisclosure
      id={id}
      title={t('codex_identity.title')}
      description={t('codex_identity.description')}
      summary={
        Object.keys(fields).length
          ? t('codex_identity.overridden', { count: Object.keys(fields).length })
          : t('codex_identity.inherit')
      }
    >
      <div className={styles.actions}>
        <span className={styles.hint}>{t('codex_identity.priority_hint')}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || !Object.keys(fields).length}
          onClick={() => onChange(undefined)}
        >
          {t('codex_identity.reset')}
        </Button>
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <div className={styles.grid}>
        {codexIdentityBooleans.map((key) => (
          <div className={styles.field} key={key}>
            <label id={`${id}-${key}`}>{t(`codex_identity.${key}`)}</label>
            <Select
              ariaLabelledBy={`${id}-${key}`}
              value={fields[key] === undefined ? '' : String(fields[key])}
              disabled={disabled}
              options={[
                inherit,
                { value: 'true', label: t('codex_identity.on') },
                { value: 'false', label: t('codex_identity.off') },
              ]}
              onChange={(v) => set(key, v === '' ? undefined : v === 'true')}
            />
          </div>
        ))}
        <div className={styles.field}>
          <label id={`${id}-mode`}>{t('codex_identity.fingerprint-mode')}</label>
          <Select
            ariaLabelledBy={`${id}-mode`}
            value={fields['fingerprint-mode'] ?? ''}
            disabled={disabled}
            options={choices(
              ['off', 'device', 'session', 'full'],
              'auth_files.codex_fingerprint_modes'
            )}
            onChange={(v) => set('fingerprint-mode', v || undefined)}
          />
        </div>
        <Input
          label={t('codex_identity.session-identity-pool-size')}
          type="number"
          min={1}
          max={64}
          placeholder={t('codex_identity.inherit')}
          value={fields['session-identity-pool-size'] ?? ''}
          disabled={disabled}
          onChange={(e) =>
            set(
              'session-identity-pool-size',
              e.target.value === '' ? undefined : Number(e.target.value)
            )
          }
        />
        <div className={styles.full}>
          <Input
            label={t('codex_identity.user-agent')}
            placeholder={t('codex_identity.inherit')}
            value={fields['user-agent'] ?? ''}
            hint={t('codex_identity.ua_hint')}
            disabled={disabled}
            onChange={(e) => set('user-agent', e.target.value || undefined)}
          />
        </div>
        <div className={styles.field}>
          <label id={`${id}-turn`}>{t('codex_identity.turn-state-policy')}</label>
          <Select
            ariaLabelledBy={`${id}-turn`}
            value={fields['turn-state-policy'] ?? ''}
            disabled={disabled}
            options={choices(
              ['guard-cross-account', 'same-account-only', 'passthrough', 'strip'],
              'codex_identity.turn'
            )}
            onChange={(v) => set('turn-state-policy', v || undefined)}
          />
        </div>
      </div>
      <p className={styles.hint}>{t('codex_identity.migration')}</p>
    </SettingsDisclosure>
  );
}
