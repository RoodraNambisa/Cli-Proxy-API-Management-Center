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
  ChatGptWebSentinelConfig,
  ChatGptWebSentinelConfigPatch,
  ChatGptWebSentinelSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import styles from './ChatGptWebSentinelPanel.module.scss';

type SentinelDraft = {
  runtimeEnabled: boolean;
  workers: string;
  queueSize: string;
  cacheVersions: string;
};

export type ChatGptWebSentinelPanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebSentinelPanelProps = {
  active?: boolean;
  disabled?: boolean;
  embedded?: boolean;
  externalSaving?: boolean;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-sentinel-expanded';

const DEFAULT_DRAFT: SentinelDraft = {
  runtimeEnabled: true,
  workers: '0',
  queueSize: '32',
  cacheVersions: '3',
};

const toDraft = (snapshot: ChatGptWebSentinelSnapshot): SentinelDraft => ({
  runtimeEnabled: snapshot['sdk-runtime-enabled'],
  workers: String(snapshot['sdk-workers']),
  queueSize: String(snapshot['sdk-queue-size']),
  cacheVersions: String(snapshot['sdk-cache-versions']),
});

const parseInteger = (value: string, min: number, max: number): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const readConfig = (
  draft: SentinelDraft
): { config: ChatGptWebSentinelConfig | null; errorKey: string | null } => {
  const workers = parseInteger(draft.workers, 0, 16);
  if (workers === null) {
    return { config: null, errorKey: 'chatgpt_web.sentinel.validation_workers' };
  }
  const queueSize = parseInteger(draft.queueSize, 0, 1024);
  if (queueSize === null) {
    return { config: null, errorKey: 'chatgpt_web.sentinel.validation_queue_size' };
  }
  const cacheVersions = parseInteger(draft.cacheVersions, 1, 5);
  if (cacheVersions === null) {
    return { config: null, errorKey: 'chatgpt_web.sentinel.validation_cache_versions' };
  }
  return {
    config: {
      'sdk-runtime-enabled': draft.runtimeEnabled,
      'sdk-workers': workers,
      'sdk-queue-size': queueSize,
      'sdk-cache-versions': cacheVersions,
    },
    errorKey: null,
  };
};

const buildPatch = (
  current: ChatGptWebSentinelSnapshot,
  next: ChatGptWebSentinelConfig
): ChatGptWebSentinelConfigPatch => ({
  ...(current['sdk-runtime-enabled'] !== next['sdk-runtime-enabled']
    ? { 'sdk-runtime-enabled': next['sdk-runtime-enabled'] }
    : {}),
  ...(current['sdk-workers'] !== next['sdk-workers'] ? { 'sdk-workers': next['sdk-workers'] } : {}),
  ...(current['sdk-queue-size'] !== next['sdk-queue-size']
    ? { 'sdk-queue-size': next['sdk-queue-size'] }
    : {}),
  ...(current['sdk-cache-versions'] !== next['sdk-cache-versions']
    ? { 'sdk-cache-versions': next['sdk-cache-versions'] }
    : {}),
});

export const ChatGptWebSentinelPanel = forwardRef<
  ChatGptWebSentinelPanelHandle,
  ChatGptWebSentinelPanelProps
>(function ChatGptWebSentinelPanel(
  {
    active = true,
    disabled = false,
    embedded = false,
    externalSaving = false,
    focusTarget,
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
  const [snapshot, setSnapshot] = useState<ChatGptWebSentinelSnapshot | null>(null);
  const [draft, setDraft] = useState<SentinelDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const loadSnapshot = useCallback(
    async (notifyOnError = true): Promise<ChatGptWebSentinelSnapshot | null> => {
      const requestSequence = ++requestSequenceRef.current;
      setLoading(true);
      try {
        const next = await chatGptWebApi.getSentinel();
        if (requestSequence !== requestSequenceRef.current) return null;
        setSnapshot(next);
        setDraft(toDraft(next));
        setLoadError('');
        return next;
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current) return null;
        const message = getChatGptWebErrorMessage(error, translateRef.current);
        setLoadError(message);
        if (notifyOnError) {
          notifyRef.current(
            `${translateRef.current('chatgpt_web.sentinel.load_failed')}: ${message}`,
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
    if (disabled || !active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadSnapshot();
  }, [active, disabled, loadSnapshot]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    []
  );

  const parsedDraft = useMemo(() => readConfig(draft), [draft]);
  const patch = useMemo(
    () => (snapshot && parsedDraft.config ? buildPatch(snapshot, parsedDraft.config) : {}),
    [parsedDraft.config, snapshot]
  );
  const dirty = snapshot ? JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot)) : false;
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
    if (!focusTarget?.startsWith('config-chatgpt-web-sentinel')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target = document.getElementById('config-chatgpt-web-sentinel');
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
      setDraft(toDraft(snapshot));
      return true;
    }
    setSaving(true);
    try {
      await chatGptWebApi.patchSentinel(patch);
      const refreshed = await loadSnapshot(false);
      if (refreshed) {
        if (!embedded) showNotification(t('chatgpt_web.sentinel.save_success'), 'success');
      } else {
        const nextSnapshot = { ...snapshot, ...parsedDraft.config };
        setSnapshot(nextSnapshot);
        setDraft(toDraft(nextSnapshot));
        showNotification(t('chatgpt_web.sentinel.saved_refresh_failed'), 'warning');
      }
      return true;
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.sentinel.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    dirty,
    embedded,
    loadSnapshot,
    parsedDraft.config,
    patch,
    saving,
    showNotification,
    snapshot,
    t,
  ]);

  const handleReset = useCallback(() => {
    if (!snapshot) return;
    setDraft(toDraft(snapshot));
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

  const hasSplitSDKCounters =
    snapshot !== null &&
    typeof snapshot.compatibility_fallback_count === 'number' &&
    typeof snapshot.sdk_preferred_hit_count === 'number' &&
    typeof snapshot.session_observer_count === 'number';

  const statusItems = snapshot
    ? [
        {
          key: 'initialized',
          value: snapshot.initialized
            ? t('chatgpt_web.sentinel.yes')
            : t('chatgpt_web.sentinel.initialized_lazy'),
        },
        {
          key: 'available',
          value: !snapshot.initialized
            ? t('chatgpt_web.sentinel.awaiting_initialization')
            : snapshot.available
              ? t('chatgpt_web.sentinel.yes')
              : t('chatgpt_web.sentinel.no'),
        },
        { key: 'busy_workers', value: `${snapshot.busy} / ${snapshot.worker_limit}` },
        { key: 'queued', value: snapshot.queued },
        { key: 'source_pending', value: snapshot.source_pending },
        { key: 'source_waiters', value: snapshot.source_waiters },
        { key: 'bytecode_waiters', value: snapshot.bytecode_waiters },
        { key: 'observer_sessions', value: snapshot.observer_sessions },
        { key: 'sdk_version', value: snapshot.sdk_version || '-' },
        { key: 'sdk_sha256', value: snapshot.sdk_sha256 || '-' },
        { key: 'source_cache_entries', value: snapshot.source_cache_entries },
        { key: 'bytecode_cache_entries', value: snapshot.bytecode_cache_entries },
        ...(hasSplitSDKCounters
          ? [
              {
                key: 'compatibility_fallback_count',
                value: snapshot.compatibility_fallback_count as number,
              },
              {
                key: 'sdk_preferred_hit_count',
                value: snapshot.sdk_preferred_hit_count as number,
              },
              {
                key: 'session_observer_count',
                value: snapshot.session_observer_count as number,
              },
            ]
          : [{ key: 'fallback_count', value: snapshot.fallback_count }]),
        {
          key: 'last_error',
          value:
            snapshot.last_error === 'sentinel_sdk_busy'
              ? t('chatgpt_web.errors.sentinel_sdk_busy')
              : snapshot.last_error || t('chatgpt_web.sentinel.no_error'),
        },
      ]
    : [];

  const editorContent = (
    <>
      <div className={styles.runtimeRow}>
        <div>
          <strong>{t('chatgpt_web.sentinel.runtime_enabled')}</strong>
          <span>{t('chatgpt_web.sentinel.runtime_enabled_description')}</span>
        </div>
        <ToggleSwitch
          checked={draft.runtimeEnabled}
          onChange={(runtimeEnabled) => setDraft((current) => ({ ...current, runtimeEnabled }))}
          disabled={controlsDisabled}
          ariaLabel={t('chatgpt_web.sentinel.runtime_enabled')}
        />
      </div>

      <div className={styles.settingsGrid} aria-disabled={!draft.runtimeEnabled}>
        <label htmlFor="chatgpt-web-sentinel-workers">
          <span>
            {t('chatgpt_web.sentinel.workers')}
            {draft.workers === '0' ? (
              <small className={styles.autoBadge}>{t('chatgpt_web.sentinel.automatic')}</small>
            ) : null}
          </span>
          <input
            id="chatgpt-web-sentinel-workers"
            type="number"
            min={0}
            max={16}
            step={1}
            value={draft.workers}
            onChange={(event) =>
              setDraft((current) => ({ ...current, workers: event.target.value }))
            }
            disabled={controlsDisabled || !draft.runtimeEnabled}
          />
          <small>{t('chatgpt_web.sentinel.workers_hint')}</small>
        </label>
        <label htmlFor="chatgpt-web-sentinel-queue-size">
          <span>{t('chatgpt_web.sentinel.queue_size')}</span>
          <input
            id="chatgpt-web-sentinel-queue-size"
            type="number"
            min={0}
            max={1024}
            step={1}
            value={draft.queueSize}
            onChange={(event) =>
              setDraft((current) => ({ ...current, queueSize: event.target.value }))
            }
            disabled={controlsDisabled || !draft.runtimeEnabled}
          />
          <small>{t('chatgpt_web.sentinel.queue_size_hint')}</small>
        </label>
        <label htmlFor="chatgpt-web-sentinel-cache-versions">
          <span>{t('chatgpt_web.sentinel.cache_versions')}</span>
          <input
            id="chatgpt-web-sentinel-cache-versions"
            type="number"
            min={1}
            max={5}
            step={1}
            value={draft.cacheVersions}
            onChange={(event) =>
              setDraft((current) => ({ ...current, cacheVersions: event.target.value }))
            }
            disabled={controlsDisabled || !draft.runtimeEnabled}
          />
          <small>{t('chatgpt_web.sentinel.cache_versions_hint')}</small>
        </label>
      </div>

      {parsedDraft.errorKey ? (
        <p className={styles.validationError} role="alert">
          {t(parsedDraft.errorKey)}
        </p>
      ) : null}

      <div className={styles.statusHeading}>
        <div>
          <h3>{t('chatgpt_web.sentinel.status_title')}</h3>
          <p>{t('chatgpt_web.sentinel.status_description')}</p>
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
              ? `${t('chatgpt_web.sentinel.load_failed')}: ${loadError}`
              : t('chatgpt_web.sentinel.loading')}
          </span>
        </div>
      ) : (
        <dl className={styles.statusGrid}>
          {statusItems.map((item) => (
            <div key={item.key} data-field={item.key}>
              <dt>{t(`chatgpt_web.sentinel.status.${item.key}`)}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  if (embedded) {
    const summary = !snapshot
      ? t(loadError ? 'chatgpt_web.sentinel.load_failed' : 'chatgpt_web.sentinel.loading')
      : draft.runtimeEnabled
        ? t('config_management.settings_center.status_enabled')
        : t('config_management.settings_center.status_disabled');

    return (
      <ConfigDisclosure
        id="config-chatgpt-web-sentinel"
        title={t('chatgpt_web.sentinel.title')}
        description={t('chatgpt_web.sentinel.description')}
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
              {t('chatgpt_web.sentinel.reset')}
            </Button>
          ) : null
        }
      >
        <div className={styles.embeddedContent}>{editorContent}</div>
      </ConfigDisclosure>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="chatgpt-web-sentinel-title">
      <div className={styles.heading}>
        <div>
          <h2 id="chatgpt-web-sentinel-title">{t('chatgpt_web.sentinel.title')}</h2>
          <p>{t('chatgpt_web.sentinel.description')}</p>
        </div>
      </div>
      {editorContent}
      <div className={styles.footerActions}>
        <Button variant="secondary" disabled={controlsDisabled || !dirty} onClick={handleReset}>
          {t('chatgpt_web.sentinel.reset')}
        </Button>
        <Button
          onClick={() => void handleSave()}
          loading={saving}
          disabled={controlsDisabled || !dirty || !parsedDraft.config}
        >
          {t('common.save')}
        </Button>
      </div>
    </section>
  );
});
