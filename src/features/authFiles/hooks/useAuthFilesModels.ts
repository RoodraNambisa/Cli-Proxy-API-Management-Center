import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { normalizeProviderKey } from '@/features/authFiles/constants';

type ModelsError = 'unsupported' | null;

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsLoadedAtMs: number;
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useAuthFilesModels(): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoadedAtMs, setModelsLoadedAtMs] = useState(0);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const requestSequenceRef = useRef(0);

  const closeModelsModal = useCallback(() => {
    requestSequenceRef.current += 1;
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;
      setModelsFileName(item.name);
      setModelsFileType(normalizeProviderKey(String(item.provider ?? item.type ?? '')));
      setModelsList([]);
      setModelsLoadedAtMs(0);
      setModelsError(null);
      setModelsModalOpen(true);

      setModelsLoading(true);
      try {
        const models = await authFilesApi.getModelsForAuthFile(item.name);
        if (requestSequenceRef.current !== requestSequence) return;
        setModelsList(models);
        setModelsLoadedAtMs(Date.now());
      } catch (err) {
        if (requestSequenceRef.current !== requestSequence) return;
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
        if (requestSequenceRef.current === requestSequence) {
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
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  };
}
