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
  path: string;
  autoQuality: ChatGptWebImageUsageQuality;
};

export type ChatGptWebUsageCachePanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};

type ChatGptWebUsageCachePanelProps = {
  active?: boolean;
  disabled?: boolean;
  externalSaving?: boolean;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};

const DISCLOSURE_STORAGE_KEY = 'config-management:chatgpt-web-usage-cache-expanded';
const POLL_INTERVAL_MS = 5000;

const DEFAULT_DRAFT: UsageDraft = {
  estimate: true,
  cacheEnabled: false,
  thresholdMB: '1',
  maxDiskMB: '1024',
  path: '',
  autoQuality: 'medium',
};

const toDraft = (snapshot: ChatGptWebUsageSnapshot): UsageDraft => ({
  estimate: snapshot['estimate-token-usage'],
  cacheEnabled: snapshot['usage-cache'].enabled,
  thresholdMB: String(snapshot['usage-cache']['disk-threshold-mb']),
  maxDiskMB: String(snapshot['usage-cache']['max-disk-size-mb']),
  path: snapshot['usage-cache'].path,
  autoQuality: snapshot['image-usage']['auto-output-quality'],
});

const parsePositiveInteger = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
};

const readConfig = (
  draft: UsageDraft
): { config: ChatGptWebUsageConfig | null; errorKey: string | null } => {
  const thresholdMB = parsePositiveInteger(draft.thresholdMB);
  if (thresholdMB === null) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_threshold' };
  }
  const maxDiskMB = parsePositiveInteger(draft.maxDiskMB);
  if (maxDiskMB === null) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_max_disk' };
  }
  if (thresholdMB > maxDiskMB) {
    return { config: null, errorKey: 'chatgpt_web.usage_cache.validation_order' };
  }
  return {
    config: {
      'estimate-token-usage': draft.estimate,
      'usage-cache': {
        enabled: draft.cacheEnabled,
        'disk-threshold-mb': thresholdMB,
        'max-disk-size-mb': maxDiskMB,
        path: draft.path.trim(),
      },
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

export const ChatGptWebUsageCachePanel = forwardRef<
  ChatGptWebUsageCachePanelHandle,
  ChatGptWebUsageCachePanelProps
>(function ChatGptWebUsageCachePanel(
  {
    active = true,
    disabled = false,
    externalSaving = false,
    focusTarget,
    onDirtyChange,
    onErrorCountChange,
  },
  ref
) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const requestSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<ChatGptWebUsageSnapshot | null>(null);
  const [draft, setDraftState] = useState<UsageDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem(DISCLOSURE_STORAGE_KEY) === 'true'
  );

  const setDraft = useCallback((next: UsageDraft | ((current: UsageDraft) => UsageDraft)) => {
    setDraftState(next);
  }, []);

  const loadSnapshot = useCallback(
    async (options: { notify?: boolean; preserveDraft?: boolean; background?: boolean } = {}) => {
      const requestSequence = ++requestSequenceRef.current;
      if (!options.background) setLoading(true);
      try {
        const next = await chatGptWebApi.getUsageCache();
        if (requestSequence !== requestSequenceRef.current) return null;
        setSnapshot(next);
        if (!options.preserveDraft) setDraft(toDraft(next));
        setLoadError('');
        return next;
      } catch (error) {
        if (requestSequence !== requestSequenceRef.current) return null;
        const message = getChatGptWebErrorMessage(error, t);
        setLoadError(message);
        if (options.notify !== false) {
          showNotification(`${t('chatgpt_web.usage_cache.load_failed')}: ${message}`, 'error');
        }
        return null;
      } finally {
        if (requestSequence === requestSequenceRef.current && !options.background)
          setLoading(false);
      }
    },
    [setDraft, showNotification, t]
  );

  useEffect(() => {
    if (disabled || !active || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadSnapshot();
  }, [active, disabled, loadSnapshot]);

  const parsedDraft = useMemo(() => readConfig(draft), [draft]);
  const dirty = snapshot ? JSON.stringify(draft) !== JSON.stringify(toDraft(snapshot)) : false;
  const errorCount = (parsedDraft.errorKey ? 1 : 0) + (loadError ? 1 : 0);
  const controlsDisabled = disabled || externalSaving || loading || saving || !snapshot;

  useEffect(() => {
    if (disabled || !active || !expanded || !hasLoadedRef.current) return;
    const timer = window.setInterval(() => {
      void loadSnapshot({ notify: false, preserveDraft: dirty, background: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, dirty, disabled, expanded, loadSnapshot]);

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
    if (!snapshot || !parsedDraft.config || saving) return false;
    setSaving(true);
    try {
      await chatGptWebApi.patchUsageCache(parsedDraft.config);
      const refreshed = await loadSnapshot({ notify: false });
      if (!refreshed) {
        setSnapshot({ ...parsedDraft.config, stats: snapshot.stats });
        setDraft(toDraft({ ...parsedDraft.config, stats: snapshot.stats }));
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
  }, [dirty, loadSnapshot, parsedDraft.config, saving, setDraft, showNotification, snapshot, t]);

  const handleReset = useCallback(() => {
    if (snapshot) setDraft(toDraft(snapshot));
  }, [setDraft, snapshot]);

  const runValidation = useCallback(() => {
    const valid = parsedDraft.config !== null;
    if (!valid) setExpanded(true);
    return valid;
  }, [parsedDraft.config]);

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      reload: async () => {
        if (disabled || (!active && !hasLoadedRef.current)) return;
        hasLoadedRef.current = true;
        await loadSnapshot({ notify: false });
      },
      reset: handleReset,
      validate: runValidation,
    }),
    [active, disabled, handleReset, handleSave, loadSnapshot, runValidation]
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

        <div className={styles.settingsGrid} aria-disabled={!draft.estimate}>
          <label htmlFor="chatgpt-web-usage-threshold">
            <span>{t('chatgpt_web.usage_cache.threshold')}</span>
            <input
              id="chatgpt-web-usage-threshold"
              type="number"
              min={1}
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
            <small>{t('chatgpt_web.usage_cache.path_hint')}</small>
          </label>
        </div>

        {parsedDraft.errorKey ? (
          <p className={styles.validationError} role="alert">
            {t(parsedDraft.errorKey)}
          </p>
        ) : null}
        <p className={styles.securityNotice}>{t('chatgpt_web.usage_cache.security_notice')}</p>

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
                ['write_errors', stats?.write_errors ?? 0],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`chatgpt_web.usage_cache.status.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </ConfigDisclosure>
  );
});
