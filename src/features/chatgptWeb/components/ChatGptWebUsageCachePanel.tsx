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
  ChatGptWebImageUsageQuality,
  ChatGptWebUsageConfig,
  ChatGptWebUsageSnapshot,
} from '@/types';
import { getChatGptWebErrorMessage } from '@/utils/chatgptWeb';
import styles from './ChatGptWebUsageCachePanel.module.scss';

type UsageDraft = {
  estimate: boolean;
  cacheEnabled: boolean;
  thresholdMB: string;
  maxDiskMB: string;
  resourceGuardEnabled: boolean;
  minAvailableDiskMB: string;
  maxFilesystemUsedPercent: string;
  orphanRetentionMinutes: string;
  path: string;
  autoQuality: ChatGptWebImageUsageQuality;
};

type FeatureSupport = 'unknown' | 'supported' | 'unsupported';

export type ChatGptWebUsageCachePanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebUsageCachePanelProps = {
  active?: boolean;
  disabled?: boolean;
  connectionGenerationKey?: string;
  externalSaving?: boolean;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-usage-cache-expanded';
const POLL_INTERVAL_MS = 5000;
const MAX_USAGE_CACHE_MEGABYTES = 8_796_093_022_207;
const MAX_ORPHAN_RETENTION_MINUTES = 10_080;

const DEFAULT_DRAFT: UsageDraft = {
  estimate: true,
  cacheEnabled: false,
  thresholdMB: '1',
  maxDiskMB: '1024',
  resourceGuardEnabled: true,
  minAvailableDiskMB: '1024',
  maxFilesystemUsedPercent: '95',
  orphanRetentionMinutes: '0',
  path: '',
  autoQuality: 'medium',
};

const toDraft = (snapshot: ChatGptWebUsageSnapshot): UsageDraft => ({
  estimate: snapshot['estimate-token-usage'],
  cacheEnabled: snapshot['usage-cache'].enabled,
  thresholdMB: String(snapshot['usage-cache']['disk-threshold-mb']),
  maxDiskMB: String(snapshot['usage-cache']['max-disk-size-mb']),
  resourceGuardEnabled: snapshot['usage-cache']['resource-guard-enabled'] ?? true,
  minAvailableDiskMB: String(snapshot['usage-cache']['min-available-disk-mb'] ?? 1024),
  maxFilesystemUsedPercent: String(snapshot['usage-cache']['max-filesystem-used-percent'] ?? 95),
  orphanRetentionMinutes: String(snapshot['usage-cache']['orphan-retention-minutes'] ?? 0),
  path: snapshot['usage-cache'].path,
  autoQuality: snapshot['image-usage']['auto-output-quality'],
});

const hasResourceGuardSupport = (snapshot: ChatGptWebUsageSnapshot): boolean =>
  snapshot['usage-cache']['resource-guard-enabled'] !== undefined &&
  snapshot['usage-cache']['min-available-disk-mb'] !== undefined &&
  snapshot['usage-cache']['max-filesystem-used-percent'] !== undefined;

const hasOrphanCleanupSupport = (snapshot: ChatGptWebUsageSnapshot): boolean =>
  snapshot['usage-cache']['orphan-retention-minutes'] !== undefined &&
  snapshot.stats.orphan_directory_count !== undefined;

const parsePositiveInteger = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
};

const parseNonNegativeInteger = (value: string): number | null => {
  const normalized = value.trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const readConfig = (
  draft: UsageDraft,
  resourceGuardSupported: boolean,
  orphanCleanupSupported: boolean
): { config: ChatGptWebUsageConfig | null; errorKey: string | null } => {
  const thresholdMB = parsePositiveInteger(draft.thresholdMB);
  if (thresholdMB === null || thresholdMB > MAX_USAGE_CACHE_MEGABYTES) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_threshold' };
  }
  const maxDiskMB = parsePositiveInteger(draft.maxDiskMB);
  if (maxDiskMB === null || maxDiskMB > MAX_USAGE_CACHE_MEGABYTES) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_max_disk' };
  }
  if (thresholdMB > maxDiskMB) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_order' };
  }
  const minAvailableDiskMB = parseNonNegativeInteger(draft.minAvailableDiskMB);
  if (
    resourceGuardSupported &&
    (minAvailableDiskMB === null || minAvailableDiskMB > MAX_USAGE_CACHE_MEGABYTES)
  ) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_min_available' };
  }
  const maxFilesystemUsedPercent = parsePositiveInteger(draft.maxFilesystemUsedPercent);
  if (
    resourceGuardSupported &&
    (maxFilesystemUsedPercent === null || maxFilesystemUsedPercent > 100)
  ) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_max_used' };
  }
  const orphanRetentionMinutes = parseNonNegativeInteger(draft.orphanRetentionMinutes);
  if (
    orphanCleanupSupported &&
    (orphanRetentionMinutes === null || orphanRetentionMinutes > MAX_ORPHAN_RETENTION_MINUTES)
  ) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_orphan_retention' };
  }
  const usageCache: ChatGptWebUsageConfig['usage-cache'] = {
    enabled: draft.cacheEnabled,
    'disk-threshold-mb': thresholdMB,
    'max-disk-size-mb': maxDiskMB,
    path: draft.path.trim(),
  };
  if (resourceGuardSupported) {
    usageCache['resource-guard-enabled'] = draft.resourceGuardEnabled;
    usageCache['min-available-disk-mb'] = minAvailableDiskMB ?? 0;
    usageCache['max-filesystem-used-percent'] = maxFilesystemUsedPercent ?? 95;
  }
  if (orphanCleanupSupported) {
    usageCache['orphan-retention-minutes'] = orphanRetentionMinutes ?? 0;
  }
  return {
    config: {
      'estimate-token-usage': draft.estimate,
      'usage-cache': usageCache,
      'image-usage': { 'auto-output-quality': draft.autoQuality },
    },
    errorKey: null,
  };
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatTimestamp = (value: string | null | undefined, locale: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '-'
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(parsed);
};

const ownershipStatusKey = (status?: string): string => {
  if (status === 'owned') return 'chatgpt_web.usage_cache.ownership_owned';
  if (status) return 'chatgpt_web.usage_cache.ownership_unknown';
  return 'chatgpt_web.usage_cache.not_initialized';
};

export const ChatGptWebUsageCachePanel = forwardRef<
  ChatGptWebUsageCachePanelHandle,
  ChatGptWebUsageCachePanelProps
>(function ChatGptWebUsageCachePanel(
  {
    active = true,
    disabled = false,
    connectionGenerationKey = '',
    externalSaving = false,
    focusTarget,
    onDirtyChange,
    onErrorCountChange,
  },
  ref
) {
  const { t, i18n } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const requestSequenceRef = useRef(0);
  const connectionGenerationKeyRef = useRef(connectionGenerationKey);
  const snapshotGenerationKeyRef = useRef<string | null>(null);
  if (connectionGenerationKeyRef.current !== connectionGenerationKey) {
    connectionGenerationKeyRef.current = connectionGenerationKey;
    requestSequenceRef.current += 1;
  }
  const previousConnectionGenerationKeyRef = useRef(connectionGenerationKey);
  const hasLoadedRef = useRef(false);
  const snapshotRef = useRef<ChatGptWebUsageSnapshot | null>(null);
  const draftVersionRef = useRef(0);
  const [snapshot, setSnapshot] = useState<ChatGptWebUsageSnapshot | null>(null);
  const [draft, setDraftState] = useState<UsageDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resourceGuardSupport, setResourceGuardSupport] = useState<FeatureSupport>('unknown');
  const [orphanCleanupSupport, setOrphanCleanupSupport] = useState<FeatureSupport>('unknown');
  const [connectionConflict, setConnectionConflict] = useState(false);
  const [serverConfigConflict, setServerConfigConflict] = useState(false);
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const setDraft = useCallback((next: UsageDraft | ((current: UsageDraft) => UsageDraft)) => {
    setDraftState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      draftVersionRef.current += 1;
      return resolved;
    });
  }, []);

  const loadSnapshot = useCallback(
    async (options: { notify?: boolean; preserveDraft?: boolean; background?: boolean } = {}) => {
      const requestSequence = ++requestSequenceRef.current;
      const requestGenerationKey = connectionGenerationKeyRef.current;
      const draftVersion = draftVersionRef.current;
      if (!options.background) setLoading(true);
      try {
        const next = await chatGptWebApi.getUsageCache();
        if (
          requestSequence !== requestSequenceRef.current ||
          requestGenerationKey !== connectionGenerationKeyRef.current
        )
          return null;
        const previousSnapshot = snapshotRef.current;
        const preserveDraft = options.preserveDraft || draftVersion !== draftVersionRef.current;
        if (
          preserveDraft &&
          previousSnapshot &&
          JSON.stringify(toDraft(previousSnapshot)) !== JSON.stringify(toDraft(next))
        ) {
          setServerConfigConflict(true);
        }
        snapshotRef.current = next;
        setSnapshot(next);
        snapshotGenerationKeyRef.current = requestGenerationKey;
        setResourceGuardSupport(hasResourceGuardSupport(next) ? 'supported' : 'unsupported');
        setOrphanCleanupSupport(hasOrphanCleanupSupport(next) ? 'supported' : 'unsupported');
        if (!preserveDraft) {
          setDraft(toDraft(next));
          setServerConfigConflict(false);
        }
        setLoadError('');
        return next;
      } catch (error) {
        if (
          requestSequence !== requestSequenceRef.current ||
          requestGenerationKey !== connectionGenerationKeyRef.current
        )
          return null;
        const message = getChatGptWebErrorMessage(error, t);
        setLoadError(message);
        if (options.notify !== false) {
          showNotification(`${t('chatgpt_web.usage_cache.load_failed')}: ${message}`, 'error');
        }
        return null;
      } finally {
        if (
          requestSequence === requestSequenceRef.current &&
          requestGenerationKey === connectionGenerationKeyRef.current &&
          !options.background
        )
          setLoading(false);
      }
    },
    [setDraft, showNotification, t]
  );

  const resourceGuardSupported = resourceGuardSupport === 'supported';
  const orphanCleanupSupported = orphanCleanupSupport === 'supported';
  const parsedDraft = useMemo(
    () => readConfig(draft, resourceGuardSupported, orphanCleanupSupported),
    [draft, orphanCleanupSupported, resourceGuardSupported]
  );
  const snapshotDirty = snapshot
    ? JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot))
    : false;
  const dirty = connectionConflict || serverConfigConflict || snapshotDirty;
  const errorCount =
    (parsedDraft.errorKey ? 1 : 0) +
    (loadError ? 1 : 0) +
    (connectionConflict ? 1 : 0) +
    (serverConfigConflict ? 1 : 0);
  const controlsDisabled = disabled || externalSaving || loading || saving || !snapshot;

  useEffect(() => {
    if (previousConnectionGenerationKeyRef.current !== connectionGenerationKey) {
      previousConnectionGenerationKeyRef.current = connectionGenerationKey;
      hasLoadedRef.current = false;
      snapshotRef.current = null;
      setSnapshot(null);
      snapshotGenerationKeyRef.current = null;
      if (!dirty) setDraft(DEFAULT_DRAFT);
      setLoading(false);
      setLoadError('');
      setResourceGuardSupport('unknown');
      setOrphanCleanupSupport('unknown');
      setConnectionConflict(dirty);
      setServerConfigConflict(false);
    }
    if (disabled || !active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadSnapshot({ preserveDraft: dirty });
  }, [active, connectionGenerationKey, dirty, disabled, loadSnapshot, setDraft]);

  useEffect(() => {
    if (disabled || !active || !expanded || !hasLoadedRef.current) return;
    const timer = window.setInterval(() => {
      void loadSnapshot({ notify: false, preserveDraft: dirty, background: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, connectionGenerationKey, dirty, disabled, expanded, loadSnapshot]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
    },
    []
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onErrorCountChange?.(errorCount);
    return () => onErrorCountChange?.(0);
  }, [errorCount, onErrorCountChange]);

  useEffect(() => {
    if (!focusTarget?.startsWith('config-chatgpt-web-usage-cache')) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      const target = document.getElementById('config-chatgpt-web-usage-cache');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (
      connectionConflict ||
      serverConfigConflict ||
      snapshotGenerationKeyRef.current !== connectionGenerationKeyRef.current ||
      !snapshot ||
      !parsedDraft.config ||
      saving
    )
      return false;
    const saveGenerationKey = connectionGenerationKeyRef.current;
    setSaving(true);
    try {
      await chatGptWebApi.patchUsageCache(parsedDraft.config);
      if (saveGenerationKey !== connectionGenerationKeyRef.current) return false;
      const refreshed = await loadSnapshot({ notify: false });
      if (saveGenerationKey !== connectionGenerationKeyRef.current) return false;
      if (!refreshed) {
        const fallbackSnapshot = {
          ...parsedDraft.config,
          stats: snapshot.stats,
          filesystem: snapshot.filesystem,
        };
        snapshotRef.current = fallbackSnapshot;
        setSnapshot(fallbackSnapshot);
        setDraft(toDraft(fallbackSnapshot));
        setServerConfigConflict(false);
        showNotification(t('chatgpt_web.usage_cache.saved_refresh_failed'), 'warning');
      }
      return true;
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.usage_cache.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    connectionConflict,
    dirty,
    loadSnapshot,
    parsedDraft.config,
    saving,
    serverConfigConflict,
    setDraft,
    showNotification,
    snapshot,
    t,
  ]);

  const handleReset = useCallback(() => {
    if (!snapshot) return;
    setDraft(toDraft(snapshot));
    setConnectionConflict(false);
    setServerConfigConflict(false);
  }, [setDraft, snapshot]);

  const runValidation = useCallback(() => {
    const valid = parsedDraft.config !== null && !connectionConflict && !serverConfigConflict;
    if (!valid) setExpanded(true);
    return valid;
  }, [connectionConflict, parsedDraft.config, serverConfigConflict]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: async () => {
        if (disabled || (!active && !hasLoadedRef.current)) return;
        hasLoadedRef.current = true;
        await loadSnapshot({ notify: false, preserveDraft: dirty });
      },
      reset: handleReset,
      validate: runValidation,
    }),
    [active, dirty, disabled, handleReset, handleSave, loadSnapshot, runValidation]
  );

  const handleExpandedChange = useCallback((nextExpanded: boolean) => {
    setExpanded(nextExpanded);
    localStorage.setItem(DISCLOSURE_STORAGE_KEY, String(nextExpanded));
  }, []);

  const maxDiskBytes = (parsePositiveInteger(draft.maxDiskMB) ?? 0) * 1024 * 1024;
  const diskPercent =
    snapshot && maxDiskBytes > 0
      ? Math.min(100, (snapshot.stats.active_disk_bytes / maxDiskBytes) * 100)
      : 0;
  const stats = snapshot?.stats;
  const filesystem = snapshot?.filesystem;
  const filesystemReady = filesystem?.status === 'ok' && filesystem.total_bytes > 0;
  const filesystemPercent = filesystemReady
    ? Math.min(100, Math.max(0, filesystem.used_percent))
    : 0;
  const minAvailableBytes = (parseNonNegativeInteger(draft.minAvailableDiskMB) ?? 0) * 1024 * 1024;
  const maxUsedPercent = parsePositiveInteger(draft.maxFilesystemUsedPercent) ?? 100;
  const resourcePressure =
    draft.cacheEnabled &&
    resourceGuardSupported &&
    draft.resourceGuardEnabled &&
    filesystemReady &&
    (filesystem.available_bytes <= minAvailableBytes || filesystem.used_percent >= maxUsedPercent);

  return (
    <ConfigDisclosure
      id="config-chatgpt-web-usage-cache"
      title={t('chatgpt_web.usage_cache.title')}
      description={t('chatgpt_web.usage_cache.description')}
      summary={
        draft.estimate
          ? draft.cacheEnabled
            ? t('chatgpt_web.usage_cache.summary_hybrid')
            : t('chatgpt_web.usage_cache.summary_memory')
          : t('chatgpt_web.usage_cache.summary_disabled')
      }
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
            {t('chatgpt_web.usage_cache.reset')}
          </Button>
        ) : undefined
      }
    >
      <div className={styles.content}>
        <div className={styles.toggleRow}>
          <div>
            <strong>{t('chatgpt_web.usage_cache.estimate')}</strong>
            <span>{t('chatgpt_web.usage_cache.estimate_description')}</span>
          </div>
          <ToggleSwitch
            checked={draft.estimate}
            onChange={(estimate) => setDraft((current) => ({ ...current, estimate }))}
            disabled={controlsDisabled}
            ariaLabel={t('chatgpt_web.usage_cache.estimate')}
          />
        </div>

        <div className={styles.toggleRow}>
          <div>
            <strong>{t('chatgpt_web.usage_cache.disk_enabled')}</strong>
            <span>{t('chatgpt_web.usage_cache.disk_enabled_description')}</span>
          </div>
          <ToggleSwitch
            checked={draft.cacheEnabled}
            onChange={(cacheEnabled) => setDraft((current) => ({ ...current, cacheEnabled }))}
            disabled={controlsDisabled || !draft.estimate}
            ariaLabel={t('chatgpt_web.usage_cache.disk_enabled')}
          />
        </div>

        {resourceGuardSupport === 'supported' ? (
          <div className={styles.toggleRow}>
            <div>
              <strong>{t('chatgpt_web.usage_cache.resource_guard')}</strong>
              <span>{t('chatgpt_web.usage_cache.resource_guard_description')}</span>
            </div>
            <ToggleSwitch
              checked={draft.resourceGuardEnabled}
              onChange={(resourceGuardEnabled) =>
                setDraft((current) => ({ ...current, resourceGuardEnabled }))
              }
              disabled={controlsDisabled || !draft.estimate || !draft.cacheEnabled}
              ariaLabel={t('chatgpt_web.usage_cache.resource_guard')}
            />
          </div>
        ) : resourceGuardSupport === 'unsupported' ? (
          <p className={styles.securityNotice}>
            {t('chatgpt_web.usage_cache.resource_guard_unsupported')}
          </p>
        ) : null}

        <div className={styles.settingsGrid} aria-disabled={!draft.estimate}>
          <label htmlFor="chatgpt-web-usage-threshold">
            <span>{t('chatgpt_web.usage_cache.threshold')}</span>
            <input
              id="chatgpt-web-usage-threshold"
              type="number"
              min={1}
              max={MAX_USAGE_CACHE_MEGABYTES}
              step={1}
              value={draft.thresholdMB}
              onChange={(event) =>
                setDraft((current) => ({ ...current, thresholdMB: event.target.value }))
              }
              disabled={controlsDisabled || !draft.estimate || !draft.cacheEnabled}
            />
            <small>{t('chatgpt_web.usage_cache.threshold_hint')}</small>
          </label>
          <label htmlFor="chatgpt-web-usage-max-disk">
            <span>{t('chatgpt_web.usage_cache.max_disk')}</span>
            <input
              id="chatgpt-web-usage-max-disk"
              type="number"
              min={1}
              max={MAX_USAGE_CACHE_MEGABYTES}
              step={1}
              value={draft.maxDiskMB}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxDiskMB: event.target.value }))
              }
              disabled={controlsDisabled || !draft.estimate || !draft.cacheEnabled}
            />
            <small>{t('chatgpt_web.usage_cache.max_disk_hint')}</small>
          </label>
          <label htmlFor="chatgpt-web-usage-quality">
            <span>{t('chatgpt_web.usage_cache.auto_quality')}</span>
            <select
              id="chatgpt-web-usage-quality"
              value={draft.autoQuality}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  autoQuality: event.target.value as ChatGptWebImageUsageQuality,
                }))
              }
              disabled={controlsDisabled || !draft.estimate}
            >
              <option value="low">{t('chatgpt_web.usage_cache.quality_low')}</option>
              <option value="medium">{t('chatgpt_web.usage_cache.quality_medium')}</option>
              <option value="high">{t('chatgpt_web.usage_cache.quality_high')}</option>
            </select>
            <small>{t('chatgpt_web.usage_cache.auto_quality_hint')}</small>
          </label>
          {resourceGuardSupported ? (
            <>
              <label htmlFor="chatgpt-web-usage-min-available">
                <span>{t('chatgpt_web.usage_cache.min_available')}</span>
                <input
                  id="chatgpt-web-usage-min-available"
                  type="number"
                  min={0}
                  max={MAX_USAGE_CACHE_MEGABYTES}
                  step={1}
                  value={draft.minAvailableDiskMB}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      minAvailableDiskMB: event.target.value,
                    }))
                  }
                  disabled={
                    controlsDisabled ||
                    !draft.estimate ||
                    !draft.cacheEnabled ||
                    !draft.resourceGuardEnabled
                  }
                />
                <small>{t('chatgpt_web.usage_cache.min_available_hint')}</small>
              </label>
              <label htmlFor="chatgpt-web-usage-max-used-percent">
                <span>{t('chatgpt_web.usage_cache.max_used_percent')}</span>
                <input
                  id="chatgpt-web-usage-max-used-percent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draft.maxFilesystemUsedPercent}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxFilesystemUsedPercent: event.target.value,
                    }))
                  }
                  disabled={
                    controlsDisabled ||
                    !draft.estimate ||
                    !draft.cacheEnabled ||
                    !draft.resourceGuardEnabled
                  }
                />
                <small>{t('chatgpt_web.usage_cache.max_used_percent_hint')}</small>
              </label>
            </>
          ) : null}
          {orphanCleanupSupported ? (
            <label htmlFor="chatgpt-web-usage-orphan-retention">
              <span>{t('chatgpt_web.usage_cache.orphan_retention')}</span>
              <input
                id="chatgpt-web-usage-orphan-retention"
                type="number"
                min={0}
                max={MAX_ORPHAN_RETENTION_MINUTES}
                step={1}
                value={draft.orphanRetentionMinutes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    orphanRetentionMinutes: event.target.value,
                  }))
                }
                disabled={controlsDisabled}
              />
              <small>{t('chatgpt_web.usage_cache.orphan_retention_hint')}</small>
            </label>
          ) : null}
          <label className={styles.pathField} htmlFor="chatgpt-web-usage-path">
            <span>{t('chatgpt_web.usage_cache.path')}</span>
            <input
              id="chatgpt-web-usage-path"
              type="text"
              value={draft.path}
              placeholder={t('chatgpt_web.usage_cache.path_placeholder')}
              onChange={(event) =>
                setDraft((current) => ({ ...current, path: event.target.value }))
              }
              disabled={controlsDisabled || !draft.estimate || !draft.cacheEnabled}
            />
            <small>
              {t(
                orphanCleanupSupported
                  ? 'chatgpt_web.usage_cache.path_hint'
                  : 'chatgpt_web.usage_cache.path_hint_legacy'
              )}
            </small>
          </label>
        </div>

        {parsedDraft.errorKey ? (
          <p className={styles.validationError} role="alert">
            {t(parsedDraft.errorKey)}
          </p>
        ) : null}
        {connectionConflict ? (
          <p className={styles.validationError} role="alert">
            {t('chatgpt_web.usage_cache.connection_changed_draft_retained')}
          </p>
        ) : null}
        {serverConfigConflict ? (
          <p className={styles.validationError} role="alert">
            {t('chatgpt_web.usage_cache.server_configuration_changed_draft_retained')}
          </p>
        ) : null}
        {resourcePressure ? (
          <p className={styles.validationError} role="status">
            {t('chatgpt_web.usage_cache.resource_pressure')}
          </p>
        ) : null}
        <p className={styles.securityNotice}>
          {t(
            orphanCleanupSupported
              ? 'chatgpt_web.usage_cache.security_notice'
              : 'chatgpt_web.usage_cache.security_notice_legacy'
          )}
        </p>

        <div className={styles.statusHeading}>
          <div>
            <h3>{t('chatgpt_web.usage_cache.status_title')}</h3>
            <p>{t('chatgpt_web.usage_cache.status_description')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadSnapshot({ preserveDraft: dirty })}
            loading={loading}
            disabled={disabled || externalSaving || saving}
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
                ? `${t('chatgpt_web.usage_cache.load_failed')}: ${loadError}`
                : t('chatgpt_web.usage_cache.loading')}
            </span>
          </div>
        ) : (
          <>
            <div className={styles.capacity}>
              <div>
                <span>{t('chatgpt_web.usage_cache.disk_usage')}</span>
                <strong>
                  {formatBytes(stats?.active_disk_bytes ?? 0)} / {formatBytes(maxDiskBytes)}
                </strong>
              </div>
              <div
                className={styles.capacityTrack}
                aria-label={t('chatgpt_web.usage_cache.disk_usage')}
              >
                <span style={{ width: `${diskPercent}%` }} />
              </div>
            </div>
            <dl className={styles.statusGrid}>
              {[
                [
                  'active_memory',
                  `${stats?.active_memory_entries ?? 0} / ${formatBytes(stats?.active_memory_bytes ?? 0)}`,
                ],
                [
                  'active_disk',
                  `${stats?.active_disk_entries ?? 0} / ${formatBytes(stats?.active_disk_bytes ?? 0)}`,
                ],
                ['peak_disk', formatBytes(stats?.peak_disk_bytes ?? 0)],
                ['successful', stats?.successful_calculations ?? 0],
                ['discarded', stats?.failed_discards ?? 0],
                ['rejected', stats?.capacity_rejections ?? 0],
                ['resource_rejected', stats?.resource_rejections ?? 0],
                ['write_errors', stats?.write_errors ?? 0],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`chatgpt_web.usage_cache.status.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {orphanCleanupSupported ? (
              <div className={styles.ownership}>
                <div className={styles.filesystemHeading}>
                  <div>
                    <span>{t('chatgpt_web.usage_cache.instance_directory')}</span>
                    <strong>{stats?.instance_directory || '-'}</strong>
                  </div>
                  <span className={styles.filesystemState}>
                    {t(ownershipStatusKey(stats?.ownership_status))}
                  </span>
                </div>
                <dl className={styles.statusGrid}>
                  {[
                    ['orphan_directories', stats?.orphan_directory_count ?? 0],
                    ['orphan_files', stats?.orphan_file_count ?? 0],
                    ['orphan_bytes', formatBytes(stats?.orphan_bytes ?? 0)],
                    ['retained_orphan_bytes', formatBytes(stats?.retained_orphan_bytes ?? 0)],
                    ['legacy_directories', stats?.legacy_directory_count ?? 0],
                    ['legacy_files', stats?.legacy_file_count ?? 0],
                    ['legacy_bytes', formatBytes(stats?.legacy_bytes ?? 0)],
                    ['cleanup_count', stats?.cleanup_count ?? 0],
                    ['cleanup_errors', stats?.cleanup_errors ?? 0],
                    [
                      'last_cleanup_at',
                      formatTimestamp(
                        stats?.last_cleanup_at,
                        i18n.resolvedLanguage || i18n.language || 'en'
                      ),
                    ],
                  ].map(([key, value]) => (
                    <div key={key}>
                      <dt>{t(`chatgpt_web.usage_cache.status.${key}`)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <div className={styles.filesystem}>
              <div className={styles.filesystemHeading}>
                <div>
                  <span>{t('chatgpt_web.usage_cache.filesystem_title')}</span>
                  <strong>{filesystem?.path || '-'}</strong>
                </div>
                {!filesystemReady ? (
                  <span className={styles.filesystemState}>
                    {t(
                      filesystem?.status === 'unavailable'
                        ? 'chatgpt_web.usage_cache.filesystem_unavailable'
                        : 'chatgpt_web.usage_cache.filesystem_unsupported'
                    )}
                  </span>
                ) : null}
              </div>
              {filesystemReady ? (
                <>
                  <div
                    className={styles.capacityTrack}
                    aria-label={t('chatgpt_web.usage_cache.filesystem_title')}
                  >
                    <span style={{ width: `${filesystemPercent}%` }} />
                  </div>
                  <dl className={styles.filesystemStats}>
                    <div>
                      <dt>{t('chatgpt_web.usage_cache.filesystem_used')}</dt>
                      <dd>{formatBytes(filesystem.used_bytes)}</dd>
                    </div>
                    <div>
                      <dt>{t('chatgpt_web.usage_cache.filesystem_available')}</dt>
                      <dd>{formatBytes(filesystem.available_bytes)}</dd>
                    </div>
                    <div>
                      <dt>{t('chatgpt_web.usage_cache.filesystem_total')}</dt>
                      <dd>{formatBytes(filesystem.total_bytes)}</dd>
                    </div>
                  </dl>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </ConfigDisclosure>
  );
});
