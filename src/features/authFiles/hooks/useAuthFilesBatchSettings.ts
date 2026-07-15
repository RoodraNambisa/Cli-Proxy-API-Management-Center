import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileBatchFailure, AuthFileFieldsPatch } from '@/services/api/authFiles';
import {
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

export type AuthFilesBatchSettingsBooleanValue = '' | 'true' | 'false';

export type AuthFilesBatchSettingsField =
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'headersText'
  | 'disableCooling'
  | 'note'
  | 'usingApi'
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
  usingApi: AuthFilesBatchSettingsBooleanValue;
  websockets: AuthFilesBatchSettingsBooleanValue;
  failures: AuthFileBatchFailure[];
};

export type UseAuthFilesBatchSettingsOptions = {
  files: AuthFileItem[];
  disableControls: boolean;
  loadFiles: () => Promise<void>;
  deselectAll: () => void;
  replaceSelection: (names: string[]) => void;
};

export type UseAuthFilesBatchSettingsResult = {
  batchSettings: AuthFilesBatchSettingsState;
  batchSettingsDirty: boolean;
  openBatchSettings: (names: string[]) => void;
  closeBatchSettings: () => void;
  handleBatchSettingsChange: (field: AuthFilesBatchSettingsField, value: string) => void;
  saveBatchSettings: () => Promise<void>;
};

type BatchSettingsPatch = AuthFileFieldsPatch & { headers?: AuthFileHeaders };

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
  usingApi: '',
  websockets: '',
  failures: [],
});

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
    if (state.priority.trim().toLowerCase() === 'null') {
      patch.priority = null;
    } else {
      const parsedPriority = parsePriorityValue(state.priority);
      if (parsedPriority !== undefined) {
        patch.priority = parsedPriority;
      }
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

  if (state.usingApi !== '') {
    patch.using_api = state.usingApi === 'true';
  }

  if (state.websockets !== '') {
    patch.websockets = state.websockets === 'true';
  }

  return { patch, errorKey: null };
};

export function useAuthFilesBatchSettings(
  options: UseAuthFilesBatchSettingsOptions
): UseAuthFilesBatchSettingsResult {
  const { files, disableControls, loadFiles, deselectAll, replaceSelection } = options;
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
        batchSettings.usingApi ||
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
          failures: [],
        };
      }
      return { ...prev, [field]: String(value), failures: [] };
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

    setBatchSettings((prev) => ({ ...prev, saving: true, failures: [] }));

    try {
      const result = await authFilesApi.patchFieldsBatch(
        targets.map((file) => file.name),
        patch
      );
      const failedNames = result.failed.map((failure) => failure.name).filter(Boolean);

      if (result.failed.length === 0) {
        deselectAll();
        setBatchSettings(createEmptyBatchSettingsState());
        void loadFiles().catch(() => {});
        showNotification(
          t('auth_files.batch_settings_success', { count: result.updated }),
          'success'
        );
        return;
      }

      const retainedNames = failedNames.length > 0 ? failedNames : targets.map((file) => file.name);
      replaceSelection(retainedNames);
      setBatchSettings((prev) => ({
        ...prev,
        names: retainedNames,
        saving: false,
        failures: result.failed,
      }));
      if (result.updated > 0) {
        void loadFiles().catch(() => {});
      }

      showNotification(
        result.updated > 0
          ? t('auth_files.batch_settings_partial', {
              success: result.updated,
              failed: result.failed.length,
            })
          : t('auth_files.batch_settings_failed', { failed: result.failed.length }),
        result.updated > 0 ? 'warning' : 'error'
      );
    } catch (err: unknown) {
      setBatchSettings((prev) => ({ ...prev, saving: false }));
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('auth_files.batch_settings_failed', { failed: targets.length })}${message ? `: ${message}` : ''}`,
        'error'
      );
    }
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
