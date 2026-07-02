import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash2 } from '@/components/ui/icons';
import { useNotificationStore } from '@/stores';
import styles from './VisualConfigEditor.module.scss';
import { copyToClipboard } from '@/utils/clipboard';
import type {
  CodexCustomModelValidationErrors,
  CodexCustomModelVisualEntry,
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValidationErrorCode,
  PayloadParamValueType,
  PayloadRule,
  VisualConfigValidationErrorCode,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import { CODEX_CUSTOM_MODEL_GROUPS, type CodexCustomModelGroup } from '@/types/config';
import {
  getCodexCustomModelValidationErrors,
  getPayloadParamValidationError,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from '@/hooks/useVisualConfig';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';

/** Minimum character count before the expand/collapse toggle appears. */
const EXPAND_THRESHOLD = 30;

/** Auto-expanding textarea that collapses back to a single-line input on demand. */
function ExpandableInput({
  value,
  placeholder,
  ariaLabel,
  disabled,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Strip newlines — these fields are single-line identifiers/paths that
    // would break YAML serialization if they contained line breaks.
    const sanitized = e.target.value.replace(/[\r\n]/g, '');
    onChange(sanitized);
    // autoResize is handled by useLayoutEffect after React syncs the
    // sanitized value back to the DOM — calling it here would measure
    // stale content.
  };

  // Resize synchronously before paint to avoid visual flicker.
  useLayoutEffect(() => {
    if (!collapsed && textareaRef.current) {
      autoResize(textareaRef.current);
    }
  }, [collapsed, value, autoResize]);

  if (collapsed) {
    return (
      <div className={styles.expandableInputWrapper}>
        <input
          className={`input ${className ?? ''}`}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ''))}
          disabled={disabled}
        />
        {value.length > EXPAND_THRESHOLD && (
          <button
            type="button"
            className={styles.expandableToggle}
            disabled={disabled}
            onClick={() => {
              setCollapsed(false);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
              });
            }}
            title={t('common.expand')}
            aria-label={t('common.expand')}
          >
            ▼
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.expandableInputWrapper} ${styles.expandableInputExpanded}`}>
      <textarea
        ref={textareaRef}
        className={`input ${styles.expandableTextarea} ${className ?? ''}`}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        rows={2}
      />
      <button
        type="button"
        className={styles.expandableToggle}
        disabled={disabled}
        onClick={() => setCollapsed(true)}
        title={t('common.collapse')}
        aria-label={t('common.collapse')}
      >
        ▲
      </button>
    </div>
  );
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: PayloadParamValidationErrorCode | VisualConfigValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

function buildProtocolOptions(
  t: ReturnType<typeof useTranslation>['t'],
  rules: Array<{ models: PayloadModelEntry[] }>
) {
  const options: Array<{ value: string; label: string }> = VISUAL_CONFIG_PROTOCOL_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: t(option.labelKey, { defaultValue: option.defaultLabel }),
    })
  );
  const seen = new Set<string>(options.map((option) => option.value));

  for (const rule of rules) {
    for (const model of rule.models) {
      const protocol = model.protocol;
      if (!protocol || !protocol.trim() || seen.has(protocol)) continue;
      seen.add(protocol);
      options.push({ value: protocol, label: protocol });
    }
  }

  return options;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (apiKeyIds.length === apiKeys.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeys.length) return apiKeyIds.slice(0, apiKeys.length);
    return [
      ...apiKeyIds,
      ...Array.from({ length: apiKeys.length - apiKeyIds.length }, () => makeClientId()),
    ];
  }, [apiKeyIds, apiKeys.length]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState('');

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(17);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const openAddModal = () => {
    setEditingApiKeyId(null);
    setInputValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKeys[editingIndex] ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join('\n'));
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    updateApiKeys(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.api_keys.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {apiKeys.map((key, index) => (
            <div key={renderApiKeyIds[index] ?? `${key}-${index}`} className="item-row">
              <div className="item-meta">
                <div className="pill">#{index + 1}</div>
                <div className="item-title">
                  {t('config_management.visual.api_keys.input_label')}
                </div>
                <div className="item-subtitle">{maskApiKey(String(key || ''))}</div>
              </div>
              <div className="item-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopy(key)}
                  disabled={disabled}
                >
                  {t('common.copy')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.edit')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingApiKeyId !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingApiKeyId !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>
            {t('config_management.visual.api_keys.input_label')}
          </label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <div id={apiKeyHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
});

export const StringListEditor = memo(function StringListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const items = value.length ? value : [];
  const [itemIds, setItemIds] = useState(() => items.map(() => makeClientId()));
  const renderItemIds = useMemo(() => {
    if (itemIds.length === items.length) return itemIds;
    if (itemIds.length > items.length) return itemIds.slice(0, items.length);
    return [
      ...itemIds,
      ...Array.from({ length: items.length - itemIds.length }, () => makeClientId()),
    ];
  }, [itemIds, items.length]);

  const updateItem = (index: number, nextValue: string) =>
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  const addItem = () => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  };
  const removeItem = (index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.stringList}>
      {items.map((item, index) => (
        <div key={renderItemIds[index] ?? `item-${index}`} className={styles.stringListRow}>
          <ExpandableInput
            placeholder={placeholder}
            ariaLabel={inputAriaLabel ?? placeholder}
            value={item}
            onChange={(nextValue) => updateItem(index, nextValue)}
            disabled={disabled}
          />
          <Button variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={disabled}>
            {t('config_management.visual.common.delete')}
          </Button>
        </div>
      ))}
      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addItem} disabled={disabled}>
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});

export const TagListEditor = memo(function TagListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  emptyLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  emptyLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const items = useMemo(() => value.map((item) => item.trim()).filter(Boolean), [value]);

  const emitChange = (next: string[]) => {
    const seen = new Set<string>();
    onChange(
      next.reduce<string[]>((result, item) => {
        const trimmed = item.trim();
        if (!trimmed) return result;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return result;
        seen.add(key);
        result.push(trimmed);
        return result;
      }, [])
    );
  };
  const addDraft = () => {
    const nextItems = draft
      .split(/[,，\n\r]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (nextItems.length === 0) return;
    emitChange([...items, ...nextItems]);
    setDraft('');
  };
  const removeItem = (index: number) => {
    emitChange(items.filter((_, itemIndex) => itemIndex !== index));
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    emitChange(next);
  };

  return (
    <div className={styles.tagListEditor}>
      <div className={styles.tagListChips}>
        {items.length === 0 ? (
          <div className={styles.tagListEmpty}>{emptyLabel ?? '-'}</div>
        ) : (
          items.map((item, index) => (
            <span key={`${item}-${index}`} className={styles.tagChip}>
              <span className={styles.tagChipText}>{item}</span>
              <span className={styles.tagChipActions}>
                <button
                  type="button"
                  className={styles.tagChipAction}
                  disabled={disabled || index === 0}
                  onClick={() => moveItem(index, -1)}
                  title={t('common.move_up')}
                  aria-label={t('common.move_up')}
                >
                  <IconChevronUp size={13} />
                </button>
                <button
                  type="button"
                  className={styles.tagChipAction}
                  disabled={disabled || index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  title={t('common.move_down')}
                  aria-label={t('common.move_down')}
                >
                  <IconChevronDown size={13} />
                </button>
                <button
                  type="button"
                  className={`${styles.tagChipAction} ${styles.tagChipDelete}`}
                  disabled={disabled}
                  onClick={() => removeItem(index)}
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  <IconTrash2 size={13} />
                </button>
              </span>
            </span>
          ))
        )}
      </div>
      <div className={styles.tagListInputRow}>
        <input
          className="input"
          value={draft}
          placeholder={placeholder}
          aria-label={inputAriaLabel ?? placeholder}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value.replace(/[\r\n]/g, ','))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addDraft();
            }
          }}
          onBlur={addDraft}
        />
        <Button type="button" variant="secondary" size="sm" onClick={addDraft} disabled={disabled}>
          <IconPlus size={14} />
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
});

export const CodexCustomModelsEditor = memo(function CodexCustomModelsEditor({
  value,
  validationErrors,
  disabled,
  onChange,
}: {
  value: CodexCustomModelVisualEntry[];
  validationErrors?: CodexCustomModelValidationErrors;
  disabled?: boolean;
  onChange: (next: CodexCustomModelVisualEntry[]) => void;
}) {
  const { t } = useTranslation();
  const models = value;
  const effectiveValidationErrors = useMemo(
    () => validationErrors ?? getCodexCustomModelValidationErrors(models),
    [models, validationErrors]
  );
  const groupOptions = useMemo(
    () =>
      CODEX_CUSTOM_MODEL_GROUPS.map((group) => ({
        value: group,
        label: t(`config_management.visual.codex_custom_models.groups_options.${group}`),
      })),
    [t]
  );

  const addModel = () =>
    onChange([
      ...models,
      {
        clientId: makeClientId(),
        id: '',
        displayName: '',
        groups: [],
      },
    ]);

  const removeModel = (clientId: string) =>
    onChange(models.filter((model) => model.clientId !== clientId));

  const updateModel = (clientId: string, patch: Partial<CodexCustomModelVisualEntry>) =>
    onChange(models.map((model) => (model.clientId === clientId ? { ...model, ...patch } : model)));

  const toggleGroup = (clientId: string, group: CodexCustomModelGroup, checked: boolean) => {
    const current = models.find((model) => model.clientId === clientId);
    if (!current) return;

    const nextGroups = checked
      ? CODEX_CUSTOM_MODEL_GROUPS.filter((item) => [...current.groups, group].includes(item))
      : current.groups.filter((item) => item !== group);

    updateModel(clientId, { groups: nextGroups });
  };

  return (
    <div className={styles.blockStack}>
      {models.map((model, index) => {
        const errors = effectiveValidationErrors[model.clientId];
        const idError = getValidationMessage(t, errors?.id);
        const groupsError = getValidationMessage(t, errors?.groups);

        return (
          <div key={model.clientId} className={styles.ruleCard}>
            <div className={styles.ruleCardHeader}>
              <div className={styles.ruleCardTitle}>
                {t('config_management.visual.codex_custom_models.item_title', {
                  index: index + 1,
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeModel(model.clientId)}
                disabled={disabled}
              >
                {t('config_management.visual.common.delete')}
              </Button>
            </div>

            <div className={styles.codexCustomModelFieldGrid}>
              <div className="form-group">
                <label>{t('config_management.visual.codex_custom_models.id')}</label>
                <ExpandableInput
                  placeholder={t('config_management.visual.codex_custom_models.id_placeholder')}
                  ariaLabel={t('config_management.visual.codex_custom_models.id')}
                  value={model.id}
                  onChange={(nextValue) => updateModel(model.clientId, { id: nextValue })}
                  disabled={disabled}
                />
                {idError ? <div className="error-box">{idError}</div> : null}
              </div>

              <div className="form-group">
                <label>{t('config_management.visual.codex_custom_models.display_name')}</label>
                <ExpandableInput
                  placeholder={t(
                    'config_management.visual.codex_custom_models.display_name_placeholder'
                  )}
                  ariaLabel={t('config_management.visual.codex_custom_models.display_name')}
                  value={model.displayName}
                  onChange={(nextValue) => updateModel(model.clientId, { displayName: nextValue })}
                  disabled={disabled}
                />
                <div className="hint">
                  {t('config_management.visual.codex_custom_models.display_name_hint')}
                </div>
              </div>
            </div>

            <div className={styles.blockStack}>
              <div className={styles.blockLabel}>
                {t('config_management.visual.codex_custom_models.groups')}
              </div>
              <div className={styles.codexCustomModelGroups}>
                {groupOptions.map((option) => (
                  <SelectionCheckbox
                    key={option.value}
                    checked={model.groups.includes(option.value)}
                    onChange={(checked) => toggleGroup(model.clientId, option.value, checked)}
                    label={option.label}
                    ariaLabel={option.label}
                    disabled={disabled}
                    className={styles.codexCustomModelGroupOption}
                    labelClassName={styles.codexCustomModelGroupLabel}
                  />
                ))}
              </div>
              <div className="hint">
                {t('config_management.visual.codex_custom_models.groups_hint')}
              </div>
              {groupsError ? <div className="error-box">{groupsError}</div> : null}
            </div>
          </div>
        );
      })}

      {models.length === 0 ? (
        <div className={styles.emptyState}>
          {t('config_management.visual.codex_custom_models.empty')}
        </div>
      ) : null}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addModel} disabled={disabled}>
          {t('config_management.visual.codex_custom_models.add')}
        </Button>
      </div>
    </div>
  );
});

export const PayloadRulesEditor = memo(function PayloadRulesEditor({
  value,
  disabled,
  protocolFirst = false,
  rawJsonValues = false,
  onChange,
}: {
  value: PayloadRule[];
  disabled?: boolean;
  protocolFirst?: boolean;
  rawJsonValues?: boolean;
  onChange: (next: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);
  const payloadValueTypeOptions = useMemo(
    () =>
      VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );
  const booleanValueOptions = useMemo(
    () => [
      { value: 'true', label: t('config_management.visual.payload_rules.boolean_true') },
      { value: 'false', label: t('config_management.visual.payload_rules.boolean_false') },
    ],
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextParam: PayloadParamEntry = {
      id: makeClientId(),
      path: '',
      valueType: rawJsonValues ? 'json' : 'string',
      value: '',
    };
    updateRule(ruleIndex, { params: [...rule.params, nextParam] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (
    ruleIndex: number,
    paramIndex: number,
    patch: Partial<PayloadParamEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
    });
  };

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    switch (valueType) {
      case 'string':
        return t('config_management.visual.payload_rules.value_string');
      case 'number':
        return t('config_management.visual.payload_rules.value_number');
      case 'boolean':
        return t('config_management.visual.payload_rules.value_boolean');
      case 'json':
        return t('config_management.visual.payload_rules.value_json');
      default:
        return t('config_management.visual.payload_rules.value_default');
    }
  };

  const getParamErrorMessage = (param: PayloadParamEntry) => {
    const errorCode = getPayloadParamValidationError(
      rawJsonValues ? { ...param, valueType: 'json' } : param
    );
    return getValidationMessage(t, errorCode);
  };

  const renderParamValueEditor = (
    ruleIndex: number,
    paramIndex: number,
    param: PayloadParamEntry
  ) => {
    if (rawJsonValues) {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={t('config_management.visual.payload_rules.value_raw_json')}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) =>
            updateParam(ruleIndex, paramIndex, { value: e.target.value, valueType: 'json' })
          }
          disabled={disabled}
        />
      );
    }

    if (param.valueType === 'boolean') {
      return (
        <Select
          value={
            param.value.toLowerCase() === 'true' || param.value.toLowerCase() === 'false'
              ? param.value.toLowerCase()
              : ''
          }
          options={booleanValueOptions}
          placeholder={t('config_management.visual.payload_rules.value_boolean')}
          disabled={disabled}
          ariaLabel={t('config_management.visual.payload_rules.param_value')}
          onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        />
      );
    }

    if (param.valueType === 'json') {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={getValuePlaceholder(param.valueType)}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
          disabled={disabled}
        />
      );
    }

    return (
      <ExpandableInput
        placeholder={getValuePlaceholder(param.valueType)}
        ariaLabel={t('config_management.visual.payload_rules.param_value')}
        value={param.value}
        onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
            >
              {t('config_management.visual.common.delete')}
            </Button>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.models')}
            </div>
            {(rule.models.length ? rule.models : []).map((model, modelIndex) => (
              <div
                key={model.id}
                className={[
                  styles.payloadRuleModelRow,
                  protocolFirst ? styles.payloadRuleModelRowProtocolFirst : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {protocolFirst ? (
                  <>
                    <Select
                      value={model.protocol ?? ''}
                      options={protocolOptions}
                      disabled={disabled}
                      ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, {
                          protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                        })
                      }
                    />
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.model_name')}
                      ariaLabel={t('config_management.visual.payload_rules.model_name')}
                      value={model.name}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, { name: nextValue })
                      }
                      disabled={disabled}
                    />
                  </>
                ) : (
                  <>
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.model_name')}
                      ariaLabel={t('config_management.visual.payload_rules.model_name')}
                      value={model.name}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, { name: nextValue })
                      }
                      disabled={disabled}
                    />
                    <Select
                      value={model.protocol ?? ''}
                      options={protocolOptions}
                      disabled={disabled}
                      ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, {
                          protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                        })
                      }
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => removeModel(ruleIndex, modelIndex)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.params')}
            </div>
            {(rule.params.length ? rule.params : []).map((param, paramIndex) => {
              const paramError = getParamErrorMessage(param);

              return (
                <div key={param.id} className={styles.payloadRuleParamGroup}>
                  <div className={styles.payloadRuleParamRow}>
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.json_path')}
                      ariaLabel={t('config_management.visual.payload_rules.json_path')}
                      value={param.path}
                      onChange={(nextValue) =>
                        updateParam(ruleIndex, paramIndex, { path: nextValue })
                      }
                      disabled={disabled}
                    />
                    {rawJsonValues ? null : (
                      <Select
                        value={param.valueType}
                        options={payloadValueTypeOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.param_type')}
                        onChange={(nextValue) =>
                          updateParam(ruleIndex, paramIndex, {
                            valueType: nextValue as PayloadParamValueType,
                            value:
                              nextValue === 'boolean'
                                ? 'true'
                                : nextValue === 'json' && param.value.trim() === ''
                                  ? '{}'
                                  : param.value,
                          })
                        }
                      />
                    )}
                    {renderParamValueEditor(ruleIndex, paramIndex, param)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.payloadRowActionButton}
                      onClick={() => removeParam(ruleIndex, paramIndex)}
                      disabled={disabled}
                    >
                      {t('config_management.visual.common.delete')}
                    </Button>
                  </div>
                  {paramError && (
                    <div className={`error-box ${styles.payloadParamError}`}>{paramError}</div>
                  )}
                </div>
              );
            })}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addParam(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});

export const PayloadFilterRulesEditor = memo(function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
            >
              {t('config_management.visual.common.delete')}
            </Button>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.models')}
            </div>
            {rule.models.map((model, modelIndex) => (
              <div key={model.id} className={styles.payloadFilterModelRow}>
                <ExpandableInput
                  placeholder={t('config_management.visual.payload_rules.model_name')}
                  ariaLabel={t('config_management.visual.payload_rules.model_name')}
                  value={model.name}
                  onChange={(nextValue) => updateModel(ruleIndex, modelIndex, { name: nextValue })}
                  disabled={disabled}
                />
                <Select
                  value={model.protocol ?? ''}
                  options={protocolOptions}
                  disabled={disabled}
                  ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                  onChange={(nextValue) =>
                    updateModel(ruleIndex, modelIndex, {
                      protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => removeModel(ruleIndex, modelIndex)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.remove_params')}
            </div>
            <StringListEditor
              value={rule.params}
              disabled={disabled}
              placeholder={t('config_management.visual.payload_rules.json_path_filter')}
              inputAriaLabel={t('config_management.visual.payload_rules.json_path_filter')}
              onChange={(params) => updateRule(ruleIndex, { params })}
            />
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});
