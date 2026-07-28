import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { parse as parseYaml, parseDocument } from 'yaml';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconRefreshCw,
  IconSearch,
} from '@/components/ui/icons';
import { VisualConfigEditor } from '@/components/config/VisualConfigEditor';
import {
  RequestBodyAuditCard,
  type RequestBodyAuditCardHandle,
} from '@/components/config/RequestBodyAuditCard';
import {
  RequestBodyReleaseCard,
  type RequestBodyReleaseCardHandle,
} from '@/components/config/RequestBodyReleaseCard';
import {
  ChatGptWebAccountInfoPanel,
  type ChatGptWebAccountInfoPanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebAccountInfoPanel';
import {
  ChatGptWebSentinelPanel,
  type ChatGptWebSentinelPanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebSentinelPanel';
import {
  ChatGptWebUsageCachePanel,
  type ChatGptWebUsageCachePanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebUsageCachePanel';
import { DiffModal } from '@/components/config/DiffModal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { useNotificationStore, useAuthStore, useThemeStore, useConfigStore } from '@/stores';
import { configFileApi } from '@/services/api/configFile';
import styles from './ConfigPage.module.scss';

type ConfigEditorTab = 'visual' | 'source';
type ConfigSidecarPanelId =
  | 'request-body-release'
  | 'request-body-audit'
  | 'config-chatgpt-web-account-info'
  | 'config-chatgpt-web-sentinel'
  | 'config-chatgpt-web-usage-cache';

type ConfigSidecarDirtySnapshot = {
  release: boolean;
  audit: boolean;
  accountInfo: boolean;
  sentinel: boolean;
  usageCache: boolean;
};

type ConfigSidecarSaveResult = {
  succeeded: ConfigSidecarPanelId[];
  failed: ConfigSidecarPanelId[];
};

const LazyConfigSourceEditor = lazy(() => import('@/components/config/ConfigSourceEditor'));

function readCommercialModeFromYaml(yamlContent: string): boolean {
  try {
    const parsed = parseYaml(yamlContent);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return Boolean((parsed as Record<string, unknown>)['commercial-mode']);
  } catch {
    return false;
  }
}

export function ConfigPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.isCurrentLayer : true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const connectionGenerationKey = useAuthStore((state) =>
    JSON.stringify([
      state.apiBase,
      state.managementAccessPath,
      state.connectionStatus,
      state.serverVersion,
      state.serverBuildDate,
      state.connectionGeneration ?? 0,
    ])
  );
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const {
    visualValues,
    baselineValues,
    visualDirty,
    visualDirtyFields,
    visualParseError,
    visualValidationErrors,
    visualCodexCustomModelValidationErrors,
    visualHasCodexCustomModelValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  } = useVisualConfig();

  const [activeTab, setActiveTab] = useState<ConfigEditorTab>(() => {
    const saved = localStorage.getItem('config-management:tab');
    if (saved === 'visual' || saved === 'source') return saved;
    return 'visual';
  });

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [requestBodyReleaseDirty, setRequestBodyReleaseDirty] = useState(false);
  const [requestBodyAuditDirty, setRequestBodyAuditDirty] = useState(false);
  const [chatGptWebAccountInfoDirty, setChatGptWebAccountInfoDirty] = useState(false);
  const [chatGptWebSentinelDirty, setChatGptWebSentinelDirty] = useState(false);
  const [chatGptWebUsageCacheDirty, setChatGptWebUsageCacheDirty] = useState(false);
  const [requestBodyReleaseErrorCount, setRequestBodyReleaseErrorCount] = useState(0);
  const [requestBodyAuditErrorCount, setRequestBodyAuditErrorCount] = useState(0);
  const [chatGptWebAccountInfoErrorCount, setChatGptWebAccountInfoErrorCount] = useState(0);
  const [chatGptWebSentinelErrorCount, setChatGptWebSentinelErrorCount] = useState(0);
  const [chatGptWebUsageCacheErrorCount, setChatGptWebUsageCacheErrorCount] = useState(0);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [serverYaml, setServerYaml] = useState('');
  const [mergedYaml, setMergedYaml] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const floatingActionsRef = useRef<HTMLDivElement>(null);
  const requestBodyReleaseRef = useRef<RequestBodyReleaseCardHandle | null>(null);
  const requestBodyAuditRef = useRef<RequestBodyAuditCardHandle | null>(null);
  const chatGptWebAccountInfoRef = useRef<ChatGptWebAccountInfoPanelHandle | null>(null);
  const chatGptWebSentinelRef = useRef<ChatGptWebSentinelPanelHandle | null>(null);
  const chatGptWebUsageCacheRef = useRef<ChatGptWebUsageCachePanelHandle | null>(null);

  const disableControls = connectionStatus !== 'connected';
  const yamlDirty = dirty || visualDirty;
  const isDirty =
    yamlDirty ||
    requestBodyReleaseDirty ||
    requestBodyAuditDirty ||
    chatGptWebAccountInfoDirty ||
    chatGptWebSentinelDirty ||
    chatGptWebUsageCacheDirty;
  const shouldRenderFloatingActions = isCurrentLayer;
  const hasVisualModeError = !!visualParseError;
  const hasVisualValidationErrors =
    activeTab === 'visual' &&
    (Object.values(visualValidationErrors).some(Boolean) ||
      visualHasCodexCustomModelValidationErrors ||
      visualHasPayloadValidationErrors);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await configFileApi.fetchConfigYaml();
      setContent(data);
      setDirty(false);
      setDiffModalOpen(false);
      setServerYaml(data);
      setMergedYaml(data);
      loadVisualValuesFromYaml(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [loadVisualValuesFromYaml, t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab !== 'visual' || !visualParseError) return;

    setActiveTab('source');
    localStorage.setItem('config-management:tab', 'source');
    showNotification(
      t('config_management.visual_mode_unavailable_detail', { message: visualParseError }),
      'error'
    );
  }, [activeTab, showNotification, t, visualParseError]);

  const validateDirtySidecars = useCallback(() => {
    const releaseValid =
      !requestBodyReleaseDirty || requestBodyReleaseRef.current?.validate() !== false;
    const auditValid = !requestBodyAuditDirty || requestBodyAuditRef.current?.validate() !== false;
    const accountInfoValid =
      !chatGptWebAccountInfoDirty || chatGptWebAccountInfoRef.current?.validate() !== false;
    const sentinelValid =
      !chatGptWebSentinelDirty || chatGptWebSentinelRef.current?.validate() !== false;
    const usageCacheValid =
      !chatGptWebUsageCacheDirty || chatGptWebUsageCacheRef.current?.validate() !== false;
    if (releaseValid && auditValid && accountInfoValid && sentinelValid && usageCacheValid)
      return true;
    setActiveTab('visual');
    localStorage.setItem('config-management:tab', 'visual');
    const invalidSection = !releaseValid
      ? 'request-body-release'
      : !auditValid
        ? 'request-body-audit'
        : !accountInfoValid
          ? 'config-chatgpt-web-account-info'
          : !sentinelValid
            ? 'config-chatgpt-web-sentinel'
            : 'config-chatgpt-web-usage-cache';
    navigate(`/config?section=${invalidSection}`, { replace: true });
    showNotification(t('config_management.settings_center.sidecar_validation_failed'), 'error');
    return false;
  }, [
    chatGptWebAccountInfoDirty,
    chatGptWebSentinelDirty,
    chatGptWebUsageCacheDirty,
    navigate,
    requestBodyAuditDirty,
    requestBodyReleaseDirty,
    showNotification,
    t,
  ]);

  const applyYamlSnapshot = useCallback(
    (nextContent: string) => {
      setDirty(false);
      setContent(nextContent);
      setServerYaml(nextContent);
      setMergedYaml(nextContent);
      loadVisualValuesFromYaml(nextContent);
    },
    [loadVisualValuesFromYaml]
  );

  const refreshSavedSnapshots = useCallback(
    async ({
      reloadRelease = false,
      reloadAudit = false,
      reloadAccountInfo = false,
      reloadSentinel = false,
      reloadUsageCache = false,
    } = {}) => {
      try {
        const [latestContent] = await Promise.all([
          configFileApi.fetchConfigYaml(),
          reloadRelease
            ? (requestBodyReleaseRef.current?.reload() ?? Promise.resolve())
            : Promise.resolve(),
          reloadAudit
            ? (requestBodyAuditRef.current?.reload() ?? Promise.resolve())
            : Promise.resolve(),
          reloadAccountInfo
            ? (chatGptWebAccountInfoRef.current?.reload() ?? Promise.resolve())
            : Promise.resolve(),
          reloadSentinel
            ? (chatGptWebSentinelRef.current?.reload() ?? Promise.resolve())
            : Promise.resolve(),
          reloadUsageCache
            ? (chatGptWebUsageCacheRef.current?.reload() ?? Promise.resolve())
            : Promise.resolve(),
        ]);
        applyYamlSnapshot(latestContent);
        return true;
      } catch (refreshError: unknown) {
        const message =
          refreshError instanceof Error
            ? refreshError.message
            : typeof refreshError === 'string'
              ? refreshError
              : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
        return false;
      }
    },
    [applyYamlSnapshot, showNotification, t]
  );

  const refreshSharedConfig = useCallback(async () => {
    try {
      useConfigStore.getState().clearCache();
      await useConfigStore.getState().fetchConfig(undefined, true);
    } catch (refreshError: unknown) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : typeof refreshError === 'string'
            ? refreshError
            : '';
      showNotification(
        `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
  }, [showNotification, t]);

  const saveDirtySidecars = useCallback(
    async (snapshot: ConfigSidecarDirtySnapshot): Promise<ConfigSidecarSaveResult> => {
      const results: Array<{ id: ConfigSidecarPanelId; success: boolean }> = [];
      if (snapshot.release) {
        const panel = requestBodyReleaseRef.current;
        results.push({
          id: 'request-body-release',
          success: panel ? await panel.save() : false,
        });
      }
      if (snapshot.audit) {
        const panel = requestBodyAuditRef.current;
        results.push({
          id: 'request-body-audit',
          success: panel ? await panel.save() : false,
        });
      }
      if (snapshot.accountInfo) {
        const panel = chatGptWebAccountInfoRef.current;
        results.push({
          id: 'config-chatgpt-web-account-info',
          success: panel ? await panel.save() : false,
        });
      }
      if (snapshot.sentinel) {
        const panel = chatGptWebSentinelRef.current;
        results.push({
          id: 'config-chatgpt-web-sentinel',
          success: panel ? await panel.save() : false,
        });
      }
      if (snapshot.usageCache) {
        const panel = chatGptWebUsageCacheRef.current;
        results.push({
          id: 'config-chatgpt-web-usage-cache',
          success: panel ? await panel.save() : false,
        });
      }

      const failedResult = results.find((result) => !result.success);
      if (failedResult) {
        setActiveTab('visual');
        localStorage.setItem('config-management:tab', 'visual');
        navigate(`/config?section=${failedResult.id}`, { replace: true });
      }

      return {
        succeeded: results.filter((result) => result.success).map((result) => result.id),
        failed: results.filter((result) => !result.success).map((result) => result.id),
      };
    },
    [navigate]
  );

  const showSidecarSaveSummary = useCallback(
    (result: ConfigSidecarSaveResult, yamlSaved: boolean) => {
      if (result.failed.length === 0) return;
      if (yamlSaved) {
        showNotification(t('config_management.settings_center.partial_save'), 'warning');
      } else if (result.succeeded.length > 0) {
        showNotification(t('config_management.settings_center.sidecar_partial_save'), 'warning');
      }
    },
    [showNotification, t]
  );

  const saveSidecarsWithoutYaml = useCallback(
    async (snapshot: ConfigSidecarDirtySnapshot) => {
      const result = await saveDirtySidecars(snapshot);
      if (result.succeeded.length > 0) {
        await refreshSavedSnapshots();
      }
      showSidecarSaveSummary(result, false);
      return result;
    },
    [refreshSavedSnapshots, saveDirtySidecars, showSidecarSaveSummary]
  );

  const handleConfirmSave = async () => {
    if (!validateDirtySidecars()) return;
    const sidecarSnapshot: ConfigSidecarDirtySnapshot = {
      release: requestBodyReleaseDirty,
      audit: requestBodyAuditDirty,
      accountInfo: chatGptWebAccountInfoDirty,
      sentinel: chatGptWebSentinelDirty,
      usageCache: chatGptWebUsageCacheDirty,
    };
    setSaving(true);
    try {
      const previousCommercialMode = readCommercialModeFromYaml(serverYaml);
      const nextCommercialMode = readCommercialModeFromYaml(mergedYaml);
      const commercialModeChanged = previousCommercialMode !== nextCommercialMode;

      await configFileApi.saveConfigYaml(mergedYaml);
      setDiffModalOpen(false);
      applyYamlSnapshot(mergedYaml);

      const sidecarResult = await saveDirtySidecars(sidecarSnapshot);
      await refreshSavedSnapshots({
        reloadRelease: !sidecarSnapshot.release,
        reloadAudit: !sidecarSnapshot.audit,
        reloadAccountInfo: !sidecarSnapshot.accountInfo,
        reloadSentinel: !sidecarSnapshot.sentinel,
        reloadUsageCache: !sidecarSnapshot.usageCache,
      });
      await refreshSharedConfig();

      if (commercialModeChanged) {
        showNotification(t('notification.commercial_mode_restart_required'), 'warning');
      }

      if (sidecarResult.failed.length > 0) {
        showSidecarSaveSummary(sidecarResult, true);
      } else {
        showNotification(t('config_management.save_success'), 'success');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validateDirtySidecars()) return;

    if (
      !yamlDirty &&
      (requestBodyReleaseDirty ||
        requestBodyAuditDirty ||
        chatGptWebAccountInfoDirty ||
        chatGptWebSentinelDirty ||
        chatGptWebUsageCacheDirty)
    ) {
      const sidecarSnapshot: ConfigSidecarDirtySnapshot = {
        release: requestBodyReleaseDirty,
        audit: requestBodyAuditDirty,
        accountInfo: chatGptWebAccountInfoDirty,
        sentinel: chatGptWebSentinelDirty,
        usageCache: chatGptWebUsageCacheDirty,
      };
      setSaving(true);
      try {
        await saveSidecarsWithoutYaml(sidecarSnapshot);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (yamlDirty && activeTab === 'visual' && visualParseError) {
      showNotification(t('config_management.visual_mode_save_blocked'), 'error');
      return;
    }

    setSaving(true);
    try {
      const latestServerYaml = await configFileApi.fetchConfigYaml();

      if (yamlDirty && activeTab !== 'source') {
        const latestDocument = parseDocument(latestServerYaml);
        if (latestDocument.errors.length > 0) {
          showNotification(
            t('config_management.visual_mode_latest_yaml_invalid', {
              message:
                latestDocument.errors[0]?.message ??
                t('config_management.visual_mode_save_blocked'),
            }),
            'error'
          );
          return;
        }
      }

      // In source mode, save exactly what the user edited. In visual mode, materialize visual changes into the latest YAML.
      const nextMergedYaml =
        activeTab === 'source' ? content : applyVisualChangesToYaml(latestServerYaml);

      // In visual mode, applyVisualChangesToYaml re-serializes YAML via parseDocument → toString,
      // which may reformat comments/whitespace. Normalize the server YAML through the same pipeline
      // so the diff only shows actual value changes, not cosmetic reformatting.
      let diffOriginal = latestServerYaml;
      if (activeTab !== 'source') {
        try {
          const doc = parseDocument(latestServerYaml);
          diffOriginal = doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
        } catch {
          /* keep raw on parse failure */
        }
      }

      if (diffOriginal === nextMergedYaml) {
        applyYamlSnapshot(latestServerYaml);
        if (
          requestBodyReleaseDirty ||
          requestBodyAuditDirty ||
          chatGptWebAccountInfoDirty ||
          chatGptWebSentinelDirty ||
          chatGptWebUsageCacheDirty
        ) {
          await saveSidecarsWithoutYaml({
            release: requestBodyReleaseDirty,
            audit: requestBodyAuditDirty,
            accountInfo: chatGptWebAccountInfoDirty,
            sentinel: chatGptWebSentinelDirty,
            usageCache: chatGptWebUsageCacheDirty,
          });
          return;
        }
        showNotification(t('config_management.diff.no_changes'), 'info');
        return;
      }

      setServerYaml(diffOriginal);
      setMergedYaml(nextMergedYaml);
      setDiffModalOpen(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = useCallback((value: string) => {
    setContent(value);
    setDirty(true);
  }, []);

  const handleTabChange = useCallback(
    (tab: ConfigEditorTab) => {
      if (tab === activeTab) return;

      if (tab === 'source') {
        // Only rewrite YAML when there are pending visual changes; otherwise preserve raw YAML + comments.
        if (visualDirty) {
          const nextContent = applyVisualChangesToYaml(content);
          if (nextContent !== content) {
            setContent(nextContent);
            setDirty(true);
          }
        }
      } else {
        const result = loadVisualValuesFromYaml(content);
        if (!result.ok) {
          showNotification(
            t('config_management.visual_mode_unavailable_detail', { message: result.error }),
            'error'
          );
          return;
        }
      }

      setActiveTab(tab);
      localStorage.setItem('config-management:tab', tab);
    },
    [
      activeTab,
      applyVisualChangesToYaml,
      content,
      loadVisualValuesFromYaml,
      showNotification,
      t,
      visualDirty,
    ]
  );

  // Search functionality
  const performSearch = useCallback((query: string, direction: 'next' | 'prev' = 'next') => {
    if (!query || !editorRef.current?.view) return;

    const view = editorRef.current.view;
    const doc = view.state.doc.toString();
    const matches: number[] = [];
    const lowerQuery = query.toLowerCase();
    const lowerDoc = doc.toLowerCase();

    let pos = 0;
    while (pos < lowerDoc.length) {
      const index = lowerDoc.indexOf(lowerQuery, pos);
      if (index === -1) break;
      matches.push(index);
      pos = index + 1;
    }

    if (matches.length === 0) {
      setSearchResults({ current: 0, total: 0 });
      return;
    }

    // Find current match based on cursor position
    const selection = view.state.selection.main;
    const cursorPos = direction === 'prev' ? selection.from : selection.to;
    let currentIndex = 0;

    if (direction === 'next') {
      // Find next match after cursor
      for (let i = 0; i < matches.length; i++) {
        if (matches[i] > cursorPos) {
          currentIndex = i;
          break;
        }
        // If no match after cursor, wrap to first
        if (i === matches.length - 1) {
          currentIndex = 0;
        }
      }
    } else {
      // Find previous match before cursor
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i] < cursorPos) {
          currentIndex = i;
          break;
        }
        // If no match before cursor, wrap to last
        if (i === 0) {
          currentIndex = matches.length - 1;
        }
      }
    }

    const matchPos = matches[currentIndex];
    setSearchResults({ current: currentIndex + 1, total: matches.length });

    // Scroll to and select the match
    view.dispatch({
      selection: { anchor: matchPos, head: matchPos + query.length },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    // Do not auto-search on each keystroke. Clear previous results when query changes.
    if (!value) {
      setSearchResults({ current: 0, total: 0 });
      setLastSearchedQuery('');
    } else {
      setSearchResults({ current: 0, total: 0 });
    }
  }, []);

  const executeSearch = useCallback(
    (direction: 'next' | 'prev' = 'next') => {
      if (!searchQuery) return;
      setLastSearchedQuery(searchQuery);
      performSearch(searchQuery, direction);
    },
    [searchQuery, performSearch]
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearch(e.shiftKey ? 'prev' : 'next');
      }
    },
    [executeSearch]
  );

  const handlePrevMatch = useCallback(() => {
    if (!lastSearchedQuery) return;
    performSearch(lastSearchedQuery, 'prev');
  }, [lastSearchedQuery, performSearch]);

  const handleNextMatch = useCallback(() => {
    if (!lastSearchedQuery) return;
    performSearch(lastSearchedQuery, 'next');
  }, [lastSearchedQuery, performSearch]);

  // Keep bottom floating actions from covering page content by syncing its height to a CSS variable.
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !shouldRenderFloatingActions) return;

    const actionsEl = floatingActionsRef.current;
    if (!actionsEl) return;

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--config-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--config-action-bar-height');
    };
  }, [shouldRenderFloatingActions]);

  // Status text
  const getStatusText = () => {
    if (disableControls) return t('config_management.status_disconnected');
    if (loading) return t('config_management.status_loading');
    if (error) return t('config_management.status_load_failed');
    if (hasVisualModeError) return t('config_management.visual_mode_unavailable');
    if (hasVisualValidationErrors)
      return t('config_management.visual.validation.validation_blocked');
    if (saving) return t('config_management.status_saving');
    if (isDirty) return t('config_management.status_dirty');
    return t('config_management.status_loaded');
  };

  const getStatusClass = () => {
    if (error || hasVisualModeError || hasVisualValidationErrors) return styles.error;
    if (isDirty) return styles.modified;
    if (!loading && !saving) return styles.saved;
    return '';
  };

  const getFloatingStatusText = () => {
    if (!isMobile) return getStatusText();
    if (disableControls)
      return t('config_management.status_disconnected_short', { defaultValue: 'Disconnected' });
    if (loading) return t('config_management.status_loading_short', { defaultValue: 'Loading' });
    if (error) return t('config_management.status_load_failed_short', { defaultValue: 'Failed' });
    if (hasVisualModeError)
      return t('config_management.visual_mode_unavailable_short', { defaultValue: 'YAML issue' });
    if (hasVisualValidationErrors)
      return t('config_management.visual.validation_blocked_short', { defaultValue: 'Fix errors' });
    if (saving) return t('config_management.status_saving_short', { defaultValue: 'Saving' });
    if (isDirty) return t('config_management.status_dirty_short', { defaultValue: 'Unsaved' });
    return t('config_management.status_loaded_short', { defaultValue: 'Loaded' });
  };

  const handleReload = useCallback(() => {
    if (!isDirty) {
      void Promise.all([
        loadConfig(),
        requestBodyReleaseRef.current?.reload(),
        requestBodyAuditRef.current?.reload(),
        chatGptWebAccountInfoRef.current?.reload(),
        chatGptWebSentinelRef.current?.reload(),
        chatGptWebUsageCacheRef.current?.reload(),
      ]);
      return;
    }

    showConfirmation({
      title: t('common.unsaved_changes_title'),
      message: t('config_management.reload_confirm_message'),
      confirmText: t('config_management.reload'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        await Promise.all([
          loadConfig(),
          requestBodyReleaseRef.current?.reload(),
          requestBodyAuditRef.current?.reload(),
          chatGptWebAccountInfoRef.current?.reload(),
          chatGptWebSentinelRef.current?.reload(),
          chatGptWebUsageCacheRef.current?.reload(),
        ]);
      },
    });
  }, [isDirty, loadConfig, showConfirmation, t]);

  const floatingActions = (
    <div className={styles.floatingActionContainer} ref={floatingActionsRef}>
      <div className={styles.floatingActionList}>
        <div
          className={`${styles.floatingStatus} ${
            isMobile ? styles.floatingStatusCompact : ''
          } ${getStatusClass()}`}
        >
          {getFloatingStatusText()}
        </div>
        <button
          type="button"
          className={styles.floatingActionButton}
          onClick={handleReload}
          disabled={loading || saving}
          title={t('config_management.reload')}
          aria-label={t('config_management.reload')}
        >
          <IconRefreshCw size={16} />
        </button>
        <button
          type="button"
          className={styles.floatingActionButton}
          onClick={handleSave}
          disabled={
            disableControls ||
            loading ||
            saving ||
            !isDirty ||
            diffModalOpen ||
            (yamlDirty && (hasVisualModeError || hasVisualValidationErrors))
          }
          title={t('config_management.save')}
          aria-label={t('config_management.save')}
        >
          <IconCheck size={16} />
          {isDirty && <span className={styles.dirtyDot} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  const pageEyebrow =
    activeTab === 'visual'
      ? t('config_management.tabs.visual', { defaultValue: '可视化编辑' })
      : t('config_management.tabs.source', { defaultValue: '源文件编辑' });
  const pageDescription =
    activeTab === 'visual'
      ? t('config_management.visual.notice')
      : t('config_management.description');

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <span className={styles.pageEyebrow}>{pageEyebrow}</span>
          <h1 className={styles.pageTitle}>{t('config_management.title')}</h1>
          <p className={styles.description}>{pageDescription}</p>
        </div>

        <div className={styles.pageMeta}>
          <div className={`${styles.statusBadge} ${getStatusClass()}`}>{getStatusText()}</div>
          <div className={styles.tabBar}>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'visual' ? styles.tabActive : ''}`}
              onClick={() => handleTabChange('visual')}
              disabled={saving || loading}
            >
              {t('config_management.tabs.visual', { defaultValue: '可视化编辑' })}
            </button>
            <button
              type="button"
              className={`${styles.tabItem} ${activeTab === 'source' ? styles.tabActive : ''}`}
              onClick={() => handleTabChange('source')}
              disabled={saving || loading}
            >
              {t('config_management.tabs.source', { defaultValue: '源代码编辑' })}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.workspaceShell}>
        <div className={styles.content}>
          {error && <div className="error-box">{error}</div>}
          {!error && visualParseError && (
            <div className="error-box">
              {t('config_management.visual_mode_unavailable_detail', { message: visualParseError })}
            </div>
          )}

          <div hidden={activeTab !== 'visual'}>
            <VisualConfigEditor
              values={visualValues}
              baselineValues={baselineValues}
              validationErrors={visualValidationErrors}
              codexCustomModelValidationErrors={visualCodexCustomModelValidationErrors}
              hasPayloadValidationErrors={visualHasPayloadValidationErrors}
              disabled={disableControls || loading}
              dirtyFields={visualDirtyFields}
              requestBodyDirty={requestBodyReleaseDirty || requestBodyAuditDirty}
              requestBodyErrorCount={requestBodyReleaseErrorCount + requestBodyAuditErrorCount}
              chatGptWebSentinelDirty={
                chatGptWebAccountInfoDirty || chatGptWebSentinelDirty || chatGptWebUsageCacheDirty
              }
              chatGptWebSentinelErrorCount={
                chatGptWebAccountInfoErrorCount +
                chatGptWebSentinelErrorCount +
                chatGptWebUsageCacheErrorCount
              }
              renderRequestBodyPanels={({ focusTarget }) => (
                <>
                  <RequestBodyReleaseCard
                    ref={requestBodyReleaseRef}
                    disabled={disableControls}
                    externalSaving={saving}
                    embedded
                    focusTarget={focusTarget}
                    onDirtyChange={setRequestBodyReleaseDirty}
                    onErrorCountChange={setRequestBodyReleaseErrorCount}
                  />
                  <RequestBodyAuditCard
                    ref={requestBodyAuditRef}
                    disabled={disableControls}
                    externalSaving={saving}
                    embedded
                    focusTarget={focusTarget}
                    onDirtyChange={setRequestBodyAuditDirty}
                    onErrorCountChange={setRequestBodyAuditErrorCount}
                  />
                </>
              )}
              renderChatGptWebSentinel={({ active, focusTarget }) => (
                <>
                  <ChatGptWebAccountInfoPanel
                    ref={chatGptWebAccountInfoRef}
                    active={active && activeTab === 'visual' && isCurrentLayer}
                    disabled={disableControls}
                    connectionGenerationKey={connectionGenerationKey}
                    externalSaving={saving}
                    focusTarget={focusTarget}
                    onDirtyChange={setChatGptWebAccountInfoDirty}
                    onErrorCountChange={setChatGptWebAccountInfoErrorCount}
                  />
                  <ChatGptWebUsageCachePanel
                    ref={chatGptWebUsageCacheRef}
                    active={active}
                    disabled={disableControls}
                    externalSaving={saving}
                    focusTarget={focusTarget}
                    onDirtyChange={setChatGptWebUsageCacheDirty}
                    onErrorCountChange={setChatGptWebUsageCacheErrorCount}
                  />
                  <ChatGptWebSentinelPanel
                    ref={chatGptWebSentinelRef}
                    active={active}
                    disabled={disableControls}
                    externalSaving={saving}
                    embedded
                    focusTarget={focusTarget}
                    onDirtyChange={setChatGptWebSentinelDirty}
                    onErrorCountChange={setChatGptWebSentinelErrorCount}
                  />
                </>
              )}
              onChange={setVisualValues}
            />
          </div>
          {activeTab === 'source' ? (
            <div className={styles.sourceWorkspace}>
              <div className={styles.sourceToolbar}>
                <div className={styles.searchInputWrapper}>
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={t('config_management.search_placeholder', {
                      defaultValue: '搜索配置内容...',
                    })}
                    disabled={disableControls || loading}
                    className={styles.searchInput}
                    rightElement={
                      <div className={styles.searchRight}>
                        {searchQuery && lastSearchedQuery === searchQuery && (
                          <span className={styles.searchCount}>
                            {searchResults.total > 0
                              ? `${searchResults.current} / ${searchResults.total}`
                              : t('config_management.search_no_results', {
                                  defaultValue: '无结果',
                                })}
                          </span>
                        )}
                        <button
                          type="button"
                          className={styles.searchButton}
                          onClick={() => executeSearch('next')}
                          disabled={!searchQuery || disableControls || loading}
                          title={t('config_management.search_button', { defaultValue: '搜索' })}
                        >
                          <IconSearch size={16} />
                        </button>
                      </div>
                    }
                  />
                </div>

                <div className={styles.searchActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePrevMatch}
                    disabled={
                      !searchQuery || lastSearchedQuery !== searchQuery || searchResults.total === 0
                    }
                    title={t('config_management.search_prev', { defaultValue: '上一个' })}
                  >
                    <IconChevronUp size={16} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleNextMatch}
                    disabled={
                      !searchQuery || lastSearchedQuery !== searchQuery || searchResults.total === 0
                    }
                    title={t('config_management.search_next', { defaultValue: '下一个' })}
                  >
                    <IconChevronDown size={16} />
                  </Button>
                </div>
              </div>

              <div className={styles.editorWrapper}>
                <Suspense fallback={null}>
                  <LazyConfigSourceEditor
                    editorRef={editorRef}
                    value={content}
                    onChange={handleChange}
                    theme={resolvedTheme}
                    editable={!disableControls && !loading}
                    placeholder={t('config_management.editor_placeholder')}
                  />
                </Suspense>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {shouldRenderFloatingActions && typeof document !== 'undefined'
        ? createPortal(floatingActions, document.body)
        : null}
      <DiffModal
        open={diffModalOpen}
        original={serverYaml}
        modified={mergedYaml}
        onConfirm={handleConfirmSave}
        onCancel={() => setDiffModalOpen(false)}
        loading={saving}
      />
    </div>
  );
}
