import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import { RUNTIME_PROVIDER_OPTIONS } from '@/utils/providers';
import {
  type CodexQuotaAutoDisableConfig,
  type CodexQuotaDisableRule,
  codexQuotaAutoDisableError,
  quotaThresholdError,
} from '@/utils/codexQuotaAutoDisable';
import { makeClientId } from '@/types/visualConfig';
import { ConfigHelp } from './ConfigHelp';
import { ConfigTable, ConfigTableRow, ConfigSummary } from './ConfigTable';
import { SettingsDisclosure } from './SettingsDisclosure';
import { TagListEditor } from './VisualConfigEditorBlocks';
import styles from './CodexQuotaAutoDisableEditor.module.scss';

export function CodexQuotaAutoDisableEditor({
  value,
  observing,
  onChange,
  disabled,
  dirty,
  focusTarget,
}: {
  value: CodexQuotaAutoDisableConfig;
  observing: boolean;
  onChange: (value: CodexQuotaAutoDisableConfig) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_quota_auto_disable.${key}`);
  const update = (id: string, patch: Partial<CodexQuotaDisableRule>) =>
    onChange({
      ...value,
      rules: value.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  const columns = [text('rule'), text('scope'), text('thresholds'), t('common.action')];
  const invalid = codexQuotaAutoDisableError(value);
  const summary = value.enabled ? text(observing ? 'enabled' : 'paused') : text('disabled');
  return (
    <SettingsDisclosure
      id="config-codex-quota-auto-disable"
      title={text('title')}
      focusTarget={focusTarget}
      dirty={dirty}
      errorCount={invalid ? 1 : 0}
      summary={summary}
    >
      <div className={styles.toolbar}>
        <ToggleSwitch
          checked={value.enabled}
          disabled={disabled || (!observing && !value.enabled)}
          label={text('enabled')}
          onChange={(enabled) => onChange({ ...value, enabled })}
        />
        <ConfigHelp compact title={text('title')} text={text('help')} />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || value.rules.length >= 128}
          onClick={() =>
            onChange({
              ...value,
              rules: [
                ...value.rules,
                {
                  id: makeClientId(),
                  providers: ['codex'],
                  authPriorities: [],
                  credentialIds: [],
                  weeklyRemainingPercent: '',
                  fiveHourRemainingPercent: '',
                },
              ],
            })
          }
        >
          <IconPlus size={15} />
          {text('add')}
        </Button>
      </div>
      {!observing && <p className="hint">{text('requires_observation')}</p>}
      <p className="hint">{text('window_help')}</p>
      {invalid && (
        <div role="alert" className="error-box">
          {text('invalid')}
        </div>
      )}
      {value.rules.length ? (
        <ConfigTable label={text('title')} numbered columns={columns}>
          {value.rules.map((rule, index) => (
            <ConfigTableRow
              key={rule.id}
              title={`#${index + 1}`}
              labels={columns}
              initialExpanded={rule.sourceIndex === undefined}
              cells={[
                `#${index + 1}`,
                <ConfigSummary
                  entries={[
                    [text('providers'), rule.providers.join(', ')],
                    [text('priorities'), rule.authPriorities.join(', ')],
                    [text('credentials'), rule.credentialIds.join(', ')],
                  ]}
                  empty={text('all')}
                />,
                <ConfigSummary
                  entries={[
                    [
                      text('weekly'),
                      rule.weeklyRemainingPercent.trim()
                        ? `< ${rule.weeklyRemainingPercent}%`
                        : text('ignored'),
                    ],
                    [
                      text('five_hour'),
                      rule.fiveHourRemainingPercent.trim()
                        ? `< ${rule.fiveHourRemainingPercent}%`
                        : text('ignored'),
                    ],
                  ]}
                />,
              ]}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  title={t('common.delete')}
                  aria-label={`${t('common.delete')} #${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...value,
                      rules: value.rules.filter((entry) => entry.id !== rule.id),
                    })
                  }
                >
                  <IconTrash2 size={16} />
                </Button>
              }
            >
              <div className={styles.fields}>
                {(['providers', 'authPriorities', 'credentialIds'] as const).map(
                  (field, position) => {
                    const label = text(['providers', 'priorities', 'credentials'][position]);
                    return (
                      <div key={field} className={styles.field}>
                        <strong>{label}</strong>
                        <TagListEditor
                          value={rule[field]}
                          disabled={disabled}
                          emptyLabel={text('all')}
                          inputAriaLabel={`${label} #${index + 1}`}
                          placeholder={['codex', '0, 3', '49774c8fe3421e55'][position]}
                          suggestionOptions={
                            field === 'providers' ? RUNTIME_PROVIDER_OPTIONS : undefined
                          }
                          suggestionButtonLabel={field === 'providers' ? text('choose') : undefined}
                          suggestionTitle={field === 'providers' ? label : undefined}
                          onChange={(next) => update(rule.id, { [field]: next })}
                        />
                      </div>
                    );
                  }
                )}
              </div>
              <div className={styles.thresholds}>
                {(['weeklyRemainingPercent', 'fiveHourRemainingPercent'] as const).map(
                  (field, position) => (
                    <Input
                      key={field}
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      disabled={disabled}
                      label={text(position === 0 ? 'weekly_threshold' : 'five_hour_threshold')}
                      placeholder={text('ignored')}
                      value={rule[field]}
                      hint={text('threshold_help')}
                      error={quotaThresholdError(rule[field]) ? text('range_error') : undefined}
                      onChange={(event) => update(rule.id, { [field]: event.target.value })}
                    />
                  )
                )}
              </div>
            </ConfigTableRow>
          ))}
        </ConfigTable>
      ) : (
        <div className="hint">{text('no_rules')}</div>
      )}
    </SettingsDisclosure>
  );
}
