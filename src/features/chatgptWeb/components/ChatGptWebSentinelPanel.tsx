import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

type ChatGptWebSentinelPanelProps = {
  disabled?: boolean;
};

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

export function ChatGptWebSentinelPanel({ disabled = false }: ChatGptWebSentinelPanelProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const requestSequenceRef = useRef(0);
  const translateRef = useRef(t);
  const notifyRef = useRef(showNotification);
  translateRef.current = t;
  notifyRef.current = showNotification;
  const [snapshot, setSnapshot] = useState<ChatGptWebSentinelSnapshot | null>(null);
  const [draft, setDraft] = useState<SentinelDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

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
    if (disabled) return undefined;
    void loadSnapshot();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [disabled, loadSnapshot]);

  const parsedDraft = useMemo(() => readConfig(draft), [draft]);
  const patch = useMemo(
    () => (snapshot && parsedDraft.config ? buildPatch(snapshot, parsedDraft.config) : {}),
    [parsedDraft.config, snapshot]
  );
  const dirty = Object.keys(patch).length > 0;
  const controlsDisabled = disabled || loading || saving || !snapshot;

  const handleSave = async () => {
    if (!snapshot || !parsedDraft.config || !dirty || saving) return;
    setSaving(true);
    try {
      await chatGptWebApi.patchSentinel(patch);
      const refreshed = await loadSnapshot(false);
      if (refreshed) {
        showNotification(t('chatgpt_web.sentinel.save_success'), 'success');
      } else {
        showNotification(t('chatgpt_web.sentinel.saved_refresh_failed'), 'warning');
      }
    } catch (error) {
      showNotification(
        `${t('chatgpt_web.sentinel.save_failed')}: ${getChatGptWebErrorMessage(error, t)}`,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

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
        { key: 'fallback_count', value: snapshot.fallback_count },
        {
          key: 'last_error',
          value:
            snapshot.last_error === 'sentinel_sdk_busy'
              ? t('chatgpt_web.errors.sentinel_sdk_busy')
              : snapshot.last_error || t('chatgpt_web.sentinel.no_error'),
        },
      ]
    : [];

  return (
    <section className={styles.panel} aria-labelledby="chatgpt-web-sentinel-title">
      <div className={styles.heading}>
        <div>
          <h2 id="chatgpt-web-sentinel-title">{t('chatgpt_web.sentinel.title')}</h2>
          <p>{t('chatgpt_web.sentinel.description')}</p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadSnapshot()}
            loading={loading}
            disabled={disabled || saving}
          >
            <IconRefreshCw size={15} />
            {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={controlsDisabled || !dirty || !parsedDraft.config}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

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
        <h3>{t('chatgpt_web.sentinel.status_title')}</h3>
        <p>{t('chatgpt_web.sentinel.status_description')}</p>
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
    </section>
  );
}
