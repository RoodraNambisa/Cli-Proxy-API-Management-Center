import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { normalizeProviderKey } from '@/features/authFiles/constants';
import { captureAuthFileSnapshotOrder } from '@/features/authFiles/snapshotOrder';

type ModelsError = 'unsupported' | null;

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsLoadedAtMs: number;
  modelsSnapshotOrder: number;
  modelsFile: AuthFileItem | null;
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useAuthFilesModels(
  files: AuthFileItem[] = [],
  connectionGenerationKey = ''
): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoadedAtMs, setModelsLoadedAtMs] = useState(0);
  const [modelsSnapshotOrder, setModelsSnapshotOrder] = useState(0);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const requestSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const connectionGenerationKeyRef = useRef(connectionGenerationKey);
  connectionGenerationKeyRef.current = connectionGenerationKey;
  const modelsFile = files.find((file) => file.name === modelsFileName) ?? null;

  useEffect(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    requestSequenceRef.current += 1;
    setModelsModalOpen(false);
    setModelsLoading(false);
    setModelsList([]);
    setModelsLoadedAtMs(0);
    setModelsSnapshotOrder(0);
    setModelsFileName('');
    setModelsFileType('');
    setModelsError(null);
    return () => {
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, [connectionGenerationKey]);

  const closeModelsModal = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    requestSequenceRef.current += 1;
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      requestAbortRef.current?.abort();
      const abortController = new AbortController();
      requestAbortRef.current = abortController;
      const requestSequence = requestSequenceRef.current + 1;
      const requestConnectionGenerationKey = connectionGenerationKeyRef.current;
      const requestSnapshotOrder = captureAuthFileSnapshotOrder();
      requestSequenceRef.current = requestSequence;
      setModelsFileName(item.name);
      setModelsFileType(normalizeProviderKey(String(item.provider ?? item.type ?? '')));
      setModelsList([]);
      setModelsLoadedAtMs(0);
      setModelsSnapshotOrder(0);
      setModelsError(null);
      setModelsModalOpen(true);

      setModelsLoading(true);
      const connection = apiClient.captureConnection();
      try {
        const models = await authFilesApi.getModelsForAuthFile(
          item.name,
          connection,
          abortController.signal
        );
        if (
          requestSequenceRef.current !== requestSequence ||
          connectionGenerationKeyRef.current !== requestConnectionGenerationKey
        ) {
          return;
        }
        setModelsList(models);
        setModelsSnapshotOrder(requestSnapshotOrder);
        setModelsLoadedAtMs(Date.now());
      } catch (err) {
        if (abortController.signal.aborted) return;
        if (
          requestSequenceRef.current !== requestSequence ||
          connectionGenerationKeyRef.current !== requestConnectionGenerationKey
        ) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          setModelsError('unsupported');
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        if (requestAbortRef.current === abortController) {
          requestAbortRef.current = null;
        }
        if (
          requestSequenceRef.current === requestSequence &&
          connectionGenerationKeyRef.current === requestConnectionGenerationKey
        ) {
          setModelsLoading(false);
        }
      }
    },
    [showNotification, t]
  );

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsLoadedAtMs,
    modelsSnapshotOrder,
    modelsFile,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  };
}
