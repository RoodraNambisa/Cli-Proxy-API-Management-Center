import type { ChatGptWebImportConfig } from '@/types';

export type ChatGptWebImportDraft = {
  workers: string;
  validateModelsAfterUpload: boolean;
  refreshAccountInfoAfterUpload: boolean;
};

export const readChatGptWebImportConfig = (
  draft: ChatGptWebImportDraft
): { config: ChatGptWebImportConfig | null; errorKey: string | null } => {
  const workersText = draft.workers.trim();
  const workers = Number(workersText);
  if (!workersText || !Number.isInteger(workers) || workers < 1 || workers > 32) {
    return { config: null, errorKey: 'chatgpt_web.import.validation_workers' };
  }
  return {
    config: {
      workers,
      'validate-models-after-upload': draft.validateModelsAfterUpload,
      'refresh-account-info-after-upload': draft.refreshAccountInfoAfterUpload,
    },
    errorKey: null,
  };
};
