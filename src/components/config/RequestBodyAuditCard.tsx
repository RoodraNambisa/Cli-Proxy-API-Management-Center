import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconRefreshCw, IconTrash2 } from '@/components/ui/icons';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { configApi } from '@/services/api';
import type { RequestBodyAuditConfig } from '@/types';
import { useConfigStore, useNotificationStore } from '@/stores';
import styles from './RequestBodyAuditCard.module.scss';

type RequestBodyAuditDraft = {
  enable: boolean;
  keywords: string[];
  keywordsBase64: string[];
  caseSensitive: boolean;
  maxBodyBytes: string;
  rejectOversize: boolean;
  errorStatusCode: string;
  errorMessage: string;
  errorType: string;
  errorCode: string;
};

type DraftErrors = Partial<Record<'maxBodyBytes' | 'errorStatusCode', string>>;

export type RequestBodyAuditCardHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type RequestBodyAuditCardProps = {
  disabled?: boolean;
  externalSaving?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
  embedded?: boolean;
  focusTarget?: string;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:request-body-audit-expanded';

type KeywordListProps = {
  title: string;
  hint: string;
  addLabel: string;
  emptyLabel: string;
  placeholder: string;
  values: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
};

const DEFAULT_STATUS_CODE = 400;

const defaultDraft = (): RequestBodyAuditDraft => ({
  enable: false,
  keywords: [],
  keywordsBase64: [],
  caseSensitive: false,
  maxBodyBytes: '0',
  rejectOversize: true,
  errorStatusCode: String(DEFAULT_STATUS_CODE),
  errorMessage: '',
  errorType: '',
  errorCode: '',
});

const normalizeStringList = (values: string[]): string[] =>
  values.map((value) => value.trim()).filter(Boolean);

const toDraft = (config?: RequestBodyAuditConfig | null): RequestBodyAuditDraft => {
  if (!config) return defaultDraft();
  const error = config.error ?? {};
  return {
    enable: Boolean(config.enable),
    keywords: [...(config.keywords ?? [])],
    keywordsBase64: [...(config.keywordsBase64 ?? [])],
    caseSensitive: Boolean(config.caseSensitive),
    maxBodyBytes: String(config.maxBodyBytes ?? 0),
    rejectOversize: Boolean(config.rejectOversize),
    errorStatusCode: String(error.statusCode ?? DEFAULT_STATUS_CODE),
    errorMessage: error.message ?? '',
    errorType: error.type ?? '',
    errorCode: error.code ?? '',
  };
};

const parseNonNegativeInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseHttpStatusCode = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
};

const toConfig = (draft: RequestBodyAuditDraft): RequestBodyAuditConfig => ({
  enable: draft.enable,
  keywords: normalizeStringList(draft.keywords),
  keywordsBase64: normalizeStringList(draft.keywordsBase64),
  caseSensitive: draft.caseSensitive,
  maxBodyBytes: parseNonNegativeInteger(draft.maxBodyBytes) ?? 0,
  rejectOversize: draft.rejectOversize,
  error: {
    statusCode: parseHttpStatusCode(draft.errorStatusCode) ?? DEFAULT_STATUS_CODE,
    message: draft.errorMessage.trim(),
    type: draft.errorType.trim(),
    code: draft.errorCode.trim(),
  },
});

const stableConfigString = (draft: RequestBodyAuditDraft): string =>
  JSON.stringify({
    ...toConfig(draft),
    maxBodyBytesInput: draft.maxBodyBytes.trim(),
    errorStatusCodeInput: draft.errorStatusCode.trim(),
  });

function KeywordList({
  title,
  hint,
  addLabel,
  emptyLabel,
  placeholder,
  values,
  disabled,
  onChange,
}: KeywordListProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>{title}</h3>
          <p className={styles.sectionHint}>{hint}</p>
        </div>
        <div className={styles.listActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange([...values, ''])}
            disabled={disabled}
          >
            <IconPlus size={14} />
            {addLabel}
          </Button>
        </div>
      </div>

      <div className={styles.list}>
        {values.length === 0 ? (
          <div className={styles.emptyList}>{emptyLabel}</div>
        ) : (
          values.map((value, index) => (
            <div key={index} className={styles.listRow}>
              <Input
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
                title={t('common.delete')}
                aria-label={t('common.delete')}
              >
                <IconTrash2 size={15} />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const RequestBodyAuditCard = forwardRef<
  RequestBodyAuditCardHandle,
  RequestBodyAuditCardProps
>(function RequestBodyAuditCard(
  {
    disabled = false,
    externalSaving = false,
    onDirtyChange,
    onErrorCountChange,
    embedded = false,
    focusTarget,
  },
  ref
) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [draft, setDraft] = useState<RequestBodyAuditDraft>(() => defaultDraft());
  const [baseline, setBaseline] = useState<RequestBodyAuditDraft>(() => defaultDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

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

  useEffect(() => {
    onErrorCountChange?.(Object.keys(errors).length + (loadError ? 1 : 0));
  }, [errors, loadError, onErrorCountChange]);

  useEffect(() => {
    if (!focusTarget?.startsWith('request-body-audit')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target =
        document.getElementById(focusTarget) ?? document.getElementById('request-body-audit');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const handleExpandedChange = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    localStorage.setItem(DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  const loadAuditConfig = useCallback(
    async ({ manual = false }: { manual?: boolean } = {}) => {
      if (disabled) return;
      setLoading(true);
      setLoadError('');
      try {
        const config = await configApi.getRequestBodyAudit();
        const nextDraft = toDraft(config);
        setDraft(nextDraft);
        setBaseline(nextDraft);
        setErrors({});
        if (manual) {
          showNotification(t('config_management.request_body_audit.refresh_success'), 'success');
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        setLoadError(message);
        showNotification(
          `${t('config_management.request_body_audit.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      } finally {
        setLoading(false);
      }
    },
    [disabled, showNotification, t]
  );

  useEffect(() => {
    void loadAuditConfig();
  }, [loadAuditConfig]);

  const validateDraft = useCallback((): DraftErrors => {
    const nextErrors: DraftErrors = {};
    if (parseNonNegativeInteger(draft.maxBodyBytes) === null) {
      nextErrors.maxBodyBytes = t('config_management.request_body_audit.error_non_negative');
    }
    if (parseHttpStatusCode(draft.errorStatusCode) === null) {
      nextErrors.errorStatusCode = t('config_management.request_body_audit.invalid_status_code');
    }
    return nextErrors;
  }, [draft.errorStatusCode, draft.maxBodyBytes, t]);

  const runValidation = useCallback((): boolean => {
    const nextErrors = validateDraft();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) setExpanded(true);
    return Object.keys(nextErrors).length === 0;
  }, [validateDraft]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!runValidation()) return false;

    setSaving(true);
    try {
      const updated = await configApi.updateRequestBodyAudit(toConfig(draft));
      const nextDraft = toDraft(updated);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setErrors({});
      clearConfigCache('request-body-audit');
      try {
        await fetchConfig(undefined, true);
      } catch {
        // The local card has already saved and reloaded its own endpoint.
      }
      showNotification(t('config_management.request_body_audit.save_success'), 'success');
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      showNotification(
        `${t('config_management.request_body_audit.save_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [clearConfigCache, draft, fetchConfig, runValidation, showNotification, t]);

  const handleReset = useCallback(() => {
    setDraft(baseline);
    setErrors({});
  }, [baseline]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: () => loadAuditConfig(),
      reset: handleReset,
      validate: runValidation,
    }),
    [handleSave, handleReset, loadAuditConfig, runValidation]
  );

  const editorContent = (
    <>
      {loadError && <div className="error-box">{loadError}</div>}
      {disabled && <div className="hint">{t('notification.connection_required')}</div>}

      <div className={styles.section}>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleItem}>
            <ToggleSwitch
              label={t('config_management.request_body_audit.enable')}
              checked={draft.enable}
              disabled={controlsDisabled}
              onChange={(value) => setDraft((current) => ({ ...current, enable: value }))}
            />
            <span className={styles.toggleDescription}>
              {t('config_management.request_body_audit.enable_desc')}
            </span>
          </div>
          <div className={styles.toggleItem}>
            <ToggleSwitch
              label={t('config_management.request_body_audit.case_sensitive')}
              checked={draft.caseSensitive}
              disabled={controlsDisabled}
              onChange={(value) => setDraft((current) => ({ ...current, caseSensitive: value }))}
            />
            <span className={styles.toggleDescription}>
              {t('config_management.request_body_audit.case_sensitive_desc')}
            </span>
          </div>
          <div className={styles.toggleItem}>
            <ToggleSwitch
              label={t('config_management.request_body_audit.reject_oversize')}
              checked={draft.rejectOversize}
              disabled={controlsDisabled}
              onChange={(value) => setDraft((current) => ({ ...current, rejectOversize: value }))}
            />
            <span className={styles.toggleDescription}>
              {t('config_management.request_body_audit.reject_oversize_desc')}
            </span>
          </div>
        </div>
      </div>

      <KeywordList
        title={t('config_management.request_body_audit.keywords')}
        hint={t('config_management.request_body_audit.keywords_hint')}
        addLabel={t('config_management.request_body_audit.add_keyword')}
        emptyLabel={t('config_management.request_body_audit.keywords_empty')}
        placeholder={t('config_management.request_body_audit.keyword_placeholder')}
        values={draft.keywords}
        disabled={controlsDisabled}
        onChange={(keywords) => setDraft((current) => ({ ...current, keywords }))}
      />

      <KeywordList
        title={t('config_management.request_body_audit.keywords_base64')}
        hint={t('config_management.request_body_audit.keywords_base64_hint')}
        addLabel={t('config_management.request_body_audit.add_base64_keyword')}
        emptyLabel={t('config_management.request_body_audit.keywords_base64_empty')}
        placeholder={t('config_management.request_body_audit.keywords_base64_placeholder')}
        values={draft.keywordsBase64}
        disabled={controlsDisabled}
        onChange={(keywordsBase64) => setDraft((current) => ({ ...current, keywordsBase64 }))}
      />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('config_management.request_body_audit.scan_limits')}
        </h3>
        <div className={styles.formGrid}>
          <Input
            id="request-body-audit-max-body-bytes"
            label={t('config_management.request_body_audit.max_body_bytes')}
            type="number"
            min={0}
            step={1}
            value={draft.maxBodyBytes}
            disabled={controlsDisabled}
            hint={t('config_management.request_body_audit.max_body_bytes_hint')}
            error={errors.maxBodyBytes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, maxBodyBytes: event.target.value }))
            }
          />
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('config_management.request_body_audit.error_response')}
        </h3>
        <p className={styles.sectionHint}>
          {t('config_management.request_body_audit.error_response_hint')}
        </p>
        <div className={styles.errorGrid}>
          <Input
            id="request-body-audit-error-status-code"
            label={t('config_management.request_body_audit.error_status_code_label')}
            type="number"
            min={100}
            max={599}
            step={1}
            value={draft.errorStatusCode}
            disabled={controlsDisabled}
            error={errors.errorStatusCode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, errorStatusCode: event.target.value }))
            }
          />
          <Input
            label={t('config_management.request_body_audit.error_message')}
            value={draft.errorMessage}
            disabled={controlsDisabled}
            placeholder={t('config_management.request_body_audit.error_message_placeholder')}
            onChange={(event) =>
              setDraft((current) => ({ ...current, errorMessage: event.target.value }))
            }
          />
          <Input
            label={t('config_management.request_body_audit.error_type')}
            value={draft.errorType}
            disabled={controlsDisabled}
            placeholder={t('config_management.request_body_audit.error_type_placeholder')}
            onChange={(event) =>
              setDraft((current) => ({ ...current, errorType: event.target.value }))
            }
          />
          <Input
            label={t('config_management.request_body_audit.error_code')}
            value={draft.errorCode}
            disabled={controlsDisabled}
            placeholder={t('config_management.request_body_audit.error_code_placeholder')}
            onChange={(event) =>
              setDraft((current) => ({ ...current, errorCode: event.target.value }))
            }
          />
        </div>
      </div>
    </>
  );

  if (embedded) {
    const keywordCount =
      normalizeStringList(draft.keywords).length + normalizeStringList(draft.keywordsBase64).length;
    const summary = draft.enable
      ? t('config_management.request_body_audit.status_enabled', { count: keywordCount })
      : t('config_management.settings_center.status_disabled');

    return (
      <ConfigDisclosure
        id="request-body-audit"
        title={t('config_management.request_body_audit.title')}
        description={t('config_management.request_body_audit.description')}
        summary={summary}
        expanded={dirty || expanded || Object.keys(errors).length > 0 || Boolean(loadError)}
        onExpandedChange={handleExpandedChange}
        dirty={dirty}
        errorCount={Object.keys(errors).length + (loadError ? 1 : 0)}
        actions={
          dirty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={controlsDisabled}
              onClick={handleReset}
            >
              {t('config_management.request_body_audit.reset')}
            </Button>
          ) : null
        }
      >
        <div className={styles.embeddedContent}>{editorContent}</div>
      </ConfigDisclosure>
    );
  }

  return (
    <Card>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.sectionTitle}>
              {t('config_management.request_body_audit.title')}
            </h2>
            <p className={styles.description}>
              {t('config_management.request_body_audit.description')}
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={disabled || saving || externalSaving}
              onClick={() => void loadAuditConfig({ manual: true })}
            >
              <IconRefreshCw size={14} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>

        {editorContent}

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            disabled={controlsDisabled || !dirty}
            onClick={handleReset}
          >
            {t('config_management.request_body_audit.reset')}
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
