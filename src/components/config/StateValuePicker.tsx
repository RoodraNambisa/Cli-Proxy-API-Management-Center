import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { IconPlus, IconTrash2, IconSlidersHorizontal } from '@/components/ui/icons';
import styles from './StateValuePicker.module.scss';

export type StateChoice = { value: string; label: string; detail?: string };

export function StateValuePicker({
  label,
  value,
  onChange,
  choices,
  emptyLabel,
  hint,
  placeholder,
  disabled,
  maxItems,
  validate,
  normalize = (item) => item,
  onOpen,
  loading,
  loadError,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  choices: StateChoice[];
  emptyLabel: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  maxItems: number;
  validate: (value: string) => string | undefined;
  normalize?: (value: string) => string;
  onOpen?: () => void;
  loading?: boolean;
  loadError?: string;
}) {
  const { t } = useTranslation();
  const text = (key: string) => t(`codex_state.${key}`);
  const id = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const options = [
    ...new Map<string, StateChoice>([
      ...value.map((item) => [item, { value: item, label: item }] as const),
      ...choices.map((option) => [option.value, option] as const),
    ]).values(),
  ];
  const optionMap = new Map(options.map((option) => [option.value, option]));
  const query = search.trim().toLowerCase();
  const filtered = options.filter((option) =>
    `${option.value} ${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query)
  );
  const validation = (items: string[]) =>
    items.length > maxItems
      ? t('codex_state.picker_limit', { count: maxItems })
      : items.map(validate).find(Boolean);
  const commit = (next: string[]) => {
    const unique = [...new Set(next)];
    const invalid = validation(unique);
    setError(invalid ?? '');
    if (invalid) return false;
    onChange(unique);
    return true;
  };
  const add = () => {
    if (disabled || !draft.trim()) return;
    const additions = draft
      .split(/[,，\r\n]+/)
      .map((item) => normalize(item.trim()))
      .filter(Boolean);
    if (commit(maxItems === 1 ? additions : [...value, ...additions])) setDraft('');
  };
  const toggle = (item: string, checked: boolean) => {
    setSelected((current) =>
      checked
        ? maxItems === 1
          ? [item]
          : [...new Set([...current, item])]
        : current.filter((value) => value !== item)
    );
  };
  return (
    <div className={styles.root} role="group" aria-label={label}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.chips}>
        {value.length === 0 ? (
          <span className={styles.empty}>{emptyLabel}</span>
        ) : (
          value.map((item) => {
            const option = optionMap.get(item);
            return (
              <span
                className={styles.chip}
                key={item}
                title={[option?.label, item, option?.detail].filter(Boolean).join(' · ')}
              >
                <span>{option?.label ?? item}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setError('');
                    onChange(value.filter((entry) => entry !== item));
                  }}
                  aria-label={t('codex_state.picker_remove', { value: item })}
                >
                  <IconTrash2 size={13} />
                </button>
              </span>
            );
          })
        )}
      </div>
      <div className={styles.entry}>
        <Input
          id={id}
          value={draft}
          placeholder={placeholder ?? text('picker_input')}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !draft.trim()}
          onClick={add}
          aria-label={`${t('common.add')}: ${label}`}
        >
          <IconPlus size={14} />
          {t('common.add')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setSelected(value);
            setSearch('');
            setVisibleLimit(50);
            setError('');
            setOpen(true);
            onOpen?.();
          }}
          aria-label={`${text('picker_choose')}: ${label}`}
        >
          <IconSlidersHorizontal size={14} />
          {text('picker_choose')}
        </Button>
      </div>
      <div id={`${id}-hint`} className="hint">
        {hint ?? text('picker_hint')}
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        width={800}
        footer={
          <>
            <span className={styles.count}>
              {t('codex_state.picker_selected', { count: selected.length })}
            </span>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={disabled || Boolean(validation(selected))}
              onClick={() => {
                if (commit(selected)) setOpen(false);
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Input
          type="search"
          value={search}
          aria-label={text('picker_search')}
          placeholder={text('picker_search')}
          onChange={(event) => {
            setSearch(event.target.value);
            setVisibleLimit(50);
          }}
        />
        {onOpen && (
          <div className={styles.loadRow}>
            <span role="status">
              {loading ? text('picker_loading') : text('picker_catalog_hint')}
            </span>
            <Button size="sm" variant="secondary" disabled={loading || disabled} onClick={onOpen}>
              {t('common.refresh')}
            </Button>
          </div>
        )}
        {loadError && (
          <div role="alert" className="error-box">
            {loadError}
          </div>
        )}
        {validation(selected) && (
          <div role="alert" className="error-box">
            {validation(selected)}
          </div>
        )}
        <div className={styles.options}>
          {filtered.slice(0, visibleLimit).map((option) => (
            <SelectionCheckbox
              key={option.value}
              checked={selected.includes(option.value)}
              disabled={
                disabled ||
                (maxItems > 1 && selected.length >= maxItems && !selected.includes(option.value))
              }
              ariaLabel={`${option.label} (${option.value})`}
              label={
                <span className={styles.optionLabel}>
                  <strong>{option.label}</strong>
                  {option.label !== option.value && <code>{option.value}</code>}
                  {option.detail && <small>{option.detail}</small>}
                </span>
              }
              onChange={(checked) => toggle(option.value, checked)}
              className={styles.option}
            />
          ))}
        </div>
        {!loading && filtered.length === 0 && <p className="hint">{text('picker_no_options')}</p>}
        {filtered.length > visibleLimit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setVisibleLimit((limit) => limit + 50)}
          >
            {text('picker_more')}
          </Button>
        )}
      </Modal>
    </div>
  );
}
