import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import { makeClientId } from '@/types/visualConfig';
import {
  CODEX_SERVICE_TIERS,
  codexServiceTiersError,
  type CodexServiceTierRule,
} from '@/utils/codexServiceTiers';
import { SettingsDisclosure } from './SettingsDisclosure';
import { TagListEditor } from './VisualConfigEditorBlocks';
import styles from './CodexServiceTiersEditor.module.scss';

export function CodexServiceTiersEditor({
  rules,
  enabled,
  disabled,
  dirty,
  focusTarget,
  onChange,
}: {
  rules: CodexServiceTierRule[];
  enabled: boolean;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
  onChange: (rules: CodexServiceTierRule[]) => void;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_service_tiers.${key}`);
  const update = (id: string, patch: Partial<CodexServiceTierRule>) =>
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  const invalid = codexServiceTiersError(rules);
  return (
    <SettingsDisclosure
      id="config-codex-service-tier-rules"
      title={text('title')}
      description={text('description')}
      focusTarget={focusTarget}
      dirty={dirty}
      errorCount={invalid ? 1 : 0}
      summary={
        enabled ? t('codex_service_tiers.rule_count', { count: rules.length }) : text('inactive')
      }
    >
      <div className={styles.content}>
        {!enabled && <p className="hint">{text('requires_enabled')}</p>}
        <p className="hint">{text('availability')}</p>
        <div className={styles.toolbar}>
          <span className="hint">{text('inherit')}</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || rules.length >= 64}
            onClick={() =>
              onChange([
                ...rules,
                { id: makeClientId(), models: [], tiers: [], defaultTier: 'default' },
              ])
            }
          >
            <IconPlus size={15} />
            {text('add')}
          </Button>
        </div>
        {invalid && (
          <div role="alert" className="error-box">
            {text('invalid')}
          </div>
        )}
        {rules.map((rule, index) => (
          <div className={styles.rule} key={rule.id}>
            <div className={styles.ruleHeader}>
              <strong>{t('codex_service_tiers.rule', { number: index + 1 })}</strong>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                aria-label={t('codex_service_tiers.remove', { number: index + 1 })}
                onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
              >
                <IconTrash2 size={16} />
              </Button>
            </div>
            <div className={styles.fields}>
              <div className={styles.defaultField}>
                <label htmlFor={`tier-models-${rule.id}`}>{text('models')}</label>
                <TagListEditor
                  inputId={`tier-models-${rule.id}`}
                  inputAriaLabel={text('models')}
                  value={rule.models}
                  disabled={disabled}
                  placeholder={text('models_placeholder')}
                  onChange={(models) => update(rule.id, { models })}
                />
                <p className="hint">{text('models_help')}</p>
              </div>
              <div className={styles.defaultField}>
                <label htmlFor={`tier-default-${rule.id}`}>{text('default_label')}</label>
                <Select
                  id={`tier-default-${rule.id}`}
                  value={rule.defaultTier}
                  disabled={disabled}
                  options={['default', ...rule.tiers].map((value) => ({
                    value,
                    label: text(value),
                  }))}
                  onChange={(defaultTier) => update(rule.id, { defaultTier })}
                />
                <p className="hint">{text('default_help')}</p>
              </div>
            </div>
            <div className={styles.tiers} role="group" aria-label={text('choices')}>
              <ToggleSwitch label={text('default')} checked disabled onChange={() => {}} />
              {CODEX_SERVICE_TIERS.map((tier) => (
                <ToggleSwitch
                  key={tier}
                  label={text(tier)}
                  checked={rule.tiers.includes(tier)}
                  disabled={disabled}
                  onChange={(checked) =>
                    update(rule.id, {
                      tiers: checked
                        ? [...rule.tiers, tier]
                        : rule.tiers.filter((item) => item !== tier),
                      defaultTier:
                        !checked && rule.defaultTier === tier ? 'default' : rule.defaultTier,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SettingsDisclosure>
  );
}
