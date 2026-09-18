import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import { RUNTIME_PROVIDER_OPTIONS } from '@/utils/providers';
import {
  type ResponseModelRewriteConfig,
  type ResponseModelRule,
  responseModelRewriteError,
} from '@/utils/responseModelRewrite';
import { makeClientId } from '@/types/visualConfig';
import { ConfigHelp } from './ConfigHelp';
import { ConfigTable, ConfigTableRow, ConfigSummary } from './ConfigTable';
import { SettingsDisclosure } from './SettingsDisclosure';
import { TagListEditor } from './VisualConfigEditorBlocks';
import styles from './ResponseModelRewriteEditor.module.scss';

export function ResponseModelRewriteEditor({
  value,
  onChange,
  disabled,
  dirty,
  focusTarget,
}: {
  value: ResponseModelRewriteConfig;
  onChange: (value: ResponseModelRewriteConfig) => void;
  disabled?: boolean;
  dirty?: boolean;
  focusTarget?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`response_model_rewrite.${key}`);
  const update = (id: string, patch: Partial<ResponseModelRule>) =>
    onChange({
      ...value,
      rules: value.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    });
  const columns = [text('rule'), text('scope'), text('models'), t('common.action')];
  const invalid = responseModelRewriteError(value);
  return (
    <SettingsDisclosure
      id="config-response-model-rewrite"
      title={text('title')}
      focusTarget={focusTarget}
      dirty={dirty}
      errorCount={invalid ? 1 : 0}
      summary={value.enabled ? text('enabled') : text('disabled')}
    >
      <div className={styles.toolbar}>
        <ToggleSwitch
          checked={value.enabled}
          disabled={disabled}
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
                  requestModels: [],
                },
              ],
            })
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
                rule.requestModels.join(', ') || text('all'),
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
                {(['providers', 'authPriorities', 'credentialIds', 'requestModels'] as const).map(
                  (field, position) => {
                    const label = text(
                      ['providers', 'priorities', 'credentials', 'models'][position]
                    );
                    return (
                      <div key={field} className={styles.field}>
                        <strong>{label}</strong>
                        <TagListEditor
                          value={rule[field]}
                          disabled={disabled}
                          emptyLabel={text('all')}
                          inputAriaLabel={`${label} #${index + 1}`}
                          placeholder={
                            ['codex, xai', '0, 3', '49774c8fe3421e55', 'gpt-6-astra, grok-*'][
                              position
                            ]
                          }
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
            </ConfigTableRow>
          ))}
        </ConfigTable>
      ) : (
        <div className="hint">{text('no_rules')}</div>
      )}
    </SettingsDisclosure>
  );
}
