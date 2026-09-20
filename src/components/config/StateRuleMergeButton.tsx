import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { StateSettingsSummary } from './StateRuleModelOverrides';
import {
  inheritedStateSettings,
  mergeStateRules,
  sameStateValue,
} from '@/utils/codexStateModelRules';
import {
  codexStateError,
  type CodexStateOverride,
  type CodexStateRule,
} from '@/utils/codexStateOverride';
import styles from './CodexStateEditor.module.scss';

export function StateRuleMergeButton({
  value,
  index,
  onChange,
  disabled,
  supported,
  aliases,
}: {
  value: CodexStateOverride;
  index: number;
  onChange: (rules: CodexStateRule[]) => void;
  disabled?: boolean;
  supported: boolean;
  aliases: Array<{ id: string; upstream_id: string }>;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const [openedValue, setOpenedValue] = useState<CodexStateOverride>();
  const [inheritLengths, setInheritLengths] = useState(false);
  const open = openedValue === value;
  const setOpen = (next: boolean) => {
    setOpenedValue(next ? value : undefined);
    if (next) setInheritLengths(false);
  };
  const rules = value.rules ?? [],
    first = rules[index],
    second = rules[index + 1];
  if (!first || !second) return null;
  const candidate = mergeStateRules(first, second);
  const aliasRisk = [
    ...first.models,
    ...second.models,
    ...[...(first['model-overrides'] ?? []), ...(second['model-overrides'] ?? [])].flatMap(
      (x) => x.models
    ),
  ].some((m) => aliases.some((a) => a.id === m && a.upstream_id !== m));
  const safe = candidate && !aliasRisk && !codexStateError({ ...value, rules: [candidate.rule] });
  const commonLength = safe ? candidate.rule.settings.lengths : undefined;
  const equalLength =
    !value['plan-lengths'].length &&
    candidate?.rows.some(
      (row) =>
        row.settings.lengths !== undefined &&
        sameStateValue(row.settings.lengths, inheritedStateSettings(value, {}, row.model).lengths)
    );
  const merged = candidate ? structuredClone(candidate.rule) : undefined;
  if (merged && inheritLengths) {
    if (
      commonLength !== undefined &&
      merged.models.every((m) =>
        sameStateValue(commonLength, inheritedStateSettings(value, {}, m).lengths)
      )
    )
      delete merged.settings.lengths;
    for (const item of merged['model-overrides'] ?? [])
      if (
        item.settings.lengths !== undefined &&
        item.models.every((m) =>
          sameStateValue(item.settings.lengths, inheritedStateSettings(value, {}, m).lengths)
        )
      )
        delete item.settings.lengths;
  }
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || !supported}
        onClick={() => setOpen(true)}
      >
        {text('model_merge_next')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={text('model_merge_title')}
        width={850}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={disabled || !supported || !safe}
              onClick={() => {
                if (merged) {
                  onChange([...rules.slice(0, index), merged, ...rules.slice(index + 2)]);
                  setOpen(false);
                }
              }}
            >
              {text('model_merge_apply')}
            </Button>
          </>
        }
      >
        {!safe ? (
          <p role="alert">{text('model_merge_unsupported')}</p>
        ) : (
          <>
            <p>{text('model_merge_hint')}</p>
            <p>
              {first.name || first.id} + {second.name || second.id}
            </p>
            {equalLength && (
              <ToggleSwitch
                label={text('model_merge_inherit_lengths')}
                checked={inheritLengths}
                onChange={setInheritLengths}
              />
            )}
            {inheritLengths && <p className="hint">{text('model_merge_inherit_warning')}</p>}
            <div className={styles.modelTable}>
              <table>
                <thead>
                  <tr>
                    <th>{text('override_model')}</th>
                    <th>{text('model_merge_before')}</th>
                    <th>{text('model_merge_after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidate.rows.map((row) => {
                    const override = merged?.['model-overrides']?.find((item) =>
                      item.models.includes(row.model)
                    );
                    return (
                      <tr key={row.model}>
                        <td>{row.model}</td>
                        <td>
                          {row.from}
                          <StateSettingsSummary
                            settings={row.settings}
                            inherited={value}
                            model={row.model}
                          />
                        </td>
                        <td>
                          <StateSettingsSummary
                            settings={{ ...merged?.settings, ...override?.settings }}
                            inherited={value}
                            model={row.model}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
