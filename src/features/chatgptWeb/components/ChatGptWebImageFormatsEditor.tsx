import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconChevronDown } from '@/components/ui/icons';
import { StringListEditor } from '@/components/config/VisualConfigEditorBlocks';
import { useChatGptWebImageFormats } from '../useChatGptWebImageFormats';
import {
  aliasKey,
  effectiveImageAliases,
  IMAGE_OUTPUT_FORMATS,
  type ModelOutputFormats,
} from '../imageOutputFormats';
import styles from './ChatGptWebImageFormatsEditor.module.scss';

export function ChatGptWebImageFormatsEditor({
  models,
  overrides,
  legacyModel,
  connectionKey,
  active,
  disabled,
  onChange,
}: {
  models: string[];
  overrides: ModelOutputFormats;
  legacyModel: string;
  connectionKey: string;
  active: boolean;
  disabled?: boolean;
  onChange: (patch: {
    chatgptWebImageModels?: string[];
    chatgptWebModelOutputFormats?: ModelOutputFormats;
  }) => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(`chatgpt_web.image_formats.${key}`);
  const capability = useChatGptWebImageFormats(connectionKey, active);
  const [edit, setEdit] = useState<{ previous?: string; value: string; connection: string } | null>(
    null
  );
  const data = capability.data;
  const aliases = effectiveImageAliases(models, legacyModel, data?.default_aliases);
  const ready = !disabled && capability.status === 'supported';
  const draft = edit?.connection === connectionKey ? edit : null;
  const name = draft?.value.trim() ?? '';
  const invalidName =
    !name || aliases.some((a) => aliasKey(a) === aliasKey(name) && a !== draft?.previous);
  const removeOverride = (model: string) => {
    const next = { ...overrides };
    delete next[aliasKey(model)];
    return next;
  };
  const saveAlias = () => {
    if (!ready || !draft || invalidName) return;
    const next = removeOverride(draft.previous ?? '');
    if (draft.previous && Object.prototype.hasOwnProperty.call(overrides, aliasKey(draft.previous)))
      Object.defineProperty(next, aliasKey(name), {
        value: [...overrides[aliasKey(draft.previous)]],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    onChange({
      chatgptWebImageModels: draft.previous
        ? aliases.map((a) => (a === draft.previous ? name : a))
        : [...aliases, name],
      chatgptWebModelOutputFormats: next,
    });
    setEdit(null);
  };
  return (
    <div className={styles.editor}>
      {capability.status !== 'supported' && (
        <p role="status" className={styles.hint}>
          {tr(capability.status)}
        </p>
      )}
      {!data ? (
        <StringListEditor
          compact
          value={models}
          disabled={disabled}
          placeholder="gpt-image-2.6"
          onChange={(chatgptWebImageModels) => onChange({ chatgptWebImageModels })}
        />
      ) : (
        <details key={connectionKey} className={styles.disclosure}>
          <summary className={styles.summary}>
            <IconChevronDown size={16} className={styles.chevron} />
            <span className={styles.models}>
              {aliases.map((model) => (
                <span key={aliasKey(model)} className={styles.model}>
                  {model}
                </span>
              ))}
            </span>
          </summary>
          <div className={styles.content}>
            <p className={styles.hint}>{tr('description')}</p>
            <div className={styles.rows}>
              {aliases.map((model) => {
                const key = aliasKey(model);
                const custom = Object.prototype.hasOwnProperty.call(overrides, key);
                const formats = custom
                  ? overrides[key]
                  : Object.prototype.hasOwnProperty.call(data.default_overrides, key)
                    ? data.default_overrides[key]
                    : data.default_formats;
                return (
                  <div key={key} className={styles.row}>
                    <div className={styles.name}>
                      <strong>{model}</strong>
                      <span className={styles.badge}>{tr(custom ? 'custom' : 'default')}</span>
                    </div>
                    <div className={styles.formats} role="group" aria-label={model}>
                      {IMAGE_OUTPUT_FORMATS.map((format) => (
                        <label key={format}>
                          <input
                            type="checkbox"
                            checked={formats.includes(format)}
                            aria-label={`${model} ${format.toUpperCase()}`}
                            disabled={!ready || (formats.length === 1 && formats[0] === format)}
                            onChange={(e) => {
                              const selected = e.target.checked
                                ? IMAGE_OUTPUT_FORMATS.filter(
                                    (f) => f === format || formats.includes(f)
                                  )
                                : formats.filter((f) => f !== format);
                              onChange({
                                chatgptWebModelOutputFormats: { ...overrides, [key]: selected },
                              });
                            }}
                          />
                          {format.toUpperCase()}
                        </label>
                      ))}
                    </div>
                    <div className={styles.actions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!ready || !custom}
                        onClick={() =>
                          onChange({ chatgptWebModelOutputFormats: removeOverride(model) })
                        }
                      >
                        {tr('reset')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!ready}
                        onClick={() =>
                          setEdit({ previous: model, value: model, connection: connectionKey })
                        }
                      >
                        {tr('rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!ready || aliases.length === 1}
                        onClick={() =>
                          onChange({
                            chatgptWebImageModels: aliases.filter((a) => a !== model),
                            chatgptWebModelOutputFormats: removeOverride(model),
                          })
                        }
                      >
                        {tr('delete')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!ready}
              onClick={() => setEdit({ value: '', connection: connectionKey })}
            >
              {tr('add')}
            </Button>
          </div>
        </details>
      )}
      <Modal
        open={!!draft && ready}
        title={tr(draft?.previous ? 'rename' : 'add')}
        onClose={() => setEdit(null)}
        footer={
          <Button disabled={!ready || invalidName} onClick={saveAlias}>
            {tr('apply')}
          </Button>
        }
      >
        <label>
          {tr('name')}
          <input
            className="input"
            value={draft?.value ?? ''}
            onChange={(e) => draft && setEdit({ ...draft, value: e.target.value })}
          />
        </label>
        {invalidName && <p role="status">{tr('invalid_name')}</p>}
      </Modal>
    </div>
  );
}
