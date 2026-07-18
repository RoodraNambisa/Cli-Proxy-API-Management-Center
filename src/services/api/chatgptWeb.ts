import type { ChatGptWebLoginTask, ChatGptWebReloginResponse } from '@/types';
import { apiClient } from './client';

const CHATGPT_WEB_RELOGIN_TIMEOUT_MS = 2 * 60 * 1000;

export const chatGptWebApi = {
  startLoginTask(file: File): Promise<ChatGptWebLoginTask> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm('/chatgpt-web/login-tasks', formData);
  },

  getLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.get(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
  },

  cancelLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.delete(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
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
};
