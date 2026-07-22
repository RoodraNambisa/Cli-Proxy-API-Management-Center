import type {
  ChatGptWebLoginTask,
  ChatGptWebMutationTask,
  ChatGptWebReloginResponse,
  ChatGptWebSentinelConfig,
  ChatGptWebSentinelConfigPatch,
  ChatGptWebSentinelSnapshot,
} from '@/types';
import { apiClient } from './client';
import { AUTH_FILE_UPLOAD_TIMEOUT_MS } from '@/utils/constants';

const CHATGPT_WEB_RELOGIN_TIMEOUT_MS = 2 * 60 * 1000;

export const chatGptWebApi = {
  startLoginTask(file: File): Promise<ChatGptWebLoginTask> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm('/chatgpt-web/login-tasks', formData);
  },

  startLoginTaskText(accountText: string): Promise<ChatGptWebLoginTask> {
    return apiClient.post('/chatgpt-web/login-tasks', accountText, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
    });
  },

  getLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.get(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
  },

  cancelLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.delete(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
  },

  startImportTask(files: File[]): Promise<ChatGptWebMutationTask> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));
    return apiClient.postForm('/chatgpt-web/import-tasks', formData, {
      timeout: AUTH_FILE_UPLOAD_TIMEOUT_MS,
    });
  },

  getImportTask(id: string): Promise<ChatGptWebMutationTask> {
    return apiClient.get(`/chatgpt-web/import-tasks/${encodeURIComponent(id)}`);
  },

  cancelImportTask(id: string): Promise<ChatGptWebMutationTask> {
    return apiClient.delete(`/chatgpt-web/import-tasks/${encodeURIComponent(id)}`);
  },

  startConversionTask(names: string[]): Promise<ChatGptWebMutationTask> {
    return apiClient.post('/chatgpt-web/conversion-tasks', {
      names,
      target_provider: 'chatgpt-web',
      mode: 'copy',
      validate: true,
    });
  },

  getConversionTask(id: string): Promise<ChatGptWebMutationTask> {
    return apiClient.get(`/chatgpt-web/conversion-tasks/${encodeURIComponent(id)}`);
  },

  cancelConversionTask(id: string): Promise<ChatGptWebMutationTask> {
    return apiClient.delete(`/chatgpt-web/conversion-tasks/${encodeURIComponent(id)}`);
  },

  relogin(name: string): Promise<ChatGptWebReloginResponse> {
    return apiClient.post(
      `/chatgpt-web/auth-files/${encodeURIComponent(name)}/relogin`,
      undefined,
      {
        timeout: CHATGPT_WEB_RELOGIN_TIMEOUT_MS,
      }
    );
  },

  getSentinel(): Promise<ChatGptWebSentinelSnapshot> {
    return apiClient.get('/chatgpt-web/sentinel');
  },

  putSentinel(config: ChatGptWebSentinelConfig): Promise<unknown> {
    return apiClient.put('/chatgpt-web/sentinel', config);
  },

  patchSentinel(config: ChatGptWebSentinelConfigPatch): Promise<unknown> {
    return apiClient.patch('/chatgpt-web/sentinel', config);
  },
};
