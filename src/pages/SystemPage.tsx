import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconGithub, IconBookOpen, IconExternalLink, IconCode } from '@/components/ui/icons';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import { chatGptWebApi, configApi, systemMetricsApi, versionApi } from '@/services/api';
import type { ControlPanelUpdateStatus } from '@/services/api/config';
import { apiKeysApi } from '@/services/api/apiKeys';
import type {
  ChatGptWebImageTaskListSnapshot,
  SystemFilesystemSnapshot,
  SystemMetricsSnapshot,
} from '@/types';
import { classifyModels } from '@/utils/models';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { StartupHistoryPanel } from '@/features/system/StartupHistoryPanel';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconGrokDark from '@/assets/icons/grok-dark.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: { light: iconGrok, dark: iconGrokDark },
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

const SYSTEM_METRICS_POLL_INTERVAL_MS = 5000;

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDurationNanos = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 ms';
  const milliseconds = value / 1_000_000;
  if (milliseconds < 1) return `${Math.round(value / 1000)} μs`;
  if (milliseconds < 1000) return `${milliseconds.toFixed(milliseconds < 10 ? 2 : 1)} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(minutes < 10 ? 2 : 1)} min`;
};

const formatDurationMilliseconds = (value: number): string =>
  formatDurationNanos(value * 1_000_000);

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)}%` : '-';

const formatBytesPerSecond = (value: number): string =>
  Number.isFinite(value) && value >= 0 ? `${formatBytes(value)}/s` : '-';

const formatCyclesPerSecond = (value: number): string =>
  Number.isFinite(value) && value >= 0 ? `${value.toFixed(value >= 10 ? 1 : 2)}/s` : '-';

const metricUtilizationPercent = (current: number, limit: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(limit) || current < 0 || limit <= 0) {
    return null;
  }
  const percent = (current / limit) * 100;
  return Number.isFinite(percent) ? percent : null;
};

const formatMetricUtilization = (value: number | null): string =>
  value === null ? '-' : `${value.toFixed(value >= 10 ? 0 : 1)}%`;

const metricPressureState = (
  value: number | null,
  available: boolean
): 'unavailable' | 'normal' | 'warning' | 'critical' => {
  if (!available || value === null) return 'unavailable';
  if (value >= 90) return 'critical';
  if (value >= 80) return 'warning';
  return 'normal';
};

const IMAGE_PHASE_ORDER = [
  'route_request_total',
  'route_input_admission',
  'route_input_parse',
  'web_execution_admission',
  'route_credential_selection',
  'route_request_slot',
  'web_input_upload',
  'web_requirements',
  'web_conversation_prepare',
  'web_upstream_initial',
  'web_stream_settle',
  'web_poll_slot_wait',
  'web_poll_request',
  'web_finalizer_wait',
  'web_download',
  'web_response_encode',
  'route_response_encode',
  'route_response_write_operation',
];

const sortImagePhaseEntries = <T,>(entries: Array<[string, T]>): Array<[string, T]> => {
  const order = new Map(IMAGE_PHASE_ORDER.map((name, index) => [name, index]));
  return entries.sort(([left], [right]) => {
    const leftIndex = order.get(left) ?? IMAGE_PHASE_ORDER.length;
    const rightIndex = order.get(right) ?? IMAGE_PHASE_ORDER.length;
    return leftIndex === rightIndex ? left.localeCompare(right) : leftIndex - rightIndex;
  });
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { status?: unknown }).status;
  if (typeof direct === 'number') return direct;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === 'number' ? response.status : undefined;
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [controlPanelUpdateStatus, setControlPanelUpdateStatus] =
    useState<ControlPanelUpdateStatus | null>(null);
  const [checkingControlPanelUpdate, setCheckingControlPanelUpdate] = useState(false);
  const [updatingControlPanel, setUpdatingControlPanel] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetricsSnapshot | null>(null);
  const [systemMetricsLoading, setSystemMetricsLoading] = useState(false);
  const [systemMetricsError, setSystemMetricsError] = useState('');
  const [systemMetricsUnsupported, setSystemMetricsUnsupported] = useState(false);
  const [imageTasks, setImageTasks] = useState<ChatGptWebImageTaskListSnapshot | null>(null);
  const [imageTasksLoading, setImageTasksLoading] = useState(false);
  const [imageTasksError, setImageTasksError] = useState('');
  const [imageTasksUnsupported, setImageTasksUnsupported] = useState(false);
  const [showLongImageTasksOnly, setShowLongImageTasksOnly] = useState(false);
  const [cancelingImageTaskIds, setCancelingImageTaskIds] = useState<Set<string>>(() => new Set());
  const [imageRuntimeOpen, setImageRuntimeOpen] = useState(true);
  const [imageTasksOpen, setImageTasksOpen] = useState(false);
  const [workingDirectoryOpen, setWorkingDirectoryOpen] = useState(true);

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const systemMetricsRequestSequence = useRef(0);
  const systemMetricsConnectionKey = useRef('');
  const systemMetricsInFlightConnection = useRef<string | null>(null);
  const imageTasksRequestSequence = useRef(0);
  const imageTasksInFlightRequest = useRef<number | null>(null);
  const currentSystemMetricsConnectionKey = `${auth.connectionGeneration}:${auth.apiBase}:${auth.managementAccessPath}`;

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');
  const apiCommit = auth.serverCommit || t('system_info.version_unknown');
  const buildTime = auth.serverBuildDate
    ? new Date(auth.serverBuildDate).toLocaleString(i18n.language)
    : t('system_info.version_unknown');
  const formatControlPanelDate = useCallback(
    (value: string) => {
      if (!value) return '-';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleString(i18n.language);
    },
    [i18n.language]
  );

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [
          STORAGE_KEY_AUTH,
          'isLoggedIn',
          'apiBase',
          'apiUrl',
          'managementAccessPath',
          'managementKey',
        ];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      const comparison = compareVersions(latest, auth.serverVersion);

      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }

      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
        return;
      }

      if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const suffix = message ? `: ${message}` : '';
      showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
    } finally {
      setCheckingVersion(false);
    }
  }, [auth.serverVersion, showNotification, t]);

  const loadControlPanelUpdateStatus = useCallback(
    async ({ manual = false }: { manual?: boolean } = {}) => {
      if (auth.connectionStatus !== 'connected') {
        if (manual) {
          showNotification(t('notification.connection_required'), 'warning');
        }
        return;
      }

      setCheckingControlPanelUpdate(true);
      try {
        const status = await configApi.getControlPanelUpdateStatus();
        setControlPanelUpdateStatus(status);
        if (status.error) {
          showNotification(
            `${t('system_info.control_panel_update_error')}: ${status.error}`,
            'error'
          );
        } else if (manual) {
          showNotification(t('system_info.control_panel_update_checked'), 'success');
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        showNotification(
          `${t('system_info.control_panel_update_check_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      } finally {
        setCheckingControlPanelUpdate(false);
      }
    },
    [auth.connectionStatus, showNotification, t]
  );

  const handleControlPanelUpdate = useCallback(async () => {
    if (auth.connectionStatus !== 'connected') {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    setUpdatingControlPanel(true);
    try {
      const status = await configApi.updateControlPanel();
      setControlPanelUpdateStatus(status);
      if (status.error) {
        showNotification(
          `${t('system_info.control_panel_update_error')}: ${status.error}`,
          'error'
        );
      }
      if (status.updated) {
        showNotification(t('system_info.control_panel_update_success_refresh'), 'success');
      } else if (!status.error) {
        showNotification(t('system_info.control_panel_update_no_change'), 'info');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      showNotification(
        `${t('system_info.control_panel_update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setUpdatingControlPanel(false);
    }
  }, [auth.connectionStatus, showNotification, t]);

  const loadSystemMetrics = useCallback(
    async ({
      background = false,
      force = false,
    }: { background?: boolean; force?: boolean } = {}) => {
      if (auth.connectionStatus !== 'connected' || (systemMetricsUnsupported && !force)) return;
      if (systemMetricsInFlightConnection.current === currentSystemMetricsConnectionKey) return;
      systemMetricsInFlightConnection.current = currentSystemMetricsConnectionKey;
      const requestSequence = ++systemMetricsRequestSequence.current;
      if (!background) setSystemMetricsLoading(true);
      try {
        const snapshot = await systemMetricsApi.get();
        if (requestSequence !== systemMetricsRequestSequence.current) return;
        setSystemMetrics(snapshot);
        setSystemMetricsError('');
        setSystemMetricsUnsupported(false);
      } catch (error: unknown) {
        if (requestSequence !== systemMetricsRequestSequence.current) return;
        const unsupported = getErrorStatus(error) === 404;
        setSystemMetricsUnsupported(unsupported);
        setSystemMetricsError(
          unsupported
            ? ''
            : error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : t('system_info.metrics_load_failed')
        );
      } finally {
        if (systemMetricsInFlightConnection.current === currentSystemMetricsConnectionKey) {
          systemMetricsInFlightConnection.current = null;
        }
        if (requestSequence === systemMetricsRequestSequence.current && !background) {
          setSystemMetricsLoading(false);
        }
      }
    },
    [auth.connectionStatus, currentSystemMetricsConnectionKey, systemMetricsUnsupported, t]
  );

  const loadImageTasks = useCallback(
    async ({
      background = false,
      force = false,
      signal,
    }: { background?: boolean; force?: boolean; signal?: AbortSignal } = {}) => {
      if (
        auth.connectionStatus !== 'connected' ||
        !imageRuntimeOpen ||
        !imageTasksOpen ||
        (imageTasksUnsupported && !force)
      ) {
        return;
      }
      if (imageTasksInFlightRequest.current !== null) return;

      const requestSequence = ++imageTasksRequestSequence.current;
      imageTasksInFlightRequest.current = requestSequence;
      if (!background) setImageTasksLoading(true);
      try {
        const snapshot = await chatGptWebApi.getImageTasks(signal);
        if (signal?.aborted || requestSequence !== imageTasksRequestSequence.current) return;
        setImageTasks(snapshot);
        setImageTasksError('');
        setImageTasksUnsupported(false);
      } catch (error: unknown) {
        if (signal?.aborted || requestSequence !== imageTasksRequestSequence.current) return;
        const unsupported = getErrorStatus(error) === 404;
        setImageTasksUnsupported(unsupported);
        setImageTasksError(
          unsupported
            ? ''
            : error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : t('system_info.image_runtime.tasks_load_failed')
        );
      } finally {
        if (imageTasksInFlightRequest.current === requestSequence) {
          imageTasksInFlightRequest.current = null;
        }
        if (requestSequence === imageTasksRequestSequence.current && !background) {
          setImageTasksLoading(false);
        }
      }
    },
    [auth.connectionStatus, imageRuntimeOpen, imageTasksOpen, imageTasksUnsupported, t]
  );

  const handleCancelImageTask = useCallback(
    (taskID: string) => {
      showConfirmation({
        title: t('system_info.image_runtime.task_cancel_confirm_title'),
        message: t('system_info.image_runtime.task_cancel_confirm_message', { id: taskID }),
        confirmText: t('common.confirm'),
        variant: 'danger',
        onConfirm: async () => {
          setCancelingImageTaskIds((current) => new Set(current).add(taskID));
          try {
            await chatGptWebApi.cancelImageTask(taskID);
            setImageTasks((current) =>
              current
                ? {
                    ...current,
                    tasks: current.tasks.map((task) =>
                      task.id === taskID ? { ...task, canceling: true } : task
                    ),
                  }
                : current
            );
            showNotification(t('system_info.image_runtime.task_cancel_success'), 'success');
            await loadImageTasks({ force: true });
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : typeof error === 'string' ? error : '';
            showNotification(
              `${t('system_info.image_runtime.task_cancel_failed')}${message ? `: ${message}` : ''}`,
              'error'
            );
          } finally {
            setCancelingImageTaskIds((current) => {
              const next = new Set(current);
              next.delete(taskID);
              return next;
            });
          }
        },
      });
    },
    [loadImageTasks, showConfirmation, showNotification, t]
  );

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    void loadControlPanelUpdateStatus();
  }, [loadControlPanelUpdateStatus]);

  useEffect(() => {
    if (systemMetricsConnectionKey.current === currentSystemMetricsConnectionKey) return;
    systemMetricsConnectionKey.current = currentSystemMetricsConnectionKey;
    systemMetricsInFlightConnection.current = null;
    systemMetricsRequestSequence.current += 1;
    setSystemMetrics(null);
    setSystemMetricsLoading(false);
    setSystemMetricsError('');
    setSystemMetricsUnsupported(false);
    imageTasksInFlightRequest.current = null;
    imageTasksRequestSequence.current += 1;
    setImageTasks(null);
    setImageTasksLoading(false);
    setImageTasksError('');
    setImageTasksUnsupported(false);
    setShowLongImageTasksOnly(false);
    setCancelingImageTaskIds(new Set());
    setImageTasksOpen(false);
  }, [currentSystemMetricsConnectionKey]);

  useEffect(() => {
    if (auth.connectionStatus !== 'connected') {
      systemMetricsInFlightConnection.current = null;
      systemMetricsRequestSequence.current += 1;
      setSystemMetrics(null);
      setSystemMetricsLoading(false);
      setSystemMetricsError('');
      setSystemMetricsUnsupported(false);
      imageTasksInFlightRequest.current = null;
      imageTasksRequestSequence.current += 1;
      setImageTasks(null);
      setImageTasksLoading(false);
      setImageTasksError('');
      setImageTasksUnsupported(false);
      return;
    }
    const imageTasksController = new AbortController();
    void loadSystemMetrics();
    if (imageRuntimeOpen && imageTasksOpen) {
      void loadImageTasks({ signal: imageTasksController.signal });
    }
    if (systemMetricsUnsupported && (!imageTasksOpen || imageTasksUnsupported)) {
      return () => imageTasksController.abort();
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        if (!systemMetricsUnsupported) {
          void loadSystemMetrics({ background: true });
        }
        if (imageRuntimeOpen && imageTasksOpen && !imageTasksUnsupported) {
          void loadImageTasks({ background: true, signal: imageTasksController.signal });
        }
      }
    }, SYSTEM_METRICS_POLL_INTERVAL_MS);
    return () => {
      imageTasksController.abort();
      window.clearInterval(timer);
      systemMetricsRequestSequence.current += 1;
      imageTasksInFlightRequest.current = null;
      imageTasksRequestSequence.current += 1;
    };
  }, [
    auth.connectionStatus,
    imageRuntimeOpen,
    imageTasksOpen,
    imageTasksUnsupported,
    loadImageTasks,
    loadSystemMetrics,
    systemMetricsUnsupported,
  ]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
      systemMetricsInFlightConnection.current = null;
      systemMetricsRequestSequence.current += 1;
      imageTasksInFlightRequest.current = null;
      imageTasksRequestSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  const formatMetricDate = useCallback(
    (value: string | null | undefined) => {
      if (!value) return '-';
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(i18n.language);
    },
    [i18n.language]
  );

  const filesystemEntries: Array<{
    key: 'working_directory' | 'auth_directory' | 'usage_cache';
    value: SystemFilesystemSnapshot;
  }> = systemMetrics
    ? [
        { key: 'working_directory', value: systemMetrics.filesystems.working_directory },
        { key: 'auth_directory', value: systemMetrics.filesystems.auth_directory },
        { key: 'usage_cache', value: systemMetrics.filesystems.usage_cache },
      ]
    : [];
  const imageMemory = systemMetrics?.image_request_memory;
  const imageInFlight = systemMetrics?.chatgpt_web_image_in_flight;
  const imageFinalizers = systemMetrics?.chatgpt_web_image_finalizers;
  const imageMemoryFinalizers = systemMetrics?.chatgpt_web_image_memory_finalizers;
  const imagePollSlots = systemMetrics?.chatgpt_web_image_poll_slots;
  const imagePollBreaker = systemMetrics?.chatgpt_web_image_poll_breaker;
  const imageProtocol = systemMetrics?.chatgpt_web_image_protocol;
  const imageSpool = systemMetrics?.image_spool;
  const visibleImageTasks = imageTasks?.tasks.filter(
    (task) => !showLongImageTasksOnly || task.over_15_minutes
  );
  const imageProtocolEntries: Array<[string, number]> = imageProtocol?.available
    ? [
        ['task_ids_observed', imageProtocol.task_ids_observed],
        ['exact_streams_started', imageProtocol.exact_streams_started],
        ['exact_streams_completed', imageProtocol.exact_streams_completed],
        ['exact_stream_fallbacks', imageProtocol.exact_stream_fallbacks],
        ['final_messages_captured', imageProtocol.final_messages_captured],
        ['task_pages_fetched', imageProtocol.task_pages_fetched],
        ['hidden_outputs_ignored', imageProtocol.hidden_outputs_ignored],
        ['incomplete_pointers_observed', imageProtocol.incomplete_pointers_observed],
        [
          'all_sources_exhausted_without_output',
          imageProtocol.all_sources_exhausted_without_output,
        ],
      ]
    : [];
  const imagePhaseEntries = systemMetrics
    ? sortImagePhaseEntries(Object.entries(systemMetrics.image_request_phases.metrics))
    : [];
  const imagePhaseRolling = systemMetrics?.image_request_phases.rolling;
  const hasImageRuntimeMetrics = Boolean(
    imageMemory?.available ||
    imageInFlight?.available ||
    imageFinalizers?.available ||
    imageMemoryFinalizers?.available ||
    imagePollSlots?.available ||
    imagePollBreaker?.available ||
    imageProtocol?.available ||
    imageSpool?.available ||
    systemMetrics?.image_request_phases.available ||
    (imageTasks?.active ?? 0) > 0
  );
  const imagePressureMetrics = [
    {
      key: 'memory',
      available: imageMemory?.available === true && imageMemory.capacity_bytes > 0,
      detailsAvailable: imageMemory?.available === true,
      utilization: metricUtilizationPercent(
        imageMemory?.processing_bytes ?? 0,
        imageMemory?.capacity_bytes ?? 0
      ),
      current: imageMemory ? formatBytes(imageMemory.processing_bytes) : '-',
      limit: imageMemory?.capacity_bytes ? formatBytes(imageMemory.capacity_bytes) : '-',
      queued: imageMemory?.waiting_tasks ?? 0,
      peak: imageMemory ? formatBytes(imageMemory.peak_processing_bytes) : '-',
      rejected: (imageMemory?.immediate_rejected ?? 0) + (imageMemory?.queue_rejected ?? 0),
      timedOut: null,
    },
    {
      key: 'in_flight',
      available: imageInFlight?.available === true && imageInFlight.limit > 0,
      detailsAvailable: imageInFlight?.available === true,
      utilization: metricUtilizationPercent(imageInFlight?.active ?? 0, imageInFlight?.limit ?? 0),
      current: imageInFlight?.active ?? 0,
      limit: imageInFlight?.limit || '-',
      queued: imageInFlight?.queued ?? 0,
      peak: imageInFlight?.peak_active ?? 0,
      rejected: (imageInFlight?.immediate_rejects ?? 0) + (imageInFlight?.queue_rejects ?? 0),
      timedOut: imageInFlight?.timed_out ?? 0,
    },
    {
      key: 'poll_slots',
      available: imagePollSlots?.available === true && imagePollSlots.limit > 0,
      detailsAvailable: imagePollSlots?.capacity_details_available === true,
      utilization: metricUtilizationPercent(
        imagePollSlots?.active ?? 0,
        imagePollSlots?.limit ?? 0
      ),
      current: imagePollSlots?.active ?? 0,
      limit: imagePollSlots?.limit || '-',
      queued: imagePollSlots?.queued ?? 0,
      peak: imagePollSlots?.peak_active ?? 0,
      rejected: (imagePollSlots?.immediate_rejects ?? 0) + (imagePollSlots?.queue_rejects ?? 0),
      timedOut: imagePollSlots?.timed_out ?? 0,
    },
    {
      key: 'memory_finalizers',
      available: imageMemoryFinalizers?.available === true && imageMemoryFinalizers.limit > 0,
      detailsAvailable: imageMemoryFinalizers?.available === true,
      utilization: metricUtilizationPercent(
        imageMemoryFinalizers?.active ?? 0,
        imageMemoryFinalizers?.limit ?? 0
      ),
      current: imageMemoryFinalizers?.active ?? 0,
      limit: imageMemoryFinalizers?.limit || '-',
      queued: imageMemoryFinalizers?.queued ?? 0,
      peak: imageMemoryFinalizers?.peak_active ?? 0,
      rejected:
        (imageMemoryFinalizers?.immediate_rejects ?? 0) +
        (imageMemoryFinalizers?.queue_rejects ?? 0),
      timedOut: imageMemoryFinalizers?.timed_out ?? 0,
    },
  ];
  const imageTuningHints: string[] = [];
  if (
    imageInFlight?.available &&
    imageInFlight.limit > 0 &&
    (metricUtilizationPercent(imageInFlight.active, imageInFlight.limit) ?? 0) >= 80 &&
    imageInFlight.queued > 0
  ) {
    imageTuningHints.push('lifecycle');
  }
  if (
    imagePollSlots?.available &&
    imagePollSlots.limit > 0 &&
    imagePollSlots.capacity_details_available &&
    (imagePollSlots.queued > 0 ||
      (metricUtilizationPercent(imagePollSlots.active, imagePollSlots.limit) ?? 0) >= 90)
  ) {
    imageTuningHints.push('poll');
  }
  const imageMemoryUtilization = metricUtilizationPercent(
    imageMemory?.processing_bytes ?? 0,
    imageMemory?.capacity_bytes ?? 0
  );
  if (
    imageMemoryFinalizers?.available &&
    imageMemoryFinalizers.limit > 0 &&
    imageMemoryFinalizers.queued > 0 &&
    imageMemoryUtilization !== null &&
    imageMemoryUtilization < 80
  ) {
    imageTuningHints.push('memory_finalizer');
  }
  if (
    imageMemory?.available &&
    imageMemory.capacity_bytes > 0 &&
    ((imageMemoryUtilization ?? 0) >= 85 || imageMemory.waiting_tasks > 0)
  ) {
    imageTuningHints.push('memory');
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('system_info.title')}</h1>
      <div className={styles.content}>
        <Card className={styles.aboutCard}>
          <div className={styles.aboutHeader}>
            <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
            <div className={styles.aboutTitle}>{t('system_info.about_title')}</div>
          </div>

          <div className={styles.aboutInfoGrid}>
            <button
              type="button"
              className={`${styles.infoTile} ${styles.tapTile}`}
              onClick={handleInfoVersionTap}
            >
              <div className={styles.tileHeader}>
                <div className={styles.tileLabel}>{t('footer.version')}</div>
              </div>
              <div className={styles.tileValue}>{appVersion}</div>
            </button>

            <div className={styles.infoTile}>
              <div className={styles.tileHeader}>
                <div className={styles.tileLabel}>{t('footer.api_version')}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.tileAction}
                  onClick={() => void handleVersionCheck()}
                  loading={checkingVersion}
                  title={t('system_info.version_check_button')}
                  aria-label={t('system_info.version_check_button')}
                >
                  {t('system_info.version_check_button')}
                </Button>
              </div>
              <div className={styles.tileValue}>{apiVersion}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.api_commit')}</div>
              <div className={styles.tileValue}>{apiCommit}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.build_date')}</div>
              <div className={styles.tileValue}>{buildTime}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('connection.status')}</div>
              <div className={styles.tileValue}>{t(`common.${auth.connectionStatus}_status`)}</div>
              <div className={styles.tileSub}>{auth.apiBase || '-'}</div>
            </div>
          </div>
        </Card>

        <StartupHistoryPanel
          connected={auth.connectionStatus === 'connected'}
          connectionKey={currentSystemMetricsConnectionKey}
        />

        <Card
          title={t('system_info.metrics_title')}
          collapsible
          extra={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadSystemMetrics({ force: true })}
              loading={systemMetricsLoading}
              disabled={auth.connectionStatus !== 'connected'}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.metrics_desc')}</p>
          {systemMetricsUnsupported ? (
            <div className="hint">{t('system_info.metrics_unsupported')}</div>
          ) : systemMetricsError ? (
            <div className="error-box">
              {t('system_info.metrics_load_failed')}: {systemMetricsError}
            </div>
          ) : !systemMetrics ? (
            <div className="hint">
              {systemMetricsLoading
                ? t('system_info.metrics_loading')
                : t('system_info.metrics_unavailable')}
            </div>
          ) : (
            <div className={styles.metricsContent}>
              <div className={styles.metricsCollectedAt}>
                {t('system_info.metrics_collected_at')}:{' '}
                {formatMetricDate(systemMetrics.collected_at)}
              </div>
              <dl className={styles.metricsGrid}>
                {[
                  ['heap_alloc', formatBytes(systemMetrics.runtime.heap_alloc_bytes)],
                  ['heap_inuse', formatBytes(systemMetrics.runtime.heap_inuse_bytes)],
                  ['runtime_sys', formatBytes(systemMetrics.runtime.runtime_sys_bytes)],
                  [
                    'resident_set',
                    systemMetrics.runtime.resident_set_available
                      ? formatBytes(systemMetrics.runtime.resident_set_bytes)
                      : '-',
                  ],
                  ['total_alloc', formatBytes(systemMetrics.runtime.total_alloc_bytes)],
                  [
                    'allocation_rate',
                    systemMetrics.runtime.rates_available
                      ? formatBytesPerSecond(systemMetrics.runtime.allocation_bytes_per_second)
                      : '-',
                  ],
                  ['stack_inuse', formatBytes(systemMetrics.runtime.stack_inuse_bytes)],
                  ['goroutines', systemMetrics.runtime.goroutines],
                  ['gc_cycles', systemMetrics.runtime.gc_cycles],
                  [
                    'gc_rate',
                    systemMetrics.runtime.rates_available
                      ? formatCyclesPerSecond(systemMetrics.runtime.gc_cycles_per_second)
                      : '-',
                  ],
                  [
                    'gc_pause',
                    systemMetrics.runtime.rates_available
                      ? formatPercent(systemMetrics.runtime.gc_pause_percent)
                      : '-',
                  ],
                  [
                    'process_cpu',
                    systemMetrics.runtime.process_cpu_available &&
                    systemMetrics.runtime.rates_available
                      ? formatPercent(systemMetrics.runtime.process_cpu_percent)
                      : '-',
                  ],
                  [
                    'process_cpu_normalized',
                    systemMetrics.runtime.process_cpu_available &&
                    systemMetrics.runtime.rates_available
                      ? formatPercent(systemMetrics.runtime.process_cpu_normalized_percent)
                      : '-',
                  ],
                  [
                    'gomaxprocs',
                    `${systemMetrics.runtime.gomaxprocs} / ${systemMetrics.runtime.logical_cpus}`,
                  ],
                  [
                    'runtime',
                    `${systemMetrics.runtime.go_version} · ${systemMetrics.runtime.goos}/${systemMetrics.runtime.goarch}`,
                  ],
                  ['last_gc', formatMetricDate(systemMetrics.runtime.last_gc_at)],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{t(`system_info.metrics.${key}`)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>

              <details
                className={styles.imageRuntimeSection}
                data-testid="image-runtime-metrics"
                open={imageRuntimeOpen}
                onToggle={(event) => setImageRuntimeOpen(event.currentTarget.open)}
              >
                <summary className={styles.imageRuntimeHeader}>
                  <span className={styles.imageRuntimeHeading}>
                    <span className={styles.imageRuntimeTitle}>
                      {t('system_info.image_runtime.title')}
                    </span>
                    <span className={styles.imageRuntimeDescription}>
                      {t('system_info.image_runtime.description')}
                    </span>
                  </span>
                  <span className={styles.sectionChevron} aria-hidden="true" />
                </summary>
                {!hasImageRuntimeMetrics ? (
                  <div className="hint">{t('system_info.image_runtime.unavailable')}</div>
                ) : (
                  <>
                    <section
                      className={styles.imagePressureOverview}
                      data-testid="image-resource-pressure"
                    >
                      <div className={styles.imagePressureHeader}>
                        <div>
                          <h4>{t('system_info.image_runtime.pressure_title')}</h4>
                          <p>{t('system_info.image_runtime.pressure_description')}</p>
                        </div>
                        <span>{t('system_info.image_runtime.no_cpu_automation')}</span>
                      </div>
                      <div className={styles.imagePressureGrid}>
                        {imagePressureMetrics.map((metric) => (
                          <article
                            key={metric.key}
                            className={styles.imagePressureTile}
                            data-state={metricPressureState(metric.utilization, metric.available)}
                            aria-label={`${t(`system_info.image_runtime.${metric.key}`)}: ${formatMetricUtilization(metric.utilization)}, ${t(
                              `system_info.image_runtime.pressure_${metricPressureState(
                                metric.utilization,
                                metric.available
                              )}`
                            )}`}
                          >
                            <div className={styles.imagePressureTileHeader}>
                              <span>{t(`system_info.image_runtime.${metric.key}`)}</span>
                              <strong>{formatMetricUtilization(metric.utilization)}</strong>
                            </div>
                            {!metric.available ? (
                              <p className={styles.imageMetricUnavailable}>
                                {t('system_info.image_runtime.group_unavailable')}
                              </p>
                            ) : (
                              <>
                                <div className={styles.imageCapacityTrack}>
                                  <span
                                    style={{
                                      width: `${Math.min(100, Math.max(0, metric.utilization ?? 0))}%`,
                                    }}
                                  />
                                </div>
                                <div className={styles.imagePressureCurrent}>
                                  {metric.current} / {metric.limit}
                                </div>
                                <dl className={styles.imagePressureStats}>
                                  <div>
                                    <dt>{t('system_info.image_runtime.peak_cumulative')}</dt>
                                    <dd>{metric.peak}</dd>
                                  </div>
                                  {metric.detailsAvailable ? (
                                    <>
                                      <div>
                                        <dt>{t('system_info.image_runtime.current_queue')}</dt>
                                        <dd>{metric.queued}</dd>
                                      </div>
                                      <div>
                                        <dt>
                                          {t('system_info.image_runtime.rejected_cumulative')}
                                        </dt>
                                        <dd>{metric.rejected}</dd>
                                      </div>
                                      {metric.timedOut !== null ? (
                                        <div>
                                          <dt>
                                            {t('system_info.image_runtime.timed_out_cumulative')}
                                          </dt>
                                          <dd>{metric.timedOut}</dd>
                                        </div>
                                      ) : null}
                                    </>
                                  ) : null}
                                </dl>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                      <div className={styles.imageTuningHints}>
                        <strong>{t('system_info.image_runtime.tuning_title')}</strong>
                        {imageTuningHints.length > 0 ? (
                          <ul>
                            {imageTuningHints.map((hint) => (
                              <li key={hint}>{t(`system_info.image_runtime.tuning_${hint}`)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{t('system_info.image_runtime.tuning_observe')}</p>
                        )}
                      </div>
                    </section>
                    <div className={styles.imageRuntimeGrid}>
                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.memory')}</h4>
                          <span>{t('system_info.image_runtime.shared')}</span>
                        </div>
                        {!imageMemory?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <>
                            <div className={styles.imageMetricLead}>
                              <strong>{formatBytes(imageMemory.processing_bytes)}</strong>
                              <span>
                                /{' '}
                                {imageMemory.capacity_bytes > 0
                                  ? formatBytes(imageMemory.capacity_bytes)
                                  : '-'}
                              </span>
                            </div>
                            <div className={styles.imageCapacityTrack}>
                              <span
                                style={{
                                  width: `${
                                    imageMemory.capacity_bytes > 0
                                      ? Math.min(
                                          100,
                                          (imageMemory.processing_bytes /
                                            imageMemory.capacity_bytes) *
                                            100
                                        )
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                            <dl className={styles.imageMetricStats}>
                              <div>
                                <dt>{t('system_info.image_runtime.processing')}</dt>
                                <dd>{imageMemory.processing_tasks}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.peak')}</dt>
                                <dd>{formatBytes(imageMemory.peak_processing_bytes)}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.waiting')}</dt>
                                <dd>
                                  {imageMemory.waiting_tasks} / {imageMemory.queue_limit} ·{' '}
                                  {formatBytes(imageMemory.waiting_bytes)}
                                </dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.rejected')}</dt>
                                <dd>
                                  {imageMemory.immediate_rejected + imageMemory.queue_rejected}
                                </dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.completion_reservations')}</dt>
                                <dd>{imageMemory.completion_reservations}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.finalization')}</dt>
                                <dd>
                                  {imageMemory.finalization_active} /{' '}
                                  {imageMemory.finalization_waiting}
                                </dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.bypassed_reservations')}</dt>
                                <dd>{imageMemory.bypassed_completion_reservations}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.revoked_reservations')}</dt>
                                <dd>{imageMemory.revoked_completion_reservations}</dd>
                              </div>
                            </dl>
                          </>
                        )}
                      </article>

                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.memory_finalizers')}</h4>
                          <span>{t('system_info.image_runtime.whole_workspace')}</span>
                        </div>
                        {!imageMemoryFinalizers?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <dl className={styles.imageMetricStats}>
                            <div>
                              <dt>{t('system_info.image_runtime.active_limit')}</dt>
                              <dd>
                                {imageMemoryFinalizers.active} /{' '}
                                {imageMemoryFinalizers.limit || '-'}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.queue')}</dt>
                              <dd>
                                {imageMemoryFinalizers.queued} / {imageMemoryFinalizers.queue_limit}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.peak')}</dt>
                              <dd>
                                {imageMemoryFinalizers.peak_active} /{' '}
                                {imageMemoryFinalizers.peak_queued}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.rejected')}</dt>
                              <dd>
                                {imageMemoryFinalizers.immediate_rejects +
                                  imageMemoryFinalizers.queue_rejects}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.timed_out')}</dt>
                              <dd>{imageMemoryFinalizers.timed_out}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.oldest_active')}</dt>
                              <dd>
                                {formatDurationNanos(imageMemoryFinalizers.oldest_active_age_nanos)}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.resize_state')}</dt>
                              <dd>
                                {t(
                                  imageMemoryFinalizers.shrinking
                                    ? 'system_info.image_runtime.shrinking'
                                    : 'system_info.image_runtime.stable'
                                )}
                              </dd>
                            </div>
                            <div className={styles.imageMetricWide}>
                              <dt>{t('system_info.image_runtime.long_running')}</dt>
                              <dd>
                                {imageMemoryFinalizers.active_over_5_minutes} /{' '}
                                {imageMemoryFinalizers.active_over_15_minutes} /{' '}
                                {imageMemoryFinalizers.active_over_25_minutes}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </article>

                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.in_flight')}</h4>
                          <span>{t('system_info.image_runtime.full_lifecycle')}</span>
                        </div>
                        {!imageInFlight?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <dl className={styles.imageMetricStats}>
                            <div>
                              <dt>{t('system_info.image_runtime.active_limit')}</dt>
                              <dd>
                                {imageInFlight.active} / {imageInFlight.limit || '-'}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.queue')}</dt>
                              <dd>
                                {imageInFlight.queued} / {imageInFlight.queue_limit}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.peak')}</dt>
                              <dd>
                                {imageInFlight.peak_active} / {imageInFlight.peak_queued}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.rejected')}</dt>
                              <dd>
                                {imageInFlight.immediate_rejects + imageInFlight.queue_rejects}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.timed_out')}</dt>
                              <dd>{imageInFlight.timed_out}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.oldest_active')}</dt>
                              <dd>{formatDurationNanos(imageInFlight.oldest_active_age_nanos)}</dd>
                            </div>
                            <div className={styles.imageMetricWide}>
                              <dt>{t('system_info.image_runtime.long_running')}</dt>
                              <dd>
                                {imageInFlight.active_over_5_minutes} /{' '}
                                {imageInFlight.active_over_15_minutes} /{' '}
                                {imageInFlight.active_over_25_minutes}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </article>

                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.finalizers')}</h4>
                          <span>{t('system_info.image_runtime.settled_staging')}</span>
                        </div>
                        {!imageFinalizers?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <dl className={styles.imageMetricStats}>
                            <div>
                              <dt>{t('system_info.image_runtime.active_limit')}</dt>
                              <dd>
                                {imageFinalizers.active} / {imageFinalizers.limit || '-'}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.queue')}</dt>
                              <dd>
                                {imageFinalizers.queued} / {imageFinalizers.queue_limit}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.peak')}</dt>
                              <dd>
                                {imageFinalizers.peak_active} / {imageFinalizers.peak_queued}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.rejected')}</dt>
                              <dd>
                                {imageFinalizers.immediate_rejects + imageFinalizers.queue_rejects}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.oldest_active')}</dt>
                              <dd>
                                {formatDurationNanos(imageFinalizers.oldest_active_age_nanos)}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.timed_out')}</dt>
                              <dd>{imageFinalizers.timed_out}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.max_wait')}</dt>
                              <dd>{formatDurationNanos(imageFinalizers.max_wait_nanos)}</dd>
                            </div>
                            <div className={styles.imageMetricWide}>
                              <dt>{t('system_info.image_runtime.long_running')}</dt>
                              <dd>
                                {imageFinalizers.active_over_5_minutes} /{' '}
                                {imageFinalizers.active_over_15_minutes} /{' '}
                                {imageFinalizers.active_over_25_minutes}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </article>

                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.poll_slots')}</h4>
                          <span>{t('system_info.image_runtime.poll_http')}</span>
                        </div>
                        {!imagePollSlots?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <dl className={styles.imageMetricStats}>
                            <div>
                              <dt>{t('system_info.image_runtime.active_limit')}</dt>
                              <dd>
                                {imagePollSlots.active} / {imagePollSlots.limit || '-'}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.peak')}</dt>
                              <dd>
                                {imagePollSlots.peak_active}
                                {imagePollSlots.capacity_details_available
                                  ? ` / ${imagePollSlots.peak_queued}`
                                  : ''}
                              </dd>
                            </div>
                            {imagePollSlots.capacity_details_available ? (
                              <>
                                <div>
                                  <dt>{t('system_info.image_runtime.queue')}</dt>
                                  <dd>
                                    {imagePollSlots.queued} / {imagePollSlots.queue_limit}
                                  </dd>
                                </div>
                                <div>
                                  <dt>{t('system_info.image_runtime.rejected')}</dt>
                                  <dd>
                                    {imagePollSlots.immediate_rejects +
                                      imagePollSlots.queue_rejects}
                                  </dd>
                                </div>
                                <div>
                                  <dt>{t('system_info.image_runtime.timed_out')}</dt>
                                  <dd>{imagePollSlots.timed_out}</dd>
                                </div>
                              </>
                            ) : null}
                            <div>
                              <dt>{t('system_info.image_runtime.acquired_attempts')}</dt>
                              <dd>
                                {imagePollSlots.acquired} / {imagePollSlots.acquire_attempts}
                              </dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.canceled')}</dt>
                              <dd>{imagePollSlots.canceled}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.max_wait')}</dt>
                              <dd>{formatDurationNanos(imagePollSlots.max_wait_nanos)}</dd>
                            </div>
                            {imagePollSlots.capacity_details_available ? (
                              <div>
                                <dt>{t('system_info.image_runtime.resize_state')}</dt>
                                <dd>
                                  {t(
                                    imagePollSlots.shrinking
                                      ? 'system_info.image_runtime.shrinking'
                                      : 'system_info.image_runtime.stable'
                                  )}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        )}
                      </article>

                      <article
                        className={styles.imageMetricPanel}
                        data-state={
                          imagePollBreaker?.open
                            ? 'open'
                            : imagePollBreaker?.enabled
                              ? 'closed'
                              : 'disabled'
                        }
                      >
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.poll_breaker')}</h4>
                          <span>
                            {t(
                              imagePollBreaker?.enabled
                                ? 'system_info.image_runtime.breaker_enabled'
                                : 'system_info.image_runtime.breaker_disabled'
                            )}
                          </span>
                        </div>
                        {!imagePollBreaker?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <>
                            <div
                              className={styles.imageBreakerLead}
                              data-state={imagePollBreaker.open ? 'open' : 'closed'}
                            >
                              <span aria-hidden="true" />
                              <strong>
                                {t(
                                  imagePollBreaker.open
                                    ? 'system_info.image_runtime.breaker_open'
                                    : 'system_info.image_runtime.breaker_closed'
                                )}
                              </strong>
                            </div>
                            <dl className={styles.imageMetricStats}>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_stall_window')}</dt>
                                <dd>{imagePollBreaker.stall_seconds} s</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_no_completion_age')}</dt>
                                <dd>
                                  {formatDurationNanos(imagePollBreaker.no_completion_age_nanos)}
                                </dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_opened_at')}</dt>
                                <dd>{formatMetricDate(imagePollBreaker.opened_at)}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_full_since')}</dt>
                                <dd>{formatMetricDate(imagePollBreaker.full_since)}</dd>
                              </div>
                              <div className={styles.imageMetricWide}>
                                <dt>{t('system_info.image_runtime.breaker_last_completion')}</dt>
                                <dd>{formatMetricDate(imagePollBreaker.last_completion_at)}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_rejected')}</dt>
                                <dd>{imagePollBreaker.rejected}</dd>
                              </div>
                              <div>
                                <dt>{t('system_info.image_runtime.breaker_completions')}</dt>
                                <dd>{imagePollBreaker.transport_completions}</dd>
                              </div>
                              <div>
                                <dt>
                                  {t('system_info.image_runtime.breaker_canceled_completions')}
                                </dt>
                                <dd>{imagePollBreaker.canceled_completions}</dd>
                              </div>
                            </dl>
                          </>
                        )}
                      </article>

                      <article className={styles.imageMetricPanel}>
                        <div className={styles.imageMetricHeader}>
                          <h4>{t('system_info.image_runtime.spool')}</h4>
                          <span>{t('system_info.image_runtime.temporary_files')}</span>
                        </div>
                        {!imageSpool?.available ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.group_unavailable')}
                          </p>
                        ) : (
                          <dl className={styles.imageMetricStats}>
                            <div>
                              <dt>{t('system_info.image_runtime.current_files')}</dt>
                              <dd>{imageSpool.current_files}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.current_bytes')}</dt>
                              <dd>{formatBytes(imageSpool.current_bytes)}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.peak_bytes_cumulative')}</dt>
                              <dd>{formatBytes(imageSpool.peak_bytes)}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.created_cumulative')}</dt>
                              <dd>{imageSpool.created_files}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.cleaned_cumulative')}</dt>
                              <dd>{imageSpool.cleaned_files}</dd>
                            </div>
                            <div>
                              <dt>{t('system_info.image_runtime.cleanup_failed_cumulative')}</dt>
                              <dd>{imageSpool.cleanup_failures}</dd>
                            </div>
                          </dl>
                        )}
                      </article>
                    </div>

                    <details
                      className={styles.imagePhaseDetails}
                      data-testid="image-task-diagnostics"
                      open={imageTasksOpen}
                      onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setImageTasksOpen(open);
                        if (!open) setImageTasksLoading(false);
                      }}
                    >
                      <summary>
                        <span>{t('system_info.image_runtime.tasks_title')}</span>
                        <span>
                          {imageTasks
                            ? `${imageTasks.active} / ${imageTasks.registry_capacity || '-'}`
                            : imageTasksLoading
                              ? t('system_info.image_runtime.tasks_loading')
                              : '-'}
                        </span>
                      </summary>
                      {imageTasksOpen ? (
                        <div className={styles.imageTaskContent}>
                          <p className={styles.imageTaskDescription}>
                            {t('system_info.image_runtime.tasks_description')}
                          </p>
                          {imageTasksUnsupported ? (
                            <div className="hint">
                              {t('system_info.image_runtime.tasks_unavailable')}
                            </div>
                          ) : imageTasksError ? (
                            <div className="error-box">
                              {t('system_info.image_runtime.tasks_load_failed')}: {imageTasksError}
                            </div>
                          ) : imageTasksLoading && !imageTasks ? (
                            <div className="hint">
                              {t('system_info.image_runtime.tasks_loading')}
                            </div>
                          ) : (
                            <>
                              <div className={styles.imageTaskToolbar}>
                                <dl className={styles.imageTaskSummary}>
                                  <div>
                                    <dt>{t('system_info.image_runtime.tasks_active')}</dt>
                                    <dd>{imageTasks?.active ?? 0}</dd>
                                  </div>
                                  <div>
                                    <dt>{t('system_info.image_runtime.tasks_canceling_count')}</dt>
                                    <dd>{imageTasks?.canceling ?? 0}</dd>
                                  </div>
                                  <div>
                                    <dt>{t('system_info.image_runtime.tasks_over_15_minutes')}</dt>
                                    <dd>{imageTasks?.active_over_15_minutes ?? 0}</dd>
                                  </div>
                                  <div>
                                    <dt>{t('system_info.image_runtime.tasks_capacity')}</dt>
                                    <dd>{imageTasks?.registry_capacity ?? 0}</dd>
                                  </div>
                                </dl>
                                <div className={styles.imageTaskControls}>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={showLongImageTasksOnly}
                                      onChange={(event) =>
                                        setShowLongImageTasksOnly(event.currentTarget.checked)
                                      }
                                    />
                                    <span>
                                      {t('system_info.image_runtime.tasks_show_long_only')}
                                    </span>
                                  </label>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    loading={imageTasksLoading}
                                    onClick={() => void loadImageTasks({ force: true })}
                                  >
                                    {t('system_info.image_runtime.tasks_refresh')}
                                  </Button>
                                </div>
                              </div>
                              {!visibleImageTasks?.length ? (
                                <div className="hint">
                                  {t('system_info.image_runtime.tasks_empty')}
                                </div>
                              ) : (
                                <div className={styles.imageTaskList}>
                                  {visibleImageTasks.map((task) => {
                                    const canceling =
                                      task.canceling || cancelingImageTaskIds.has(task.id);
                                    return (
                                      <article
                                        key={task.id}
                                        className={styles.imageTaskCard}
                                        data-long-running={task.over_15_minutes ? 'true' : 'false'}
                                      >
                                        <div className={styles.imageTaskHeader}>
                                          <div className={styles.imageTaskIdentity}>
                                            <code>{task.id}</code>
                                            <span>
                                              {canceling
                                                ? t('system_info.image_runtime.task_canceling')
                                                : task.status}
                                            </span>
                                            {task.over_15_minutes ? (
                                              <span className={styles.imageTaskWarning}>
                                                {t('system_info.image_runtime.task_long_warning')}
                                              </span>
                                            ) : null}
                                          </div>
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            disabled={canceling}
                                            loading={cancelingImageTaskIds.has(task.id)}
                                            onClick={() => handleCancelImageTask(task.id)}
                                          >
                                            {t('system_info.image_runtime.task_cancel')}
                                          </Button>
                                        </div>
                                        <dl className={styles.imageTaskStats}>
                                          <div>
                                            <dt>{t('system_info.image_runtime.task_stage')}</dt>
                                            <dd>
                                              {t(
                                                `system_info.image_runtime.task_stages.${task.stage}`,
                                                { defaultValue: task.stage || '-' }
                                              )}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>{t('system_info.image_runtime.task_duration')}</dt>
                                            <dd>
                                              {formatDurationMilliseconds(
                                                task.duration_milliseconds
                                              )}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>
                                              {t('system_info.image_runtime.task_last_progress')}
                                            </dt>
                                            <dd>
                                              {formatMetricDate(task.last_progress_at)} ·{' '}
                                              {formatDurationMilliseconds(
                                                task.last_progress_age_milliseconds
                                              )}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>{t('system_info.image_runtime.task_last_poll')}</dt>
                                            <dd>{formatMetricDate(task.last_poll_completed_at)}</dd>
                                          </div>
                                          <div>
                                            <dt>
                                              {t('system_info.image_runtime.task_polls_in_flight')}
                                            </dt>
                                            <dd>{task.polls_in_flight}</dd>
                                          </div>
                                          <div>
                                            <dt>
                                              {t('system_info.image_runtime.task_credential')}
                                            </dt>
                                            <dd>{task.credential_fingerprint || '-'}</dd>
                                          </div>
                                        </dl>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : null}
                    </details>

                    {imageProtocol?.available ? (
                      <details
                        className={styles.imagePhaseDetails}
                        data-testid="image-protocol-convergence"
                      >
                        <summary>
                          <span>{t('system_info.image_runtime.protocol_convergence')}</span>
                          <span>{t('system_info.image_runtime.cumulative_counters')}</span>
                        </summary>
                        <dl className={styles.imageProtocolGrid}>
                          {imageProtocolEntries.map(([key, value]) => (
                            <div key={key}>
                              <dt>{t(`system_info.image_runtime.protocol_metrics.${key}`)}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className={styles.imagePhaseNote}>
                          {t('system_info.image_runtime.protocol_note')}
                        </p>
                      </details>
                    ) : null}

                    {systemMetrics.image_request_phases.available ? (
                      <details className={styles.imagePhaseDetails}>
                        <summary>
                          <span>{t('system_info.image_runtime.phases')}</span>
                          <span>
                            {t('system_info.image_runtime.phase_count', {
                              count: imagePhaseEntries.length,
                            })}
                            {imagePhaseRolling?.available
                              ? ` · ${t('system_info.image_runtime.rolling_window', {
                                  seconds: imagePhaseRolling.requested_window_seconds,
                                })}`
                              : ''}
                          </span>
                        </summary>
                        {imagePhaseEntries.length === 0 ? (
                          <p className={styles.imageMetricUnavailable}>
                            {t('system_info.image_runtime.no_phase_samples')}
                          </p>
                        ) : (
                          <div className={styles.imagePhaseTableWrap}>
                            <table className={styles.imagePhaseTable}>
                              <thead>
                                <tr>
                                  <th>{t('system_info.image_runtime.phase')}</th>
                                  <th>{t('system_info.image_runtime.count')}</th>
                                  <th>{t('system_info.image_runtime.average')}</th>
                                  <th>{t('system_info.image_runtime.maximum')}</th>
                                  <th>{t('system_info.image_runtime.over_10_seconds')}</th>
                                  <th>{t('system_info.image_runtime.rolling_count')}</th>
                                  <th>{t('system_info.image_runtime.rolling_average')}</th>
                                  <th>{t('system_info.image_runtime.rolling_over_10_seconds')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {imagePhaseEntries.map(([name, metric]) => {
                                  const rollingMetric = imagePhaseRolling?.metrics[name];
                                  const rollingAvailable =
                                    imagePhaseRolling?.available === true &&
                                    rollingMetric !== undefined;
                                  return (
                                    <tr key={name}>
                                      <td>
                                        {t(`system_info.image_runtime.phase_names.${name}`, {
                                          defaultValue: name,
                                        })}
                                      </td>
                                      <td>{metric.count}</td>
                                      <td>
                                        {formatDurationNanos(
                                          metric.count > 0 ? metric.total_nanos / metric.count : 0
                                        )}
                                      </td>
                                      <td>{formatDurationNanos(metric.max_nanos)}</td>
                                      <td>{metric.over_10_seconds}</td>
                                      <td>{rollingAvailable ? rollingMetric.count : '-'}</td>
                                      <td>
                                        {rollingAvailable
                                          ? formatDurationNanos(rollingMetric.average_nanos)
                                          : '-'}
                                      </td>
                                      <td>
                                        {rollingAvailable ? rollingMetric.over_10_seconds : '-'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className={styles.imagePhaseNote}>
                          {t('system_info.image_runtime.phase_note')}
                        </p>
                      </details>
                    ) : null}
                  </>
                )}
              </details>

              <div className={styles.filesystemList}>
                {filesystemEntries.map(({ key, value }) => {
                  const ready = value.status === 'ok' && value.total_bytes > 0;
                  const usedPercent = ready ? Math.min(100, Math.max(0, value.used_percent)) : 0;
                  const header = (
                    <>
                      <span className={styles.filesystemHeading}>
                        <h3>{t(`system_info.filesystems.${key}`)}</h3>
                        <span>{value.path || '-'}</span>
                      </span>
                      {!ready ? (
                        <span className={styles.filesystemStatus}>
                          {t(
                            value.status === 'unavailable'
                              ? 'system_info.filesystem_unavailable'
                              : 'system_info.filesystem_unsupported'
                          )}
                        </span>
                      ) : null}
                    </>
                  );
                  const body = ready ? (
                    <>
                      <div
                        className={styles.filesystemTrack}
                        aria-label={t(`system_info.filesystems.${key}`)}
                      >
                        <span style={{ width: `${usedPercent}%` }} />
                      </div>
                      <dl className={styles.filesystemStats}>
                        <div>
                          <dt>{t('system_info.filesystem_used')}</dt>
                          <dd>{formatBytes(value.used_bytes)}</dd>
                        </div>
                        <div>
                          <dt>{t('system_info.filesystem_available')}</dt>
                          <dd>{formatBytes(value.available_bytes)}</dd>
                        </div>
                        <div>
                          <dt>{t('system_info.filesystem_total')}</dt>
                          <dd>{formatBytes(value.total_bytes)}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null;
                  if (key === 'working_directory') {
                    return (
                      <details
                        key={key}
                        className={`${styles.filesystemItem} ${styles.filesystemCollapsible}`}
                        open={workingDirectoryOpen}
                        onToggle={(event) => setWorkingDirectoryOpen(event.currentTarget.open)}
                      >
                        <summary className={styles.filesystemHeader}>
                          {header}
                          <span className={styles.sectionChevron} aria-hidden="true" />
                        </summary>
                        <div className={styles.filesystemCollapsibleContent}>{body}</div>
                      </details>
                    );
                  }
                  return (
                    <section key={key} className={styles.filesystemItem}>
                      <div className={styles.filesystemHeader}>{header}</div>
                      {body}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card
          title={t('system_info.control_panel_update_title')}
          extra={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadControlPanelUpdateStatus({ manual: true })}
              loading={checkingControlPanelUpdate}
            >
              {t('system_info.control_panel_update_check_button')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.control_panel_update_desc')}</p>
          {controlPanelUpdateStatus ? (
            <div className={styles.updatePanel}>
              <div className={styles.updateStatusRow}>
                {controlPanelUpdateStatus.disabled ? (
                  <span className="status-badge muted">
                    {t('system_info.control_panel_update_disabled')}
                  </span>
                ) : controlPanelUpdateStatus.updateAvailable ? (
                  <span className="status-badge warning">
                    {t('system_info.control_panel_update_available')}
                  </span>
                ) : (
                  <span className="status-badge success">
                    {t('system_info.control_panel_update_latest')}
                  </span>
                )}
                {controlPanelUpdateStatus.autoUpdateDisabled && (
                  <span className="status-badge warning">
                    {t('system_info.control_panel_update_auto_disabled')}
                  </span>
                )}
                {controlPanelUpdateStatus.error && (
                  <span className="status-badge error">
                    {t('system_info.control_panel_update_error')}
                  </span>
                )}
              </div>

              <div className={styles.updateInfoGrid}>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_local_exists')}</span>
                  <strong>
                    {controlPanelUpdateStatus.localExists ? t('common.yes') : t('common.no')}
                  </strong>
                </div>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_checked_at')}</span>
                  <strong>{formatControlPanelDate(controlPanelUpdateStatus.checkedAt)}</strong>
                </div>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_local_hash')}</span>
                  <strong>{controlPanelUpdateStatus.localHash || '-'}</strong>
                </div>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_remote_hash')}</span>
                  <strong>{controlPanelUpdateStatus.remoteHash || '-'}</strong>
                </div>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_local_modified_at')}</span>
                  <strong>
                    {formatControlPanelDate(controlPanelUpdateStatus.localModifiedAt)}
                  </strong>
                </div>
                <div className={styles.updateInfoItem}>
                  <span>{t('system_info.control_panel_update_remote_digest')}</span>
                  <strong>
                    {controlPanelUpdateStatus.remoteDigestAvailable
                      ? t('common.yes')
                      : t('common.no')}
                  </strong>
                </div>
              </div>

              {controlPanelUpdateStatus.error && (
                <div className="error-box">{controlPanelUpdateStatus.error}</div>
              )}

              {(controlPanelUpdateStatus.releaseUrl || controlPanelUpdateStatus.assetUrl) && (
                <div className={styles.updateLinks}>
                  {controlPanelUpdateStatus.releaseUrl && (
                    <a
                      href={controlPanelUpdateStatus.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('system_info.control_panel_update_release_link')}
                    </a>
                  )}
                  {controlPanelUpdateStatus.assetUrl && (
                    <a
                      href={controlPanelUpdateStatus.assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('system_info.control_panel_update_asset_link')}
                    </a>
                  )}
                </div>
              )}

              {!controlPanelUpdateStatus.disabled && controlPanelUpdateStatus.updateAvailable && (
                <div className={styles.updateActions}>
                  <Button
                    type="button"
                    onClick={() => void handleControlPanelUpdate()}
                    loading={updatingControlPanel}
                    disabled={checkingControlPanelUpdate}
                  >
                    {t('system_info.control_panel_update_button')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="hint">{t('system_info.control_panel_update_not_checked')}</div>
          )}
        </Card>

        <Card title={t('system_info.quick_links_title')}>
          <p className={styles.sectionDescription}>{t('system_info.quick_links_desc')}</p>
          <div className={styles.quickLinks}>
            <a
              href="https://github.com/router-for-me/CLIProxyAPI"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconGithub size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_main_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_main_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconCode size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_webui_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_webui_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://help.router-for.me/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.docs}`}>
                <IconBookOpen size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_docs')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_docs_desc')}</div>
              </div>
            </a>
          </div>
        </Card>

        <Card
          title={t('system_info.models_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fetchModels({ forceRefresh: true })}
              loading={modelsLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
          {modelStatus && (
            <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>
          )}
          {modelsError && <div className="error-box">{modelsError}</div>}
          {modelsLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : models.length === 0 ? (
            <div className="hint">{t('system_info.models_empty')}</div>
          ) : (
            <div className="item-list">
              {groupedModels.map((group) => {
                const iconSrc = getIconForCategory(group.id);
                return (
                  <div key={group.id} className="item-row">
                    <div className="item-meta">
                      <div className={styles.groupTitle}>
                        {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                        <span className="item-title">{group.label}</span>
                      </div>
                      <div className="item-subtitle">
                        {t('system_info.models_count', { count: group.items.length })}
                      </div>
                    </div>
                    <div className={styles.modelTags}>
                      {group.items.map((model) => (
                        <span
                          key={`${model.name}-${model.alias ?? 'default'}`}
                          className={styles.modelTag}
                          title={model.description || ''}
                        >
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t('system_info.clear_login_title')}>
          <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
          <div className={styles.clearLoginActions}>
            <Button variant="danger" onClick={handleClearLoginStorage}>
              {t('system_info.clear_login_button')}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div className="status-badge warning">{t('basic_settings.request_log_warning')}</div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
