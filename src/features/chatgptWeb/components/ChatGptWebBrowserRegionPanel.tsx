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
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { browserRegionApi } from '@/services/api/browserRegion';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  browserRegionDefaults,
  parseBrowserRegionDraft,
  regionToDraft,
  type BrowserRegionConfig,
  type BrowserRegionDraft,
  type BrowserRegionPreview,
} from '../browserRegion';
import styles from './ChatGptWebBrowserRegionPanel.module.scss';

export type ChatGptWebBrowserRegionPanelHandle = {
  save: () => Promise<boolean>;
  reload: () => Promise<void>;
  reset: () => void;
  validate: () => boolean;
};
type Props = {
  active?: boolean;
  disabled?: boolean;
  externalSaving?: boolean;
  connectionGenerationKey?: string;
  focusTarget?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onErrorCountChange?: (count: number) => void;
};
const panelID = 'config-chatgpt-web-browser-region';
const textFields = ['timezone', 'timezone-offset-minutes', 'language'] as const;
const advancedFields = [
  'lookup-url',
  'lookup-timeout-seconds',
  'cache-ttl-seconds',
  'route-cache-size',
  'ip-cache-size',
] as const;

export const ChatGptWebBrowserRegionPanel = forwardRef<ChatGptWebBrowserRegionPanelHandle, Props>(
  function ChatGptWebBrowserRegionPanel(
    {
      active = true,
      disabled = false,
      externalSaving = false,
      connectionGenerationKey = '',
      focusTarget,
      onDirtyChange,
      onErrorCountChange,
    },
    ref
  ) {
    const { t } = useTranslation();
    const notify = useNotificationStore((state) => state.showNotification);
    const connection = useMemo(
      () => ({ key: connectionGenerationKey, api: apiClient.captureConnection() }),
      [connectionGenerationKey]
    );
    const current = useRef(connection);
    current.current = connection;
    const mounted = useRef(true);
    const requests = useRef(new Set<AbortController>());
    const loadedConnection = useRef<typeof connection | null>(null);
    const loadVersion = useRef(0);
    const [expanded, setExpanded] = useState(false);
    const [baseline, setBaseline] = useState<BrowserRegionConfig | null>(null);
    const [draft, setDraft] = useState<BrowserRegionDraft>(() =>
      regionToDraft(browserRegionDefaults)
    );
    const [unsupported, setUnsupported] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [files, setFiles] = useState<AuthFileItem[]>([]);
    const [authIndex, setAuthIndex] = useState('');
    const [preview, setPreview] = useState<BrowserRegionPreview | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [pollStopped, setPollStopped] = useState(false);
    const parsed = useMemo(() => parseBrowserRegionDraft(draft), [draft]);
    const dirty =
      baseline !== null && JSON.stringify(draft) !== JSON.stringify(regionToDraft(baseline));
    const valid = parsed !== null;
    const readOnly =
      disabled ||
      externalSaving ||
      saving ||
      loading ||
      unsupported ||
      loadedConnection.current !== connection;
    const label = (key: string) => t(`chatgpt_web.browser_region.${key}`);
    const isCurrent = useCallback(
      () => mounted.current && current.current === connection,
      [connection]
    );
    const newRequest = useCallback(() => {
      const abort = new AbortController();
      requests.current.add(abort);
      return abort;
    }, []);
    const reportError = useCallback(
      (err: unknown, capabilityCheck = false) => {
        const status = (err as { status?: number })?.status;
        if (capabilityCheck && (status === 404 || status === 405 || status === 501)) {
          setUnsupported(true);
          return;
        }
        const reason = (err as { details?: { reason?: unknown } })?.details?.reason;
        const known = [
          'queue_full',
          'refresh_cooldown',
          'route_unresolved',
          'closed',
          'unavailable',
        ];
        setError(
          typeof reason === 'string' && known.includes(reason)
            ? t(`chatgpt_web.browser_region.values.${reason}`)
            : t('chatgpt_web.browser_region.request_failed')
        );
      },
      [t]
    );
    const reload = useCallback(async () => {
      const version = ++loadVersion.current;
      const abort = newRequest();
      setLoading(true);
      setError('');
      try {
        const config = await browserRegionApi.get(connection.api, abort.signal);
        if (!isCurrent() || abort.signal.aborted || version !== loadVersion.current) return;
        if (
          !config ||
          !Object.entries(browserRegionDefaults).every(([key, defaultValue]) => {
            const value = config[key as keyof BrowserRegionConfig];
            if (key === 'timezone-offset-minutes')
              return value === null || (typeof value === 'number' && Number.isFinite(value));
            return typeof value === typeof defaultValue;
          })
        ) {
          setUnsupported(true);
          return;
        }
        setBaseline(config);
        setDraft(regionToDraft(config));
        setUnsupported(false);
        loadedConnection.current = connection;
      } catch (err) {
        if (isCurrent() && !abort.signal.aborted && version === loadVersion.current)
          reportError(err, true);
      } finally {
        requests.current.delete(abort);
        if (isCurrent() && version === loadVersion.current) setLoading(false);
      }
    }, [connection, isCurrent, newRequest, reportError]);
    useEffect(() => {
      mounted.current = true;
      const pending = requests.current;
      return () => {
        mounted.current = false;
        pending.forEach((r) => r.abort());
        pending.clear();
      };
    }, []);
    useEffect(() => {
      setBaseline(null);
      setDraft(regionToDraft(browserRegionDefaults));
      setPreview(null);
      setAuthIndex('');
      setFiles([]);
      setSearch('');
      setPage(1);
      setUnsupported(false);
      setError('');
      setRefreshing(false);
      setSaving(false);
      loadedConnection.current = null;
      const pending = requests.current;
      return () => {
        pending.forEach((r) => r.abort());
        pending.clear();
      };
    }, [connection]);
    useEffect(() => {
      if (active && loadedConnection.current !== connection) void reload();
      if (!active) requests.current.forEach((request) => request.abort());
    }, [active, connection, reload]);
    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
      onErrorCountChange?.(dirty && !valid ? 1 : 0);
    }, [dirty, valid, onErrorCountChange]);
    useEffect(() => {
      if (focusTarget?.startsWith(panelID)) setExpanded(true);
    }, [focusTarget]);

    const save = useCallback(async () => {
      if (
        disabled ||
        saving ||
        unsupported ||
        !baseline ||
        !parsed ||
        loadedConnection.current !== connection
      )
        return false;
      const patch = Object.fromEntries(
        Object.entries(parsed).filter(
          ([key, value]) => value !== baseline[key as keyof BrowserRegionConfig]
        )
      );
      const abort = newRequest();
      setSaving(true);
      setError('');
      try {
        await browserRegionApi.save(connection.api, patch, abort.signal);
        if (!isCurrent() || abort.signal.aborted) return false;
        setBaseline(parsed);
        setDraft(regionToDraft(parsed));
        notify(t('config_management.save_success'), 'success');
        return true;
      } catch (err) {
        if (isCurrent() && !abort.signal.aborted) reportError(err);
        return false;
      } finally {
        requests.current.delete(abort);
        if (isCurrent()) setSaving(false);
      }
    }, [
      baseline,
      connection,
      disabled,
      isCurrent,
      newRequest,
      notify,
      parsed,
      reportError,
      saving,
      t,
      unsupported,
    ]);
    useImperativeHandle(
      ref,
      () => ({
        save,
        reload,
        reset: () => {
          if (baseline) setDraft(regionToDraft(baseline));
        },
        validate: () => valid,
      }),
      [baseline, reload, save, valid]
    );

    useEffect(() => {
      if (!active || !expanded || !baseline || unsupported) return;
      const abort = newRequest();
      const pending = requests.current;
      const timer = window.setTimeout(() => {
        void authFilesApi
          .listPaged(
            { page, pageSize: 20, provider: 'chatgpt-web', search },
            connection.api,
            abort.signal
          )
          .then((result) => {
            if (!isCurrent() || abort.signal.aborted) return;
            setFiles(result.files.slice(0, 20));
            setPages(result.pagination?.total_pages ?? 1);
          })
          .catch((err) => {
            if (isCurrent() && !abort.signal.aborted) reportError(err);
          })
          .finally(() => pending.delete(abort));
      }, 250);
      return () => {
        window.clearTimeout(timer);
        abort.abort();
        pending.delete(abort);
      };
    }, [
      active,
      baseline,
      connection,
      expanded,
      isCurrent,
      newRequest,
      page,
      reportError,
      search,
      unsupported,
    ]);

    useEffect(() => {
      setPreview(null);
      setPollStopped(false);
      if (!active || !expanded || !authIndex || unsupported) return;
      const abort = newRequest();
      const pending = requests.current;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let remaining = 60;
      const read = async () => {
        try {
          const value = await browserRegionApi.preview(connection.api, authIndex, abort.signal);
          if (!isCurrent() || abort.signal.aborted) return;
          setPreview(value);
          if (value.refresh_state === 'queued' || value.refresh_state === 'running') {
            if (--remaining > 0) timer = setTimeout(() => void read(), 1000);
            else setPollStopped(true);
          }
        } catch (err) {
          if (isCurrent() && !abort.signal.aborted) reportError(err);
        }
      };
      void read();
      return () => {
        clearTimeout(timer);
        abort.abort();
        pending.delete(abort);
      };
    }, [
      active,
      authIndex,
      connection,
      expanded,
      isCurrent,
      newRequest,
      refreshing,
      reportError,
      unsupported,
    ]);

    const refresh = async () => {
      if (readOnly || !authIndex || refreshing) return;
      const abort = newRequest();
      setRefreshing(true);
      setError('');
      try {
        await browserRegionApi.refresh(connection.api, authIndex, abort.signal);
      } catch (err) {
        if (isCurrent() && !abort.signal.aborted) reportError(err);
      } finally {
        requests.current.delete(abort);
        if (isCurrent()) setRefreshing(false);
      }
    };
    const field = (key: (typeof textFields)[number] | (typeof advancedFields)[number]) => (
      <label key={key}>
        <span>{label(key)}</span>
        <input
          aria-label={label(key)}
          value={draft[key]}
          disabled={readOnly}
          inputMode={
            key.endsWith('seconds') || key.endsWith('size') || key.endsWith('minutes')
              ? 'numeric'
              : undefined
          }
          onChange={(event) => setDraft((old) => ({ ...old, [key]: event.target.value }))}
        />
      </label>
    );
    return (
      <ConfigDisclosure
        id={panelID}
        title={label('title')}
        description={label('description')}
        expanded={expanded}
        onExpandedChange={setExpanded}
        dirty={dirty}
        errorCount={dirty && !valid ? 1 : 0}
      >
        <div className={styles.content}>
          {unsupported ? (
            <p role="status">{label('unsupported')}</p>
          ) : (
            <>
              {loading && <p role="status">{label('loading')}</p>}
              {(['auto-timezone', 'auto-language'] as const).map((key) => (
                <div className={styles.toggle} key={key}>
                  <span>{label(key)}</span>
                  <ToggleSwitch
                    checked={draft[key]}
                    disabled={readOnly}
                    ariaLabel={label(key)}
                    onChange={(value) => setDraft((old) => ({ ...old, [key]: value }))}
                  />
                </div>
              ))}
              <div className={styles.grid}>{textFields.map(field)}</div>
              <p className={styles.hint}>{label('fallback_hint')}</p>
              <details>
                <summary>{label('advanced')}</summary>
                <div className={styles.grid}>{advancedFields.map(field)}</div>
                <p className={styles.hint}>{label('lookup_hint')}</p>
                <p className={styles.hint}>{label('cache_hint')}</p>
              </details>
              {dirty && !valid && (
                <p role="alert" className={styles.error}>
                  {label('validation')}
                </p>
              )}
              <div className={styles.preview}>
                <h3>{label('preview')}</h3>
                <p className={styles.hint}>{label('saved_only')}</p>
                <label>
                  {label('search')}
                  <input
                    value={search}
                    disabled={readOnly}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label>
                  {label('credential')}
                  <select
                    aria-label={label('credential')}
                    value={authIndex}
                    disabled={readOnly}
                    onChange={(event) => setAuthIndex(event.target.value)}
                  >
                    <option value="">{label('select')}</option>
                    {files.map((file) => (
                      <option
                        key={file.name}
                        value={String(file.authIndex ?? '')}
                        disabled={!file.authIndex}
                      >
                        {file.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={readOnly || page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {label('previous')}
                  </Button>
                  <span>
                    {page} / {pages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={readOnly || page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {label('next')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={readOnly || !authIndex || refreshing}
                    onClick={() => void refresh()}
                  >
                    {label('refresh')}
                  </Button>
                </div>
                {preview && (
                  <dl className={styles.results}>
                    {(
                      [
                        'country',
                        'region',
                        'timezone',
                        'timezone_offset_minutes',
                        'language',
                        'timezone_source',
                        'language_source',
                        'observation_source',
                        'cache_state',
                        'cache_age_seconds',
                        'refresh_state',
                        'reason',
                        'retry_after_seconds',
                      ] as const
                    ).map((key) => (
                      <div key={key}>
                        <dt>{label(`preview_${key}`)}</dt>
                        <dd>
                          {typeof preview[key] === 'number'
                            ? preview[key]
                            : preview[key]
                              ? t(`chatgpt_web.browser_region.values.${preview[key]}`, {
                                  defaultValue: String(preview[key]),
                                })
                              : '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {pollStopped && (
                  <p role="status" className={styles.hint}>
                    {label('poll_limit')}
                  </p>
                )}
                <p className={styles.hint}>{label('dynamic_warning')}</p>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="secondary" disabled={loading || saving} onClick={() => void reload()}>
              {label('reload')}
            </Button>
            <Button disabled={readOnly || !dirty || !valid} onClick={() => void save()}>
              {label('save')}
            </Button>
          </div>
        </div>
      </ConfigDisclosure>
    );
  }
);
