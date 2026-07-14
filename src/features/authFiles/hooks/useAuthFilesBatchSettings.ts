import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { mapWithConcurrency } from '@/utils/concurrency';
import { formatFileSize } from '@/utils/format';
import type { AuthFileFieldsPatch } from '@/services/api/authFiles';
import {
  applyCodexAuthFileWebsockets,
  isRuntimeOnlyAuthFile,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
} from '@/features/authFiles/constants';
import {
  parseHeadersText,
  type AuthFileHeaders,
  type AuthFileHeadersErrorKey,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';

export type AuthFilesBatchSettingsWebsocketsValue = '' | 'true' | 'false';

export type AuthFilesBatchSettingsField =
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'headersText'
  | 'disableCooling'
  | 'note'
  | 'websockets';

export type AuthFilesBatchSettingsState = {
  open: boolean;
  names: string[];
  saving: boolean;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  headersText: string;
  headersError: string | null;
  disableCooling: string;
  note: string;
  websockets: AuthFilesBatchSettingsWebsocketsValue;
};

export type UseAuthFilesBatchSettingsOptions = {
  files: AuthFileItem[];
  disableControls: boolean;
  loadFiles: () => Promise<void>;
  deselectAll: () => void;
};

export type UseAuthFilesBatchSettingsResult = {
  batchSettings: AuthFilesBatchSettingsState;
  batchSettingsDirty: boolean;
  openBatchSettings: (names: string[]) => void;
  closeBatchSettings: () => void;
  handleBatchSettingsChange: (field: AuthFilesBatchSettingsField, value: string) => void;
  saveBatchSettings: () => Promise<void>;
};

type BatchSettingsPatch = {
  prefix?: string;
  proxy_url?: string;
  priority?: number;
  excluded_models?: string[];
  headers?: AuthFileHeaders;
  disable_cooling?: boolean;
  note?: string;
  websockets?: boolean;
};

const BATCH_SETTINGS_CONCURRENCY = 6;

const createEmptyBatchSettingsState = (): AuthFilesBatchSettingsState => ({
  open: false,
  names: [],
  saving: false,
  prefix: '',
  proxyUrl: '',
  priority: '',
  excludedModelsText: '',
  headersText: '',
  headersError: null,
  disableCooling: '',
  note: '',
  websockets: '',
});

const isCodexAuthFile = (file: AuthFileItem): boolean => {
  const normalizedType = String(file.type ?? '')
    .trim()
    .toLowerCase();
  const normalizedProvider = String(file.provider ?? '')
    .trim()
    .toLowerCase();
  return normalizedType === 'codex' || normalizedProvider === 'codex';
};

const resolveTargetFiles = (names: string[], files: AuthFileItem[]): AuthFileItem[] => {
  const fileMap = new Map(files.map((file) => [file.name, file]));
  const seen = new Set<string>();
  const targets: AuthFileItem[] = [];

  names.forEach((name) => {
    const normalized = String(name ?? '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const file = fileMap.get(normalized);
    if (!file || isRuntimeOnlyAuthFile(file)) return;
    targets.push(file);
  });

  return targets;
};

const hasPatchFields = (patch: BatchSettingsPatch): boolean => Object.keys(patch).length > 0;

const requiresFullFileUpdate = (patch: BatchSettingsPatch): boolean =>
  patch.excluded_models !== undefined ||
  patch.headers !== undefined ||
  patch.disable_cooling !== undefined ||
  patch.websockets !== undefined ||
  patch.priority === 0;

const buildDirectFieldsPatch = (patch: BatchSettingsPatch): AuthFileFieldsPatch => ({
  ...(patch.prefix !== undefined ? { prefix: patch.prefix } : {}),
  ...(patch.proxy_url !== undefined ? { proxy_url: patch.proxy_url } : {}),
  ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
  ...(patch.note !== undefined ? { note: patch.note } : {}),
});

const buildBatchSettingsPatch = (
  state: AuthFilesBatchSettingsState
): { patch: BatchSettingsPatch; errorKey: AuthFileHeadersErrorKey | null } => {
  const patch: BatchSettingsPatch = {};

  if (state.prefix.trim()) {
    patch.prefix = state.prefix;
  }
  if (state.proxyUrl.trim()) {
    patch.proxy_url = state.proxyUrl;
  }

  if (state.priority.trim()) {
    const parsedPriority = parsePriorityValue(state.priority);
    if (parsedPriority !== undefined) {
      patch.priority = parsedPriority;
    }
  }

  if (state.excludedModelsText.trim()) {
    const excludedModels = parseExcludedModelsText(state.excludedModelsText);
    if (excludedModels.length > 0) {
      patch.excluded_models = excludedModels;
    }
  }

  if (state.headersText.trim()) {
    const { value: parsedHeaders, errorKey } = parseHeadersText(state.headersText);
    if (errorKey) {
      return { patch, errorKey };
    }
    if (parsedHeaders) {
      patch.headers = parsedHeaders;
    }
  }

  if (state.disableCooling.trim()) {
    const parsedDisableCooling = parseDisableCoolingValue(state.disableCooling);
    if (parsedDisableCooling !== undefined) {
      patch.disable_cooling = parsedDisableCooling;
    }
  }

  if (state.note.trim()) {
    patch.note = state.note;
  }

  if (state.websockets !== '') {
    patch.websockets = state.websockets === 'true';
  }

  return { patch, errorKey: null };
};

const applyBatchSettingsPatch = (
  json: Record<string, unknown>,
  patch: BatchSettingsPatch,
  isCodexFile: boolean
): { next: Record<string, unknown>; applied: boolean } => {
  let next: Record<string, unknown> = { ...json };
  let applied = false;

  if (patch.prefix !== undefined) {
    next.prefix = patch.prefix;
    applied = true;
  }
  if (patch.proxy_url !== undefined) {
    next.proxy_url = patch.proxy_url;
    applied = true;
  }
  if (patch.priority !== undefined) {
    next.priority = patch.priority;
    applied = true;
  }
  if (patch.excluded_models !== undefined) {
    next.excluded_models = patch.excluded_models;
    applied = true;
  }
  if (patch.headers !== undefined) {
    next.headers = patch.headers;
    applied = true;
  }
  if (patch.disable_cooling !== undefined) {
    next.disable_cooling = patch.disable_cooling;
    applied = true;
  }
  if (patch.note !== undefined) {
    next.note = patch.note;
    applied = true;
  }
  if (patch.websockets !== undefined && isCodexFile) {
    next = applyCodexAuthFileWebsockets(next, patch.websockets);
    applied = true;
  }

  return { next, applied };
};

export function useAuthFilesBatchSettings(
  options: UseAuthFilesBatchSettingsOptions
): UseAuthFilesBatchSettingsResult {
  const { files, disableControls, loadFiles, deselectAll } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [batchSettings, setBatchSettings] = useState<AuthFilesBatchSettingsState>(
    createEmptyBatchSettingsState
  );

  const batchSettingsDirty = useMemo(
    () =>
      Boolean(
        batchSettings.prefix.trim() ||
        batchSettings.proxyUrl.trim() ||
        batchSettings.priority.trim() ||
        batchSettings.excludedModelsText.trim() ||
        batchSettings.headersText.trim() ||
        batchSettings.disableCooling.trim() ||
        batchSettings.note.trim() ||
        batchSettings.websockets
      ),
    [batchSettings]
  );

  const closeBatchSettings = () => {
    setBatchSettings((prev) => (prev.saving ? prev : createEmptyBatchSettingsState()));
  };

  const openBatchSettings = (names: string[]) => {
    if (disableControls) return;
    const targets = resolveTargetFiles(names, files);
    if (targets.length === 0) {
      showNotification(t('auth_files.batch_settings_no_targets'), 'warning');
      return;
    }
    setBatchSettings({
      ...createEmptyBatchSettingsState(),
      open: true,
      names: targets.map((file) => file.name),
    });
  };

  const handleBatchSettingsChange = (field: AuthFilesBatchSettingsField, value: string) => {
    setBatchSettings((prev) => {
      if (field === 'headersText') {
        const headersText = String(value);
        const { errorKey } = parseHeadersText(headersText);
        return {
          ...prev,
          headersText,
          headersError: errorKey ? t(errorKey) : null,
        };
      }
      return { ...prev, [field]: String(value) };
    });
  };

  const saveBatchSettings = async () => {
    if (disableControls || batchSettings.saving) return;

    const targets = resolveTargetFiles(batchSettings.names, files);
    if (targets.length === 0) {
      showNotification(t('auth_files.batch_settings_no_targets'), 'warning');
      return;
    }

    const { patch, errorKey } = buildBatchSettingsPatch(batchSettings);
    if (errorKey) {
      showNotification(t(errorKey), 'error');
      return;
    }
    if (!hasPatchFields(patch)) {
      showNotification(t('auth_files.batch_settings_no_fields'), 'warning');
      return;
    }

    setBatchSettings((prev) => ({ ...prev, saving: true }));

    const fullFileUpdate = requiresFullFileUpdate(patch);
    const directFieldsPatch = buildDirectFieldsPatch(patch);
    const results = await mapWithConcurrency(targets, BATCH_SETTINGS_CONCURRENCY, async (file) => {
      if (!fullFileUpdate) {
        await authFilesApi.patchFields(file.name, directFieldsPatch);
        return 'success' as const;
      }

      const json = await authFilesApi.downloadJsonObject(file.name);
      const { next, applied } = applyBatchSettingsPatch(json, patch, isCodexAuthFile(file));
      if (!applied) {
        return 'skipped' as const;
      }

      const payload = JSON.stringify(next);
      if (new Blob([payload]).size > MAX_AUTH_FILE_SIZE) {
        throw new Error(
          t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) })
        );
      }

      await authFilesApi.saveText(file.name, payload);
      return 'success' as const;
    });

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    results.forEach((result) => {
      if (result.status === 'rejected') {
        failedCount += 1;
      } else if (result.value === 'skipped') {
        skippedCount += 1;
      } else {
        successCount += 1;
      }
    });

    if (successCount > 0) {
      try {
        await loadFiles();
      } catch {
        // The files were already saved; a later page refresh can recover stale list metadata.
      }
      deselectAll();
      setBatchSettings(createEmptyBatchSettingsState());
    } else {
      setBatchSettings((prev) => ({ ...prev, saving: false }));
    }

    if (successCount > 0 && failedCount === 0) {
      showNotification(t('auth_files.batch_settings_success', { count: successCount }), 'success');
      return;
    }
    if (successCount > 0 && failedCount > 0) {
      showNotification(
        t('auth_files.batch_settings_partial', { success: successCount, failed: failedCount }),
        'warning'
      );
      return;
    }
    if (skippedCount > 0 && failedCount === 0) {
      showNotification(t('auth_files.batch_settings_no_applicable_files'), 'warning');
      return;
    }
    showNotification(t('auth_files.batch_settings_failed', { failed: failedCount }), 'error');
  };

  return {
    batchSettings,
    batchSettingsDirty,
    openBatchSettings,
    closeBatchSettings,
    handleBatchSettingsChange,
    saveBatchSettings,
  };
}
