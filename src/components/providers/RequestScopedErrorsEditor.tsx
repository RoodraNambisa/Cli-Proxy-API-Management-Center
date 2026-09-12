import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigTable, ConfigTableRow, ConfigSummary } from '@/components/config/ConfigTable';
import { ConfigHelp } from '@/components/config/ConfigHelp';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import { REQUEST_SCOPED_ERROR_ACTIONS, type RequestScopedErrorRule } from '@/types/requestScopedErrors';
import { validateRequestScopedErrorRule } from '@/utils/requestScopedErrors';
import styles from './RequestScopedErrorsEditor.module.scss';

export function RequestScopedErrorsEditor({ value = [], onChange, disabled = false }: {
  value?: RequestScopedErrorRule[];
  onChange: (value: RequestScopedErrorRule[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(() => {
    const invalid = value.findIndex((rule) => validateRequestScopedErrorRule(rule));
    return invalid >= 0 ? invalid : null;
  });
  const update = (index: number, patch: Partial<RequestScopedErrorRule>) =>
    onChange(value.map((rule, current) => current === index ? { ...rule, ...patch } : rule));
  const move = (index: number, direction: number) => {
    const next = [...value];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setExpandedIndex((current) => current === index ? index + direction : current === index + direction ? index : current);
    onChange(next);
  };
  const remove = (index: number) => {
    setExpandedIndex((current) => current === null || current < index ? current : current === index ? null : current - 1);
    onChange(value.filter((_, current) => current !== index));
  };
  return (
    <div className={styles.editor}>
      <ConfigHelp title={t('request_scoped_errors.title')} text={t('request_scoped_errors.rules_hint')} />
      {value.length === 0 && <div className="hint">{t('request_scoped_errors.empty')}</div>}
      {value.length > 0 && <ConfigTable numbered label={t('request_scoped_errors.title')} columns={[
        t('config_management.visual.common.rule_column'), t('config_management.visual.common.match_column'),
        t('request_scoped_errors.action'), t('config_management.visual.common.actions'),
      ]}>
      {value.map((rule, index) => {
        const issue = validateRequestScopedErrorRule(rule);
        return (
          <ConfigTableRow key={index} title={t('request_scoped_errors.rule', { index: index + 1 })}
            invalid={Boolean(issue)} expanded={expandedIndex === index}
            onExpandedChange={(expanded) => setExpandedIndex(expanded ? index : null)}
            labels={[t('config_management.visual.common.rule_column'), t('config_management.visual.common.match_column'), t('request_scoped_errors.action')]}
            cells={[
              <strong>#{index + 1}</strong>,
              <ConfigSummary entries={[
                ['HTTP', rule.status === undefined ? undefined : String(rule.status)],
                ['match', rule.match?.join(' · ')], ['regex', rule.matchRegexr?.join(' · ')],
              ]} />,
              REQUEST_SCOPED_ERROR_ACTIONS.includes(rule.action as typeof REQUEST_SCOPED_ERROR_ACTIONS[number])
                ? t(`request_scoped_errors.actions.${rule.action}`) : rule.action || '—',
            ]}
            actions={<>
              <Button type="button" size="sm" variant="ghost" aria-label={t('common.move_up')} title={t('common.move_up')} disabled={disabled || index === 0} onClick={() => move(index, -1)}><IconChevronUp size={14} /></Button>
              <Button type="button" size="sm" variant="ghost" aria-label={t('common.move_down')} title={t('common.move_down')} disabled={disabled || index === value.length - 1} onClick={() => move(index, 1)}><IconChevronDown size={14} /></Button>
              <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => remove(index)}>{t('request_scoped_errors.remove_rule')}</Button>
            </>}
          >
          <fieldset className={styles.rule} disabled={disabled} aria-label={t('request_scoped_errors.rule', { index: index + 1 })}>
            <div className={styles.fields}>
              <Input
                label={t('request_scoped_errors.status')}
                type="number" min={100} max={599} step={1}
                value={rule.status !== undefined && Number.isFinite(rule.status) ? rule.status : ''}
                disabled={disabled}
                error={issue === 'status' ? t('request_scoped_errors.invalid_status') : undefined}
                onChange={(event) => update(index, { status: event.currentTarget.validity.badInput ? NaN : event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value) })}
              />
              <div className="form-group">
                <label>{t('request_scoped_errors.action')}</label>
                <Select
                  ariaLabel={t('request_scoped_errors.action')}
                  value={(rule.action ?? '').trim().toLowerCase()}
                  options={REQUEST_SCOPED_ERROR_ACTIONS.map((action) => ({ value: action, label: t(`request_scoped_errors.actions.${action}`) }))}
                  placeholder={t('request_scoped_errors.choose_action')}
                  disabled={disabled}
                  onChange={(action) => update(index, { action })}
                />
                {issue === 'action' && <div className="error-box">{t('request_scoped_errors.invalid_action')}</div>}
              </div>
            </div>
            {(['match', 'matchRegexr'] as const).map((field) => (
              <div className={styles.patterns} key={field}>
                <div className={styles.patternHeader}>
                  <span>{t(`request_scoped_errors.${field}`)}</span>
                  <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => update(index, { [field]: [...(rule[field] ?? []), ''] })}>{t(`request_scoped_errors.add_${field}`)}</Button>
                </div>
                {(rule[field] ?? []).map((pattern, patternIndex) => (
                  <div className={styles.patternRow} key={patternIndex}>
                    <textarea className="input" rows={2} value={pattern} disabled={disabled}
                      aria-label={t(`request_scoped_errors.${field}`) + ' ' + (patternIndex + 1)}
                      onChange={(event) => update(index, { [field]: rule[field]!.map((old, current) => current === patternIndex ? event.currentTarget.value : old) })}
                    />
                    <Button type="button" size="sm" variant="ghost" disabled={disabled}
                      aria-label={t('request_scoped_errors.remove_pattern', { index: patternIndex + 1 })}
                      onClick={() => update(index, { [field]: rule[field]!.filter((_, current) => current !== patternIndex) })}
                    >{t('common.delete')}</Button>
                  </div>
                ))}
              </div>
            ))}
            {issue === 'match' && <div className="error-box">{t('request_scoped_errors.invalid_match')}</div>}
          </fieldset>
          </ConfigTableRow>
        );
      })}
      </ConfigTable>}
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setExpandedIndex(value.length); onChange([...value, { status: 500, action: 'stop', match: [] }]); }}>{t('request_scoped_errors.add_rule')}</Button>
    </div>
  );
}

export function CredentialRequestScopedErrorsEditor(props: Parameters<typeof RequestScopedErrorsEditor>[0]) {
  const { t } = useTranslation();
  return <section className="form-group" aria-label={t('request_scoped_errors.title')}>
    <h3>{t('request_scoped_errors.title')}</h3>
    <div className="hint">{t('request_scoped_errors.credential_hint')}</div>
    <RequestScopedErrorsEditor {...props} />
  </section>;
}
