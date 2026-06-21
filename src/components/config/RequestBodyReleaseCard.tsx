import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw } from '@/components/ui/icons';
import { configApi } from '@/services/api';
import type { RequestBodyReleaseConfig } from '@/types';
import { useConfigStore, useNotificationStore } from '@/stores';
import styles from './RequestBodyAuditCard.module.scss';

type RequestBodyReleaseDraft = {
  enable: boolean;
  logOnly: boolean;
  afterSeconds: string;
  minBodyBytes: string;
};

type DraftErrors = Partial<Record<'afterSeconds' | 'minBodyBytes', string>>;

export type RequestBodyReleaseCardHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
};

type RequestBodyReleaseCardProps = {
  disabled?: boolean;
  externalSaving?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

const defaultDraft = (): RequestBodyReleaseDraft => ({
  enable: false,
  logOnly: false,
  afterSeconds: '0',
  minBodyBytes: '0',
});

const toDraft = (config?: RequestBodyReleaseConfig | null): RequestBodyReleaseDraft => {
  if (!config) return defaultDraft();
  return {
    enable: Boolean(config.enable),
    logOnly: Boolean(config.logOnly),
    afterSeconds: String(config.afterSeconds ?? 0),
    minBodyBytes: String(config.minBodyBytes ?? 0),
  };
};

const parseNonNegativeInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const toConfig = (draft: RequestBodyReleaseDraft): RequestBodyReleaseConfig => ({
  enable: draft.enable,
  logOnly: draft.logOnly,
  afterSeconds: parseNonNegativeInteger(draft.afterSeconds) ?? 0,
  minBodyBytes: parseNonNegativeInteger(draft.minBodyBytes) ?? 0,
});

const stableConfigString = (draft: RequestBodyReleaseDraft): string =>
  JSON.stringify({
    ...toConfig(draft),
    afterSecondsInput: draft.afterSeconds.trim(),
    minBodyBytesInput: draft.minBodyBytes.trim(),
  });

export const RequestBodyReleaseCard = forwardRef<
  RequestBodyReleaseCardHandle,
  RequestBodyReleaseCardProps
>(function RequestBodyReleaseCard(
  { disabled = false, externalSaving = false, onDirtyChange },
  ref
) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [draft, setDraft] = useState<RequestBodyReleaseDraft>(() => defaultDraft());
  const [baseline, setBaseline] = useState<RequestBodyReleaseDraft>(() => defaultDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [loadError, setLoadError] = useState('');

  const isBusy = loading || saving;
  const controlsDisabled = disabled || isBusy || externalSaving;
  const dirty = useMemo(
    () => stableConfigString(draft) !== stableConfigString(baseline),
    [baseline, draft]
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const loadReleaseConfig = useCallback(
    async ({ manual = false }: { manual?: boolean } = {}) => {
      if (disabled) return;
      setLoading(true);
      setLoadError('');
      try {
        const config = await configApi.getRequestBodyRelease();
        const nextDraft = toDraft(config);
        setDraft(nextDraft);
        setBaseline(nextDraft);
        setErrors({});
        if (manual) {
          showNotification(t('config_management.request_body_release.refresh_success'), 'success');
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        setLoadError(message);
        showNotification(
          `${t('config_management.request_body_release.refresh_failed')}${
            message ? `: ${message}` : ''
          }`,
          'error'
        );
      } finally {
        setLoading(false);
      }
    },
    [disabled, showNotification, t]
  );

  useEffect(() => {
    void loadReleaseConfig();
  }, [loadReleaseConfig]);

  const validateDraft = useCallback((): DraftErrors => {
    const nextErrors: DraftErrors = {};
    const invalidMessage = t('config_management.request_body_release.error_non_negative');
    if (parseNonNegativeInteger(draft.afterSeconds) === null) {
      nextErrors.afterSeconds = invalidMessage;
    }
    if (parseNonNegativeInteger(draft.minBodyBytes) === null) {
      nextErrors.minBodyBytes = invalidMessage;
    }
    return nextErrors;
  }, [draft.afterSeconds, draft.minBodyBytes, t]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    const nextErrors = validateDraft();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return false;

    setSaving(true);
    try {
      const updated = await configApi.updateRequestBodyRelease(toConfig(draft));
      const nextDraft = toDraft(updated);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setErrors({});
      clearConfigCache('request-body-release');
      try {
        await fetchConfig(undefined, true);
      } catch {
        // The local card has already saved and reloaded its own endpoint.
      }
      showNotification(t('config_management.request_body_release.save_success'), 'success');
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      showNotification(
        `${t('config_management.request_body_release.save_failed')}${
          message ? `: ${message}` : ''
        }`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [clearConfigCache, draft, fetchConfig, showNotification, t, validateDraft]);

  const handleReset = useCallback(() => {
    setDraft(baseline);
    setErrors({});
  }, [baseline]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: () => loadReleaseConfig(),
      reset: handleReset,
    }),
    [handleSave, handleReset, loadReleaseConfig]
  );

  return (
    <Card>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.sectionTitle}>
              {t('config_management.request_body_release.title')}
            </h2>
            <p className={styles.description}>
              {t('config_management.request_body_release.description')}
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={disabled || saving || externalSaving}
              onClick={() => void loadReleaseConfig({ manual: true })}
            >
              <IconRefreshCw size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {loadError && <div className="error-box">{loadError}</div>}
        {disabled && <div className="hint">{t('notification.connection_required')}</div>}

        <div className={styles.section}>
          <div className={styles.toggleGrid}>
            <div className={styles.toggleItem}>
              <ToggleSwitch
                label={t('config_management.request_body_release.enable')}
                checked={draft.enable}
                disabled={controlsDisabled}
                onChange={(value) => setDraft((current) => ({ ...current, enable: value }))}
              />
              <span className={styles.toggleDescription}>
                {t('config_management.request_body_release.enable_desc')}
              </span>
            </div>
            <div className={styles.toggleItem}>
              <ToggleSwitch
                label={t('config_management.request_body_release.log_only')}
                checked={draft.logOnly}
                disabled={controlsDisabled || !draft.enable}
                onChange={(value) => setDraft((current) => ({ ...current, logOnly: value }))}
              />
              <span className={styles.toggleDescription}>
                {t('config_management.request_body_release.log_only_desc')}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t('config_management.request_body_release.thresholds')}
          </h3>
          <p className={styles.sectionHint}>
            {t('config_management.request_body_release.thresholds_hint')}
          </p>
          <div className={styles.formGrid}>
            <Input
              label={t('config_management.request_body_release.after_seconds')}
              type="number"
              min={0}
              step={1}
              placeholder="30"
              value={draft.afterSeconds}
              disabled={controlsDisabled}
              hint={t('config_management.request_body_release.after_seconds_hint')}
              error={errors.afterSeconds}
              onChange={(event) =>
                setDraft((current) => ({ ...current, afterSeconds: event.target.value }))
              }
            />
            <Input
              label={t('config_management.request_body_release.min_body_bytes')}
              type="number"
              min={0}
              step={1}
              placeholder="1048576"
              value={draft.minBodyBytes}
              disabled={controlsDisabled}
              hint={t('config_management.request_body_release.min_body_bytes_hint')}
              error={errors.minBodyBytes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minBodyBytes: event.target.value }))
              }
            />
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            disabled={controlsDisabled || !dirty}
            onClick={handleReset}
          >
            {t('config_management.request_body_release.reset')}
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={disabled || loading || externalSaving || !dirty}
            onClick={() => void handleSave()}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
});
