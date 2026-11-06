import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/services/api/client';
import { aliasKey, effectiveImageAliases } from '../imageOutputFormats';
import {
  defaultImageUsageProfile,
  IMAGE_USAGE_MODES,
  IMAGE_USAGE_PROFILES,
  supportsImageUsageProfiles,
  type ImageUsageMode,
  type ImageUsageModelProfiles,
  type ImageUsageProfile,
} from '../imageUsageProfiles';
import styles from './ChatGptWebUsageCachePanel.module.scss';

export type ImageUsageProfilesDraft = {
  mode: ImageUsageMode;
  overrides: ImageUsageModelProfiles;
  models: string[];
  legacyModel: string;
  dirty: boolean;
  onChange: (patch: {
    chatgptWebImageUsageProfile?: ImageUsageMode;
    chatgptWebImageUsageModelProfiles?: ImageUsageModelProfiles;
  }) => void;
};

export function ChatGptWebImageUsageProfiles({
  draft,
  connectionKey,
  active,
  disabled,
  savedMode,
}: {
  draft: ImageUsageProfilesDraft;
  connectionKey: string;
  active: boolean;
  disabled: boolean;
  savedMode?: string;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(`chatgpt_web.usage_profiles.${key}`);
  const scope = useMemo(() => ({ connectionKey, active }), [connectionKey, active]);
  const [capability, setCapability] = useState<{
    scope: typeof scope;
    status: 'supported' | 'unsupported' | 'error';
  } | null>(null);
  useEffect(() => {
    if (!scope.active) return;
    const controller = new AbortController();
    void supportsImageUsageProfiles(apiClient.captureConnection(), controller.signal).then(
      (supported) => {
        if (!controller.signal.aborted)
          setCapability({ scope, status: supported ? 'supported' : 'unsupported' });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setCapability({
            scope,
            status: [404, 405, 501].includes((error as { status?: number }).status ?? 0)
              ? 'unsupported'
              : 'error',
          });
      }
    );
    return () => controller.abort();
  }, [scope]);
  const status = capability?.scope === scope ? capability.status : 'loading';
  const ready = status === 'supported' && !disabled;
  const aliases = effectiveImageAliases(draft.models, draft.legacyModel);
  const label = (mode: string) =>
    mode === 'by-model' ? tr('by_model') : `Image ${mode.replace('gpt-image-', '')}`;
  return (
    <div className={styles.profileSettings}>
      <label className={styles.profileMode}>
        <strong>{tr('title')}</strong>
        <select
          aria-label={tr('title')}
          value={status === 'supported' ? draft.mode : ''}
          disabled={!ready}
          onChange={(e) =>
            draft.onChange({ chatgptWebImageUsageProfile: e.target.value as ImageUsageMode })
          }
        >
          {status !== 'supported' && <option value="">{tr(status)}</option>}
          {IMAGE_USAGE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode === 'by-model' ? label(mode) : `${tr('unified')} ${label(mode)}`}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.estimatorNotice}>{tr('description')}</p>
      {status !== 'supported' && <p role="status">{tr(status)}</p>}
      {status === 'supported' && savedMode && (
        <p>
          {tr('saved')} {label(savedMode)}
          {draft.dirty ? ` · ${tr('unsaved')}` : ''}
        </p>
      )}
      <details key={connectionKey}>
        <summary>
          {tr('aliases')} ({aliases.length})
        </summary>
        {draft.mode !== 'by-model' && <p>{tr('uniform_hint')}</p>}
        <div className={styles.profileRows}>
          {aliases.map((model) => {
            const key = aliasKey(model);
            const custom = Object.prototype.hasOwnProperty.call(draft.overrides, key);
            const effective =
              draft.mode === 'by-model'
                ? custom
                  ? draft.overrides[key]
                  : defaultImageUsageProfile(model)
                : draft.mode;
            const reset = () => {
              const next = { ...draft.overrides };
              delete next[key];
              draft.onChange({ chatgptWebImageUsageModelProfiles: next });
            };
            return (
              <div className={styles.profileRow} key={key}>
                <div>
                  <strong>{model}</strong>
                  <small>
                    {tr(custom ? 'custom' : 'automatic')} ·{' '}
                    {tr(draft.dirty ? 'draft_rule' : 'effective')} {label(effective)}
                  </small>
                </div>
                <select
                  aria-label={`${model} ${tr('rule')}`}
                  value={custom ? draft.overrides[key] : 'auto'}
                  disabled={!ready || draft.mode !== 'by-model'}
                  onChange={(e) => {
                    if (e.target.value === 'auto') reset();
                    else
                      draft.onChange({
                        chatgptWebImageUsageModelProfiles: {
                          ...draft.overrides,
                          [key]: e.target.value as ImageUsageProfile,
                        },
                      });
                  }}
                >
                  <option value="auto">
                    {tr('automatic')} ({label(defaultImageUsageProfile(model))})
                  </option>
                  {IMAGE_USAGE_PROFILES.map((profile) => (
                    <option key={profile} value={profile}>
                      {label(profile)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!ready || !custom || draft.mode !== 'by-model'}
                  onClick={reset}
                >
                  {tr('reset')}
                </Button>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
