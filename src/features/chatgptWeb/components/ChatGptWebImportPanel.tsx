import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigDisclosure } from '@/components/config/ConfigDisclosure';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw } from '@/components/ui/icons';
import { chatGptWebApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type {
  ChatGptWebImportConfig,
  ChatGptWebImportConfigPatch,
  ChatGptWebImportSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import { readChatGptWebImportConfig, type ChatGptWebImportDraft } from '../chatGptWebImportConfig';
import styles from './ChatGptWebImportPanel.module.scss';

export type ChatGptWebImportPanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebImportPanelProps = {
  active?: boolean;
  disabled?: boolean;
  externalSaving?: boolean;
  focusTarget?: string;
  connectionGenerationKey?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-import-expanded';

const DEFAULT_DRAFT: ChatGptWebImportDraft = {
  workers: '4',
  validateModelsAfterUpload: false,
  refreshAccountInfoAfterUpload: false,
};

const toDraft = (config: ChatGptWebImportConfig): ChatGptWebImportDraft => ({
  workers: String(config.workers),
  validateModelsAfterUpload: config['validate-models-after-upload'],
  refreshAccountInfoAfterUpload: config['refresh-account-info-after-upload'],
});

const buildPatch = (
  current: ChatGptWebImportConfig,
  next: ChatGptWebImportConfig
): ChatGptWebImportConfigPatch => ({
  ...(current.workers !== next.workers ? { workers: next.workers } : {}),
  ...(current['validate-models-after-upload'] !== next['validate-models-after-upload']
    ? { 'validate-models-after-upload': next['validate-models-after-upload'] }
    : {}),
  ...(current['refresh-account-info-after-upload'] !== next['refresh-account-info-after-upload']
    ? { 'refresh-account-info-after-upload': next['refresh-account-info-after-upload'] }
    : {}),
});

export const ChatGptWebImportPanel = forwardRef<
  ChatGptWebImportPanelHandle,
  ChatGptWebImportPanelProps
>(function ChatGptWebImportPanel(
  {
    active = true,
    disabled = false,
    externalSaving = false,
    focusTarget,
    connectionGenerationKey,
    onDirtyChange,
    onErrorCountChange,
  },
  ref
) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const requestSequenceRef = useRef(0);
  const translateRef = useRef(t);
  const notifyRef = useRef(showNotification);
  const hasLoadedRef = useRef(false);
  translateRef.current = t;
  notifyRef.current = showNotification;
  const [snapshot, setSnapshot] = useState<ChatGptWebImportSnapshot | null>(null);
  const [draft, setDraft] = useState<ChatGptWebImportDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const loadSnapshot = useCallback(
    async (notifyOnError = true): Promise<ChatGptWebImportSnapshot | null> => {
      const requestSequence = ++requestSequenceRef.current;
      setLoading(true);
      try {
        const next = await chatGptWebApi.getImport();
        if (requestSequence !== requestSequenceRef.current) return null;
        setSnapshot(next);
        setDraft(toDraft(next.config));
        setLoadError('');
        return next;
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current) return null;
        const message = getChatGptWebErrorMessage(error, translateRef.current);
        setLoadError(message);
        if (notifyOnError) {
          notifyRef.current(
            `${translateRef.current('chatgpt_web.import.load_failed')}: ${message}`,
            'error'
          );
        }
        return null;
      } finally {
        if (requestSequence === requestSequenceRef.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    requestSequenceRef.current += 1;
    hasLoadedRef.current = false;
    setSnapshot(null);
    setDraft(DEFAULT_DRAFT);
    setLoadError('');
  }, [connectionGenerationKey]);

  useEffect(() => {
    if (disabled || !active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadSnapshot();
  }, [active, connectionGenerationKey, disabled, loadSnapshot]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    []
  );

  const parsedDraft = useMemo(() => readChatGptWebImportConfig(draft), [draft]);
  const dirty = snapshot
    ? JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot.config))
    : false;
  const patch = useMemo(
    () => (snapshot && parsedDraft.config ? buildPatch(snapshot.config, parsedDraft.config) : {}),
    [parsedDraft.config, snapshot]
  );
  const errorCount = (parsedDraft.errorKey ? 1 : 0) + (loadError ? 1 : 0);
  const controlsDisabled = disabled || externalSaving || loading || saving || !snapshot;

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onErrorCountChange?.(errorCount);
    return () => onErrorCountChange?.(0);
  }, [errorCount, onErrorCountChange]);

  useEffect(() => {
    if (!focusTarget?.startsWith('config-chatgpt-web-import')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target = document.getElementById('config-chatgpt-web-import');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const runValidation = useCallback(() => {
    const valid = parsedDraft.config !== null;
    if (!valid) setExpanded(true);
    return valid;
  }, [parsedDraft.config]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!snapshot || !parsedDraft.config || saving) return false;
    if (Object.keys(patch).length === 0) {
      setDraft(toDraft(snapshot.config));
      return true;
    }
    setSaving(true);
    try {
      await chatGptWebApi.patchImport(patch);
      const refreshed = await loadSnapshot(false);
      if (refreshed) {
        showNotification(t('chatgpt_web.import.save_success'), 'success');
      } else {
        const nextSnapshot = {
          ...snapshot,
          config: { ...snapshot.config, ...parsedDraft.config },
        };
        setSnapshot(nextSnapshot);
        setDraft(toDraft(nextSnapshot.config));
        showNotification(t('chatgpt_web.import.saved_refresh_failed'), 'warning');
      }
      return true;
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.import.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirty, loadSnapshot, parsedDraft.config, patch, saving, showNotification, snapshot, t]);

  const handleReset = useCallback(() => {
    if (!snapshot) return;
    setDraft(toDraft(snapshot.config));
  }, [snapshot]);

  const handleExpandedChange = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    localStorage.setItem(DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: async () => {
        if (disabled || (!active && !hasLoadedRef.current)) return;
        hasLoadedRef.current = true;
        await loadSnapshot(false);
      },
      reset: handleReset,
      validate: runValidation,
    }),
    [active, disabled, handleReset, handleSave, loadSnapshot, runValidation]
  );

  const runtime = snapshot?.runtime;
  const summary = !snapshot
    ? t(loadError ? 'chatgpt_web.import.load_failed' : 'chatgpt_web.import.loading')
    : t('chatgpt_web.import.summary', {
        workers: snapshot.config.workers,
        queued: runtime?.queued_entries ?? 0,
        running: runtime?.running_entries ?? 0,
      });

  return (
    <ConfigDisclosure
      id="config-chatgpt-web-import"
      title={t('chatgpt_web.import.title')}
      description={t('chatgpt_web.import.description')}
      summary={summary}
      expanded={dirty || expanded || errorCount > 0}
      onExpandedChange={handleExpandedChange}
      dirty={dirty}
      errorCount={errorCount}
      actions={
        dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={controlsDisabled}
            onClick={handleReset}
          >
            {t('chatgpt_web.import.reset')}
          </Button>
        ) : null
      }
    >
      <div className={styles.content}>
        <label className={styles.workerField} htmlFor="chatgpt-web-import-workers">
          <span>{t('chatgpt_web.import.workers')}</span>
          <input
            id="chatgpt-web-import-workers"
            type="number"
            min={1}
            max={32}
            step={1}
            value={draft.workers}
            onChange={(event) =>
              setDraft((current) => ({ ...current, workers: event.target.value }))
            }
            disabled={controlsDisabled}
          />
          <small>{t('chatgpt_web.import.workers_hint')}</small>
        </label>

        <div className={styles.toggleRow}>
          <div>
            <strong>{t('chatgpt_web.import.validate_models')}</strong>
            <span>{t('chatgpt_web.import.validate_models_description')}</span>
          </div>
          <ToggleSwitch
            checked={draft.validateModelsAfterUpload}
            onChange={(validateModelsAfterUpload) =>
              setDraft((current) => ({ ...current, validateModelsAfterUpload }))
            }
            disabled={controlsDisabled}
            ariaLabel={t('chatgpt_web.import.validate_models')}
          />
        </div>

        <div className={styles.toggleRow}>
          <div>
            <strong>{t('chatgpt_web.import.refresh_account_info')}</strong>
            <span>{t('chatgpt_web.import.refresh_account_info_description')}</span>
          </div>
          <ToggleSwitch
            checked={draft.refreshAccountInfoAfterUpload}
            onChange={(refreshAccountInfoAfterUpload) =>
              setDraft((current) => ({ ...current, refreshAccountInfoAfterUpload }))
            }
            disabled={controlsDisabled}
            ariaLabel={t('chatgpt_web.import.refresh_account_info')}
          />
        </div>

        {parsedDraft.errorKey ? (
          <p className={styles.validationError} role="alert">
            {t(parsedDraft.errorKey)}
          </p>
        ) : null}

        <div className={styles.statusHeading}>
          <div>
            <h3>{t('chatgpt_web.import.runtime_title')}</h3>
            <p>{t('chatgpt_web.import.runtime_description')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadSnapshot()}
            loading={loading}
            disabled={disabled || externalSaving || saving || dirty}
          >
            <IconRefreshCw size={15} />
            {t('common.refresh')}
          </Button>
        </div>

        {!snapshot ? (
          <div className={styles.statusEmpty} role={loadError ? 'alert' : undefined}>
            {loading ? <LoadingSpinner size={18} /> : null}
            <span>
              {loadError
                ? `${t('chatgpt_web.import.load_failed')}: ${loadError}`
                : t('chatgpt_web.import.loading')}
            </span>
          </div>
        ) : (
          <dl className={styles.statusGrid}>
            {(
              [
                ['queued_entries', runtime?.queued_entries ?? 0],
                ['running_entries', runtime?.running_entries ?? 0],
                ['active_workers', runtime?.active_workers ?? 0],
                ['worker_limit', runtime?.worker_limit ?? snapshot.config.workers],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt>{t(`chatgpt_web.import.runtime.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </ConfigDisclosure>
  );
});
