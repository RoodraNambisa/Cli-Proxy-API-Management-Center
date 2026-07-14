import {
  useCallback,
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { animate } from 'motion/mini';
import type { AnimationPlaybackControlsWithThen } from 'motion-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconFilterAll, IconRefreshCw } from '@/components/ui/icons';
import { CODEX_CONFIG } from '@/components/quota';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { copyToClipboard } from '@/utils/clipboard';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { resolveCodexPlanType } from '@/utils/quota';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFilesBatchSettingsModal } from '@/features/authFiles/components/AuthFilesBatchSettingsModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { useAuthFilesBatchSettings } from '@/features/authFiles/hooks/useAuthFilesBatchSettings';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { useAuthFilesUsageSummary } from '@/features/authFiles/hooks/useAuthFilesUsageSummary';
import {
  ALL_PLAN_FILTER,
  ALL_PRIORITY_FILTER,
  UNSET_PRIORITY_FILTER,
  getAvailablePlanFilters,
  getAvailablePriorityFilters,
  matchesAuthFilePlanFilter,
  matchesAuthFilePriorityFilter,
} from '@/features/authFiles/linkedFilters';
import {
  isAuthFilesSortMode,
  readAuthFilesUiState,
  readPersistedAuthFilesCompactMode,
  writeAuthFilesUiState,
  writePersistedAuthFilesCompactMode,
  type AuthFilesSortMode,
} from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { CodexPlanTypeRefreshTask } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import styles from './AuthFilesPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const DEFAULT_REGULAR_PAGE_SIZE = 9;
const DEFAULT_COMPACT_PAGE_SIZE = 12;

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

const stringifySearchValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const isCodexPlanRefreshRunning = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task && (task.running || task.state === 'running'));

const isCodexPlanRefreshPaused = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task && (task.paused || task.state === 'paused'));

const isCodexPlanRefreshPauseRequested = (task: CodexPlanTypeRefreshTask | null): boolean =>
  Boolean(task?.pauseRequested);

const isCodexPlanRefreshActive = (task: CodexPlanTypeRefreshTask | null): boolean =>
  isCodexPlanRefreshRunning(task) ||
  isCodexPlanRefreshPaused(task) ||
  isCodexPlanRefreshPauseRequested(task);

const getCodexPlanRefreshDisplayState = (task: CodexPlanTypeRefreshTask): string => {
  if (isCodexPlanRefreshPauseRequested(task)) return 'pause_requested';
  if (isCodexPlanRefreshPaused(task)) return 'paused';
  return task.state;
};

const getCodexPlanRefreshStateLabel = (t: TFunction, state: string): string => {
  const key = `auth_files.codex_plan_refresh_state_${state}`;
  const translated = t(key);
  return translated === key ? state : translated;
};

const getCodexPlanRefreshResultStatusLabel = (t: TFunction, status: string): string => {
  const key = `auth_files.codex_plan_refresh_result_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
};

const getCodexPlanRefreshHint = (t: TFunction, task: CodexPlanTypeRefreshTask): string => {
  if (isCodexPlanRefreshPauseRequested(task)) {
    return task.currentName
      ? t('auth_files.codex_plan_refresh_running_hint', { name: task.currentName })
      : t('auth_files.codex_plan_refresh_state_pause_requested');
  }

  if (isCodexPlanRefreshPaused(task)) {
    return t('auth_files.codex_plan_refresh_state_paused');
  }

  if (task.state === 'running') {
    return task.currentName
      ? t('auth_files.codex_plan_refresh_running_hint', { name: task.currentName })
      : t('auth_files.codex_plan_refresh_running_hint_idle');
  }

  if (task.state === 'completed') {
    return t('auth_files.codex_plan_refresh_completed_hint', {
      processed: task.summary.processed,
      updated: task.summary.updated,
    });
  }

  if (task.state === 'completed_with_errors') {
    return t('auth_files.codex_plan_refresh_completed_with_errors_hint', {
      processed: task.summary.processed,
      updated: task.summary.updated,
      failed: task.summary.failed,
    });
  }

  if (task.state === 'failed') {
    const failedMessage =
      task.results.find((result) => result.status === 'failed' && result.error)?.error ?? '';
    return failedMessage
      ? t('auth_files.codex_plan_refresh_failed_hint', { message: failedMessage })
      : t('auth_files.codex_plan_refresh_failed_hint_fallback');
  }

  return t('auth_files.codex_plan_refresh_idle_hint');
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const providerParam = searchParams.get('provider');

  const [filter, setFilter] = useState<'all' | string>('all');
  const [planFilter, setPlanFilter] = useState(ALL_PLAN_FILTER);
  const [priorityFilter, setPriorityFilter] = useState(ALL_PRIORITY_FILTER);
  const [problemOnly, setProblemOnly] = useState(false);
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [disabledOnly, setDisabledOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSizeByMode, setPageSizeByMode] = useState({
    regular: DEFAULT_REGULAR_PAGE_SIZE,
    compact: DEFAULT_COMPACT_PAGE_SIZE,
  });
  const [pageSizeInput, setPageSizeInput] = useState('9');
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  const [codexUsageRefreshing, setCodexUsageRefreshing] = useState(false);
  const [codexResetCreditsRefreshing, setCodexResetCreditsRefreshing] = useState(false);
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);
  const pageAuthIndexesRef = useRef<string[]>([]);

  const { keyStats, usageAuths, usageLoading, loadKeyStats, refreshKeyStats } = useAuthFilesStats();
  const refreshVisibleKeyStats = useCallback(async () => {
    await refreshKeyStats(pageAuthIndexesRef.current);
  }, [refreshKeyStats]);
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    archiveDownloadingSelected,
    archiveDownloadingAll,
    clearingAllCooldowns,
    clearingSelectedCooldowns,
    codexPlanRefreshTask,
    codexPlanRefreshLoading,
    codexPlanRefreshStarting,
    codexPlanRefreshActionLoading,
    statusUpdating,
    xaiFieldsUpdating,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    handleXaiFieldToggle,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchArchiveDownload,
    downloadAllArchive,
    clearAllCooldowns,
    clearSelectedCooldowns,
    refreshCodexPlanTypeRefreshStatus,
    startCodexPlanTypeRefresh,
    clearCodexPlanTypeRefresh,
    pauseCodexPlanTypeRefresh,
    resumeCodexPlanTypeRefresh,
    retryFailedCodexPlanTypeRefresh,
    batchSetStatus,
    batchDelete,
  } = useAuthFilesData({ refreshKeyStats: refreshVisibleKeyStats, active: isCurrentLayer });

  const refreshFilesInBackground = useCallback(() => loadFiles({ background: true }), [loadFiles]);

  const disableControls = connectionStatus !== 'connected';
  const statusBarCache = useAuthFilesStatusBarCache(files, []);
  const usageSummaryCache = useAuthFilesUsageSummary(usageAuths);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls,
    loadFiles: refreshFilesInBackground,
  });

  const {
    batchSettings,
    batchSettingsDirty,
    openBatchSettings,
    closeBatchSettings,
    handleBatchSettingsChange,
    saveBatchSettings,
  } = useAuthFilesBatchSettings({
    files,
    disableControls,
    loadFiles: refreshFilesInBackground,
    deselectAll,
  });

  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;
  const pageSize = compactMode ? pageSizeByMode.compact : pageSizeByMode.regular;

  useEffect(() => {
    const persistedCompactMode = readPersistedAuthFilesCompactMode();
    if (typeof persistedCompactMode === 'boolean') {
      setCompactMode(persistedCompactMode);
    }

    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
        setFilter(persisted.filter);
      }
      if (typeof persisted.planFilter === 'string' && persisted.planFilter.trim()) {
        setPlanFilter(persisted.planFilter);
      }
      if (typeof persisted.priorityFilter === 'string' && persisted.priorityFilter.trim()) {
        setPriorityFilter(persisted.priorityFilter);
      }
      if (typeof persisted.problemOnly === 'boolean') {
        setProblemOnly(persisted.problemOnly);
      }
      if (typeof persisted.disabledOnly === 'boolean') {
        setDisabledOnly(persisted.disabledOnly);
      }
      if (typeof persisted.enabledOnly === 'boolean') {
        setEnabledOnly(persisted.enabledOnly);
        if (persisted.enabledOnly) {
          setDisabledOnly(false);
        }
      }
      if (typeof persistedCompactMode !== 'boolean' && typeof persisted.compactMode === 'boolean') {
        setCompactMode(persisted.compactMode);
      }
      if (typeof persisted.search === 'string') {
        setSearch(persisted.search);
      }
      if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
        setPage(Math.max(1, Math.round(persisted.page)));
      }
      const legacyPageSize =
        typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)
          ? clampCardPageSize(persisted.pageSize)
          : null;
      const regularPageSize =
        typeof persisted.regularPageSize === 'number' && Number.isFinite(persisted.regularPageSize)
          ? clampCardPageSize(persisted.regularPageSize)
          : (legacyPageSize ?? DEFAULT_REGULAR_PAGE_SIZE);
      const compactPageSize =
        typeof persisted.compactPageSize === 'number' && Number.isFinite(persisted.compactPageSize)
          ? clampCardPageSize(persisted.compactPageSize)
          : (legacyPageSize ?? DEFAULT_COMPACT_PAGE_SIZE);
      setPageSizeByMode({
        regular: regularPageSize,
        compact: compactPageSize,
      });
      if (isAuthFilesSortMode(persisted.sortMode)) {
        setSortMode(persisted.sortMode);
      }
    }

    setUiStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!uiStateHydrated) return;

    writeAuthFilesUiState({
      filter,
      planFilter,
      priorityFilter,
      problemOnly,
      enabledOnly,
      disabledOnly,
      compactMode,
      search,
      page,
      pageSize,
      regularPageSize: pageSizeByMode.regular,
      compactPageSize: pageSizeByMode.compact,
      sortMode,
    });
    writePersistedAuthFilesCompactMode(compactMode);
  }, [
    compactMode,
    disabledOnly,
    enabledOnly,
    filter,
    page,
    pageSize,
    pageSizeByMode,
    planFilter,
    problemOnly,
    priorityFilter,
    search,
    sortMode,
    uiStateHydrated,
  ]);

  useEffect(() => {
    if (!uiStateHydrated || !providerParam) return;
    const normalizedProvider = normalizeProviderKey(providerParam);
    if (!normalizedProvider) return;
    setFilter(normalizedProvider);
    setPage(1);
  }, [providerParam, uiStateHydrated]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const setCurrentModePageSize = useCallback(
    (next: number) => {
      setPageSizeByMode((current) =>
        compactMode ? { ...current, compact: next } : { ...current, regular: next }
      );
    },
    [compactMode]
  );

  const commitPageSizeInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const next = clampCardPageSize(value);
    setCurrentModePageSize(next);
    setPageSizeInput(String(next));
    setPage(1);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setCurrentModePageSize(rounded);
    setPage(1);
  };

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
      void loadFiles().catch(() => {});
    },
    [loadFiles, sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([
      loadFiles(),
      refreshVisibleKeyStats(),
      refreshCodexPlanTypeRefreshStatus(),
      loadExcluded(),
      loadModelAlias(),
    ]);
  }, [
    loadFiles,
    refreshVisibleKeyStats,
    refreshCodexPlanTypeRefreshStatus,
    loadExcluded,
    loadModelAlias,
  ]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshVisibleKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  const filesMatchingStatusFilters = useMemo(
    () =>
      files.filter((file) => {
        if (problemOnly && !hasAuthFileStatusMessage(file)) return false;
        if (enabledOnly && file.disabled === true) return false;
        if (disabledOnly && file.disabled !== true) return false;
        return true;
      }),
    [disabledOnly, enabledOnly, files, problemOnly]
  );

  const availablePlanFilters = useMemo(
    () => getAvailablePlanFilters(filesMatchingStatusFilters, priorityFilter),
    [filesMatchingStatusFilters, priorityFilter]
  );

  const planFilterOptions = useMemo(() => {
    return [
      { value: ALL_PLAN_FILTER, label: t('auth_files.plan_filter_all') },
      ...availablePlanFilters.map((planType) => {
        const key = `codex_quota.plan_${planType}`;
        const translated = t(key);
        return {
          value: planType,
          label: translated === key ? planType : translated,
        };
      }),
    ];
  }, [availablePlanFilters, t]);

  const availablePriorityFilters = useMemo(
    () => getAvailablePriorityFilters(filesMatchingStatusFilters, planFilter),
    [filesMatchingStatusFilters, planFilter]
  );

  const priorityFilterOptions = useMemo(() => {
    return [
      { value: ALL_PRIORITY_FILTER, label: t('auth_files.priority_filter_all') },
      ...availablePriorityFilters.map((priority) =>
        priority === UNSET_PRIORITY_FILTER
          ? {
              value: priority,
              label: t('auth_files.priority_filter_unset'),
            }
          : {
              value: priority,
              label: t('auth_files.priority_filter_value', { priority }),
            }
      ),
    ];
  }, [availablePriorityFilters, t]);

  const allPriorityFilters = useMemo(
    () => getAvailablePriorityFilters(filesMatchingStatusFilters, ALL_PLAN_FILTER),
    [filesMatchingStatusFilters]
  );

  useEffect(() => {
    if (loading) return;

    if (priorityFilter !== ALL_PRIORITY_FILTER && !allPriorityFilters.includes(priorityFilter)) {
      setPriorityFilter(ALL_PRIORITY_FILTER);
      setPage(1);
      return;
    }

    if (planFilter !== ALL_PLAN_FILTER && !availablePlanFilters.includes(planFilter)) {
      setPlanFilter(ALL_PLAN_FILTER);
      setPage(1);
    }
  }, [allPriorityFilters, availablePlanFilters, loading, planFilter, priorityFilter]);

  const handlePlanFilterChange = useCallback(
    (value: string) => {
      const nextPlanFilter = value || ALL_PLAN_FILTER;
      setPlanFilter(nextPlanFilter);
      if (
        priorityFilter !== ALL_PRIORITY_FILTER &&
        !getAvailablePriorityFilters(filesMatchingStatusFilters, nextPlanFilter).includes(
          priorityFilter
        )
      ) {
        setPriorityFilter(ALL_PRIORITY_FILTER);
      }
      setPage(1);
    },
    [filesMatchingStatusFilters, priorityFilter]
  );

  const handlePriorityFilterChange = useCallback(
    (value: string) => {
      const nextPriorityFilter = value || ALL_PRIORITY_FILTER;
      setPriorityFilter(nextPriorityFilter);
      if (
        planFilter !== ALL_PLAN_FILTER &&
        !getAvailablePlanFilters(filesMatchingStatusFilters, nextPriorityFilter).includes(
          planFilter
        )
      ) {
        setPlanFilter(ALL_PLAN_FILTER);
      }
      setPage(1);
    },
    [filesMatchingStatusFilters, planFilter]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('auth_files.sort_default') },
      { value: 'az', label: t('auth_files.sort_az') },
      { value: 'priority', label: t('auth_files.sort_priority') },
    ],
    [t]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filesMatchingStatusFilters.length };
    filesMatchingStatusFilters.forEach((file) => {
      if (!file.type) return;
      counts[file.type] = (counts[file.type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingStatusFilters]);

  const normalizedSearch = search.trim();
  const wildcardSearch = useMemo(() => buildWildcardSearch(normalizedSearch), [normalizedSearch]);

  const filtered = useMemo(() => {
    const normalizedTerm = normalizedSearch.toLowerCase();

    return filesMatchingStatusFilters.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const itemPlanType = resolveCodexPlanType(item);
      const matchPlan = matchesAuthFilePlanFilter(item, planFilter);
      const matchPriority = matchesAuthFilePriorityFilter(item, priorityFilter);
      const matchSearch =
        !normalizedSearch ||
        [
          item.name,
          item.type,
          item.provider,
          itemPlanType,
          item.status,
          item.note,
          item.error,
          item['error_message'],
          item['last_error'],
          item.lastError,
          getAuthFileStatusMessage(item),
        ].some((value) => {
          const content = stringifySearchValue(value);
          return wildcardSearch
            ? wildcardSearch.test(content)
            : content.toLowerCase().includes(normalizedTerm);
        });
      return matchType && matchPlan && matchPriority && matchSearch;
    });
  }, [
    filesMatchingStatusFilters,
    filter,
    normalizedSearch,
    planFilter,
    priorityFilter,
    wildcardSearch,
  ]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortMode === 'default') {
      copy.sort((a, b) => {
        const providerA = normalizeProviderKey(String(a.provider ?? a.type ?? 'unknown'));
        const providerB = normalizeProviderKey(String(b.provider ?? b.type ?? 'unknown'));
        const providerCompare = providerA.localeCompare(providerB);
        if (providerCompare !== 0) return providerCompare;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'az') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'priority') {
      copy.sort((a, b) => {
        const pa = parsePriorityValue(a.priority ?? a['priority']) ?? 0;
        const pb = parsePriorityValue(b.priority ?? b['priority']) ?? 0;
        return pb - pa; // 高优先级排前面
      });
    }
    return copy;
  }, [filtered, sortMode]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => sorted.slice(start, start + pageSize), [pageSize, sorted, start]);
  const currentPageAuthIndexes = useMemo(
    () =>
      Array.from(
        new Set(
          pageItems
            .map((file) => normalizeAuthIndex(file['auth_index'] ?? file.authIndex))
            .filter((value): value is string => Boolean(value))
        )
      ),
    [pageItems]
  );
  const currentPageAuthIndexesKey = currentPageAuthIndexes.join(',');

  useEffect(() => {
    pageAuthIndexesRef.current = currentPageAuthIndexes;
  }, [currentPageAuthIndexes]);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadKeyStats(currentPageAuthIndexes).catch(() => {});
  }, [currentPageAuthIndexes, currentPageAuthIndexesKey, isCurrentLayer, loadKeyStats]);

  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => sorted.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [sorted]
  );
  const currentPageCodexUsageTargets = useMemo(
    () => pageItems.filter((file) => CODEX_CONFIG.filterFn(file) && !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const codexPlanRefreshRunning = isCodexPlanRefreshRunning(codexPlanRefreshTask);
  const codexPlanRefreshPaused = isCodexPlanRefreshPaused(codexPlanRefreshTask);
  const codexPlanRefreshPauseRequested = isCodexPlanRefreshPauseRequested(codexPlanRefreshTask);
  const codexPlanRefreshActive = isCodexPlanRefreshActive(codexPlanRefreshTask);
  const codexPlanRefreshCanRetryFailed = Boolean(
    codexPlanRefreshTask?.state === 'completed_with_errors' && codexPlanRefreshTask.canRetryFailed
  );
  const showCodexPlanRefreshPanel = Boolean(
    codexPlanRefreshTask &&
    (codexPlanRefreshLoading ||
      codexPlanRefreshActive ||
      codexPlanRefreshTask.state !== 'idle' ||
      codexPlanRefreshTask.summary.processed > 0 ||
      codexPlanRefreshTask.results.length > 0 ||
      codexPlanRefreshTask.currentName)
  );
  const codexPlanRefreshSummaryItems = useMemo(
    () =>
      codexPlanRefreshTask
        ? [
            { key: 'eligible', value: codexPlanRefreshTask.summary.eligible },
            { key: 'processed', value: codexPlanRefreshTask.summary.processed },
            { key: 'updated', value: codexPlanRefreshTask.summary.updated },
            { key: 'unchanged', value: codexPlanRefreshTask.summary.unchanged },
            { key: 'skipped', value: codexPlanRefreshTask.summary.skipped },
            { key: 'failed', value: codexPlanRefreshTask.summary.failed },
          ]
        : [],
    [codexPlanRefreshTask]
  );
  const codexPlanRefreshFailedResults = useMemo(
    () =>
      codexPlanRefreshTask?.results.filter((result) => result.status === 'failed').slice(0, 3) ??
      [],
    [codexPlanRefreshTask]
  );
  const codexPlanRefreshDisplayState = codexPlanRefreshTask
    ? getCodexPlanRefreshDisplayState(codexPlanRefreshTask)
    : 'idle';
  const codexPlanRefreshStateLabel = codexPlanRefreshTask
    ? getCodexPlanRefreshStateLabel(t, codexPlanRefreshDisplayState)
    : '';
  const codexPlanRefreshHintText = codexPlanRefreshTask
    ? getCodexPlanRefreshHint(t, codexPlanRefreshTask)
    : '';
  const codexPlanRefreshStateBadgeClass = codexPlanRefreshTask
    ? codexPlanRefreshDisplayState === 'completed'
      ? styles.codexPlanRefreshStateCompleted
      : codexPlanRefreshDisplayState === 'completed_with_errors'
        ? styles.codexPlanRefreshStateWarning
        : codexPlanRefreshDisplayState === 'failed'
          ? styles.codexPlanRefreshStateFailed
          : codexPlanRefreshDisplayState === 'running'
            ? styles.codexPlanRefreshStateRunning
            : codexPlanRefreshDisplayState === 'pause_requested'
              ? styles.codexPlanRefreshStateWarning
              : codexPlanRefreshDisplayState === 'paused'
                ? styles.codexPlanRefreshStatePaused
                : styles.codexPlanRefreshStateIdle
    : styles.codexPlanRefreshStateIdle;
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;
  const clearSelectedCooldownsDisabled =
    disableControls || selectedNames.length === 0 || clearingSelectedCooldowns;
  const usageRefreshLoading = usageLoading || codexUsageRefreshing;

  const refreshCurrentPageCodexUsage = useCallback(async () => {
    const targets = currentPageCodexUsageTargets;
    if (targets.length === 0) {
      return { success: 0, failed: 0 };
    }

    setCodexQuota((prev) => {
      const next = { ...prev };
      targets.forEach((file) => {
        next[file.name] = CODEX_CONFIG.buildLoadingState();
      });
      return next;
    });

    const results = await Promise.all(
      targets.map(async (file) => {
        try {
          const data = await CODEX_CONFIG.fetchQuota(file, t);
          return { file, status: 'success' as const, data };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('common.unknown_error');
          return {
            file,
            status: 'error' as const,
            error: message,
            errorStatus: getStatusFromError(err),
          };
        }
      })
    );

    setCodexQuota((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        next[result.file.name] =
          result.status === 'success'
            ? CODEX_CONFIG.buildSuccessState(result.data, prev[result.file.name])
            : CODEX_CONFIG.buildErrorState(result.error, result.errorStatus);
      });
      return next;
    });

    return {
      success: results.filter((result) => result.status === 'success').length,
      failed: results.filter((result) => result.status === 'error').length,
    };
  }, [currentPageCodexUsageTargets, setCodexQuota, t]);

  const refreshCurrentPageCodexResetCredits = useCallback(async () => {
    const fetchResetCredits = CODEX_CONFIG.fetchResetCredits;
    const buildResetCreditsSuccessState = CODEX_CONFIG.buildResetCreditsSuccessState;
    if (!fetchResetCredits || !buildResetCreditsSuccessState) {
      return { success: 0, failed: 0 };
    }

    const targets = currentPageCodexUsageTargets;
    if (targets.length === 0) {
      return { success: 0, failed: 0 };
    }

    const results = await Promise.all(
      targets.map(async (file) => {
        try {
          const data = await fetchResetCredits(file, t);
          const refreshError = CODEX_CONFIG.getResetCreditsRefreshError?.(data) ?? '';
          return {
            file,
            status: refreshError ? ('error' as const) : ('success' as const),
            data,
            error: refreshError,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('common.unknown_error');
          return { file, status: 'error' as const, error: message };
        }
      })
    );

    setCodexQuota((prev) => {
      const next = { ...prev };
      results.forEach((result) => {
        if (!result.data) return;
        next[result.file.name] = buildResetCreditsSuccessState(result.data, prev[result.file.name]);
      });
      return next;
    });

    return {
      success: results.filter((result) => result.status === 'success').length,
      failed: results.filter((result) => result.status === 'error').length,
    };
  }, [currentPageCodexUsageTargets, setCodexQuota, t]);

  const handleRefreshPageUsageStats = useCallback(async () => {
    if (usageRefreshLoading) return;
    setCodexUsageRefreshing(true);
    try {
      const [, codexResult] = await Promise.all([
        refreshVisibleKeyStats(),
        refreshCurrentPageCodexUsage(),
      ]);
      if (codexResult.failed > 0) {
        showNotification(
          t('auth_files.usage_stats_refresh_partial', {
            success: codexResult.success,
            failed: codexResult.failed,
          }),
          'warning'
        );
        return;
      }
      showNotification(
        t('auth_files.usage_stats_refresh_success', { count: codexResult.success }),
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(t('auth_files.usage_stats_refresh_failed', { message }), 'error');
    } finally {
      setCodexUsageRefreshing(false);
    }
  }, [
    refreshCurrentPageCodexUsage,
    refreshVisibleKeyStats,
    showNotification,
    t,
    usageRefreshLoading,
  ]);

  const handleRefreshPageResetCredits = useCallback(async () => {
    if (codexResetCreditsRefreshing) return;
    setCodexResetCreditsRefreshing(true);
    try {
      const result = await refreshCurrentPageCodexResetCredits();
      if (result.failed > 0) {
        showNotification(
          t('auth_files.reset_credits_refresh_partial', {
            success: result.success,
            failed: result.failed,
          }),
          'warning'
        );
        return;
      }
      showNotification(
        t('auth_files.reset_credits_refresh_page_success', { count: result.success }),
        'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(t('auth_files.reset_credits_refresh_page_failed', { message }), 'error');
    } finally {
      setCodexResetCreditsRefreshing(false);
    }
  }, [codexResetCreditsRefreshing, refreshCurrentPageCodexResetCredits, showNotification, t]);

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    batchActionAnimationRef.current?.stop();
    batchActionAnimationRef.current = null;

    if (currentCount > 0 && previousCount === 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_HIDDEN_TRANSFORM, BATCH_BAR_BASE_TRANSFORM],
          opacity: [0, 1],
        },
        {
          duration: 0.28,
          ease: easePower3Out,
          onComplete: () => {
            actionsEl.style.transform = BATCH_BAR_BASE_TRANSFORM;
            actionsEl.style.opacity = '1';
          },
        }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_BASE_TRANSFORM, BATCH_BAR_HIDDEN_TRANSFORM],
          opacity: [1, 0],
        },
        {
          duration: 0.22,
          ease: easePower2In,
          onComplete: () => {
            if (selectionCountRef.current === 0) {
              setBatchActionBarVisible(false);
            }
          },
        }
      );
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.stop();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const renderFilterTags = () => (
    <div className={styles.filterRail}>
      <div className={styles.filterTags}>
        {existingTypes.map((type) => {
          const isActive = filter === type;
          const iconSrc = getAuthFileIcon(type, resolvedTheme);
          const color =
            type === 'all'
              ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
              : getTypeColor(type, resolvedTheme);
          const buttonStyle = {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': resolvedTheme === 'dark' ? '#111827' : '#ffffff',
          } as CSSProperties;

          return (
            <button
              key={type}
              className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
              style={buttonStyle}
              onClick={() => {
                setFilter(type);
                setPage(1);
              }}
            >
              <span className={styles.filterTagLabel}>
                {type === 'all' ? (
                  <span className={`${styles.filterTagIconWrap} ${styles.filterAllIconWrap}`}>
                    <IconFilterAll className={styles.filterAllIcon} size={16} />
                  </span>
                ) : (
                  <span className={styles.filterTagIconWrap}>
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className={styles.filterTagIcon} />
                    ) : (
                      <span className={styles.filterTagIconFallback}>
                        {getTypeLabel(t, type).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                )}
                <span className={styles.filterTagText}>{getTypeLabel(t, type)}</span>
              </span>
              <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = (() => {
    if (enabledOnly || disabledOnly) {
      return t('auth_files.delete_filtered_result_button');
    }
    if (problemOnly) {
      return filter === 'all'
        ? t('auth_files.delete_problem_button')
        : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) });
    }
    return filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;
  })();

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshPageUsageStats()}
              disabled={disableControls || usageRefreshLoading}
              loading={usageRefreshLoading}
              className={styles.usageRefreshButton}
            >
              <>
                <IconRefreshCw size={14} />
                <span>{t('auth_files.refresh_page_usage_stats')}</span>
              </>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshPageResetCredits()}
              disabled={
                disableControls ||
                codexResetCreditsRefreshing ||
                currentPageCodexUsageTargets.length === 0
              }
              loading={codexResetCreditsRefreshing}
              className={styles.usageRefreshButton}
            >
              <>
                <IconRefreshCw size={14} />
                <span>{t('auth_files.refresh_page_reset_credits')}</span>
              </>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void startCodexPlanTypeRefresh()}
              disabled={
                disableControls ||
                codexPlanRefreshLoading ||
                codexPlanRefreshStarting ||
                codexPlanRefreshActive
              }
              loading={codexPlanRefreshStarting}
            >
              {t('auth_files.codex_plan_refresh_button')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadAllArchive()}
              disabled={disableControls || archiveDownloadingAll}
              loading={archiveDownloadingAll}
            >
              {t('auth_files.archive_download_all')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={clearAllCooldowns}
              disabled={disableControls || loading || clearingAllCooldowns}
              loading={clearingAllCooldowns}
            >
              {t('auth_files.clear_cooldowns_all_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  enabledOnly,
                  disabledOnly,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                  onResetEnabledOnly: () => setEnabledOnly(false),
                  onResetDisabledOnly: () => setDisabledOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        {showCodexPlanRefreshPanel && codexPlanRefreshTask && (
          <div className={styles.codexPlanRefreshPanel}>
            <div className={styles.codexPlanRefreshHeader}>
              <div className={styles.codexPlanRefreshHeaderText}>
                <div className={styles.codexPlanRefreshEyebrow}>
                  {t('auth_files.codex_plan_refresh_title')}
                </div>
                <div className={styles.codexPlanRefreshTitleRow}>
                  <span className={styles.codexPlanRefreshTitle}>
                    {t('auth_files.codex_plan_refresh_panel_title')}
                  </span>
                  <span
                    className={`${styles.codexPlanRefreshStateBadge} ${codexPlanRefreshStateBadgeClass}`}
                  >
                    {codexPlanRefreshStateLabel}
                  </span>
                </div>
                <p className={styles.codexPlanRefreshHint}>{codexPlanRefreshHintText}</p>
              </div>

              <div className={styles.codexPlanRefreshSide}>
                <div className={styles.codexPlanRefreshActions}>
                  {codexPlanRefreshRunning && !codexPlanRefreshPaused && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void pauseCodexPlanTypeRefresh()}
                      disabled={
                        disableControls ||
                        codexPlanRefreshActionLoading ||
                        codexPlanRefreshPauseRequested
                      }
                    >
                      {codexPlanRefreshPauseRequested
                        ? t('auth_files.codex_plan_refresh_state_pause_requested')
                        : t('auth_files.codex_plan_refresh_pause')}
                    </Button>
                  )}
                  {codexPlanRefreshPaused && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void resumeCodexPlanTypeRefresh()}
                      disabled={disableControls || codexPlanRefreshActionLoading}
                    >
                      {t('auth_files.codex_plan_refresh_resume')}
                    </Button>
                  )}
                  {codexPlanRefreshCanRetryFailed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void retryFailedCodexPlanTypeRefresh()}
                      disabled={
                        disableControls ||
                        codexPlanRefreshActive ||
                        codexPlanRefreshStarting ||
                        codexPlanRefreshLoading
                      }
                      loading={codexPlanRefreshStarting}
                    >
                      {t('auth_files.codex_plan_refresh_retry_failed')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void clearCodexPlanTypeRefresh()}
                    disabled={
                      disableControls || codexPlanRefreshActive || codexPlanRefreshActionLoading
                    }
                    title={
                      codexPlanRefreshActive
                        ? t('auth_files.codex_plan_refresh_clear_unavailable')
                        : undefined
                    }
                  >
                    {t('auth_files.codex_plan_refresh_close_task')}
                  </Button>
                </div>

                {codexPlanRefreshTask.currentName && (
                  <div className={styles.codexPlanRefreshCurrent}>
                    <span className={styles.codexPlanRefreshCurrentLabel}>
                      {t('auth_files.codex_plan_refresh_current')}
                    </span>
                    <span className={styles.codexPlanRefreshCurrentValue}>
                      {codexPlanRefreshTask.currentName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.codexPlanRefreshSummaryGrid}>
              {codexPlanRefreshSummaryItems.map((item) => (
                <div key={item.key} className={styles.codexPlanRefreshSummaryItem}>
                  <span className={styles.codexPlanRefreshSummaryLabel}>
                    {t(`auth_files.codex_plan_refresh_summary_${item.key}`)}
                  </span>
                  <span className={styles.codexPlanRefreshSummaryValue}>{item.value}</span>
                </div>
              ))}
            </div>

            {codexPlanRefreshFailedResults.length > 0 && (
              <div className={styles.codexPlanRefreshFailures}>
                <span className={styles.codexPlanRefreshFailuresLabel}>
                  {t('auth_files.codex_plan_refresh_failures_label')}
                </span>
                <div className={styles.codexPlanRefreshFailureList}>
                  {codexPlanRefreshFailedResults.map((result) => (
                    <div
                      key={`${result.name}-${result.authId ?? result.error ?? result.status}`}
                      className={styles.codexPlanRefreshFailureItem}
                    >
                      <span className={styles.codexPlanRefreshFailureName}>{result.name}</span>
                      <span className={styles.codexPlanRefreshFailureMeta}>
                        {getCodexPlanRefreshResultStatusLabel(t, result.status)}
                        {result.error ? ` · ${result.error}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterContent}>
            <div className={styles.filterControlsPanel}>
              <div className={styles.filterControls}>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.search_label')}</label>
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder={t('auth_files.search_placeholder')}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.plan_filter_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={planFilter}
                    options={planFilterOptions}
                    onChange={handlePlanFilterChange}
                    ariaLabel={t('auth_files.plan_filter_label')}
                    fullWidth
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.priority_filter_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={priorityFilter}
                    options={priorityFilterOptions}
                    onChange={handlePriorityFilterChange}
                    ariaLabel={t('auth_files.priority_filter_label')}
                    fullWidth
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.page_size_label')}</label>
                  <input
                    className={styles.pageSizeSelect}
                    type="number"
                    min={MIN_CARD_PAGE_SIZE}
                    max={MAX_CARD_PAGE_SIZE}
                    step={1}
                    value={pageSizeInput}
                    onChange={handlePageSizeChange}
                    onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
                <div className={styles.filterItem}>
                  <label>{t('auth_files.sort_label')}</label>
                  <Select
                    className={styles.sortSelect}
                    value={sortMode}
                    options={sortOptions}
                    onChange={handleSortModeChange}
                    ariaLabel={t('auth_files.sort_label')}
                    fullWidth
                  />
                </div>
                <div className={`${styles.filterItem} ${styles.filterToggleItem}`}>
                  <label>{t('auth_files.display_options_label')}</label>
                  <div className={styles.filterToggleGroup}>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={problemOnly}
                        onChange={(value) => {
                          setProblemOnly(value);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.problem_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.problem_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={enabledOnly}
                        onChange={(value) => {
                          setEnabledOnly(value);
                          if (value) setDisabledOnly(false);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.enabled_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.enabled_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={disabledOnly}
                        onChange={(value) => {
                          setDisabledOnly(value);
                          if (value) setEnabledOnly(false);
                          setPage(1);
                        }}
                        ariaLabel={t('auth_files.disabled_filter_only')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.disabled_filter_only')}
                          </span>
                        }
                      />
                    </div>
                    <div className={styles.filterToggleCard}>
                      <ToggleSwitch
                        checked={compactMode}
                        onChange={(value) => setCompactMode(value)}
                        ariaLabel={t('auth_files.compact_mode_label')}
                        label={
                          <span className={styles.filterToggleLabel}>
                            {t('auth_files.compact_mode_label')}
                          </span>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className={styles.hint}>{t('common.loading')}</div>
            ) : pageItems.length === 0 ? (
              <EmptyState
                title={t('auth_files.search_empty_title')}
                description={t('auth_files.search_empty_desc')}
              />
            ) : (
              <div
                className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''} ${compactMode ? styles.fileGridCompact : ''}`}
              >
                {pageItems.map((file) => (
                  <AuthFileCard
                    key={file.name}
                    file={file}
                    compact={compactMode}
                    selected={selectedFiles.has(file.name)}
                    resolvedTheme={resolvedTheme}
                    disableControls={disableControls}
                    deleting={deleting}
                    statusUpdating={statusUpdating}
                    xaiFieldsUpdating={xaiFieldsUpdating}
                    quotaFilterType={quotaFilterType}
                    keyStats={keyStats}
                    statusBarCache={statusBarCache}
                    usageSummaryCache={usageSummaryCache}
                    usageLoading={usageLoading}
                    onShowModels={showModels}
                    onDownload={handleDownload}
                    onOpenPrefixProxyEditor={openPrefixProxyEditor}
                    onDelete={handleDelete}
                    onToggleStatus={handleStatusToggle}
                    onToggleXaiField={handleXaiFieldToggle}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}

            {!loading && sorted.length > pageSize && (
              <div className={styles.pagination}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  {t('auth_files.pagination_prev')}
                </Button>
                <div className={styles.pageInfo}>
                  {t('auth_files.pagination_info', {
                    current: currentPage,
                    total: totalPages,
                    count: sorted.length,
                  })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
        onEditProvider={openModelAliasEditor}
        onDeleteProvider={deleteModelAlias}
        modelAliasError={modelAliasError}
        modelAlias={modelAlias}
        allProviderModels={allProviderModels}
        onUpdate={handleMappingUpdate}
        onDeleteLink={handleDeleteLink}
        onToggleFork={handleToggleFork}
        onRenameAlias={handleRenameAlias}
        onDeleteAlias={handleDeleteAlias}
      />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onCopyText={copyTextWithNotification}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <AuthFilesBatchSettingsModal
        disableControls={disableControls}
        state={batchSettings}
        dirty={batchSettingsDirty}
        onClose={closeBatchSettings}
        onSave={saveBatchSettings}
        onChange={handleBatchSettingsChange}
      />

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_page')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(sorted)}
                    disabled={selectableFilteredItems.length === 0}
                  >
                    {t('auth_files.batch_select_filtered')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => invertVisibleSelection(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_invert_page')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void batchDownload(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void batchArchiveDownload(selectedNames)}
                    disabled={
                      disableControls || selectedNames.length === 0 || archiveDownloadingSelected
                    }
                    loading={archiveDownloadingSelected}
                  >
                    {t('auth_files.archive_download_selected')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openBatchSettings(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0 || batchSettings.saving}
                  >
                    {t('auth_files.batch_settings_button')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => clearSelectedCooldowns(selectedNames)}
                    disabled={clearSelectedCooldownsDisabled}
                    loading={clearingSelectedCooldowns}
                  >
                    {t('auth_files.clear_cooldowns_selected_button')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
