import type {
  ChatGptWebAccountInfoConfig,
  ChatGptWebAccountInfoConfigPatch,
  ChatGptWebAccountInfoDiagnosticsSnapshot,
  ChatGptWebAccountInfoRefreshTask,
  ChatGptWebAccountInfoSnapshot,
  ChatGptWebAutoDeleteDeadStats,
  ChatGptWebLoginTask,
  ChatGptWebLoginProxyConfig,
  ChatGptWebLoginProxyConfigPatch,
  ChatGptWebMutationTask,
  ChatGptWebReloginResponse,
  ChatGptWebSentinelConfig,
  ChatGptWebSentinelConfigPatch,
  ChatGptWebSentinelSnapshot,
  ChatGptWebUsageConfig,
  ChatGptWebUsageSnapshot,
} from '@/types';
import { isChatGptWebAccountInfoRefreshTaskTerminal } from '@/types';
import { apiClient, type ApiClientConnectionSnapshot } from './client';
import { AUTH_FILE_UPLOAD_TIMEOUT_MS } from '@/utils/constants';

const CHATGPT_WEB_RELOGIN_TIMEOUT_MS = 2 * 60 * 1000;
const accountInfoTaskConnections = new Map<string, ApiClientConnectionSnapshot>();

export const chatGptWebApi = {
  getAutoDeleteDeadStats(signal?: AbortSignal): Promise<ChatGptWebAutoDeleteDeadStats> {
    return signal
      ? apiClient.get('/chatgpt-web/auto-delete-dead/stats', { signal })
      : apiClient.get('/chatgpt-web/auto-delete-dead/stats');
  },

  startLoginTask(file: File, targetName?: string): Promise<ChatGptWebLoginTask> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (targetName?.trim()) formData.append('name', targetName.trim());
    return apiClient.postForm('/chatgpt-web/login-tasks', formData);
  },

  startLoginTaskText(accountText: string, targetName?: string): Promise<ChatGptWebLoginTask> {
    const name = targetName?.trim();
    return apiClient.post('/chatgpt-web/login-tasks', accountText, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      ...(name ? { params: { name } } : {}),
    });
  },

  getLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.get(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
  },

  cancelLoginTask(id: string): Promise<ChatGptWebLoginTask> {
    return apiClient.delete(`/chatgpt-web/login-tasks/${encodeURIComponent(id)}`);
  },

  getLoginProxy(): Promise<ChatGptWebLoginProxyConfig> {
    return apiClient.get('/chatgpt-web/login-proxy');
  },

  putLoginProxy(config: ChatGptWebLoginProxyConfig): Promise<unknown> {
    return apiClient.put('/chatgpt-web/login-proxy', config);
  },

  patchLoginProxy(config: ChatGptWebLoginProxyConfigPatch): Promise<unknown> {
    return apiClient.patch('/chatgpt-web/login-proxy', config);
  },

  startImportTask(files: File[], targetNames?: string[]): Promise<ChatGptWebMutationTask> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));
    if (targetNames) {
      targetNames.forEach((name) => formData.append('names', name.trim()));
    }
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

  getAccountInfo(
    connection?: ApiClientConnectionSnapshot,
    signal?: AbortSignal
  ): Promise<ChatGptWebAccountInfoSnapshot> {
    if (connection) {
      return signal
        ? apiClient.getAtConnection(connection, '/chatgpt-web/account-info', { signal })
        : apiClient.getAtConnection(connection, '/chatgpt-web/account-info');
    }
    return signal
      ? apiClient.get('/chatgpt-web/account-info', { signal })
      : apiClient.get('/chatgpt-web/account-info');
  },

  putAccountInfo(config: ChatGptWebAccountInfoConfig): Promise<unknown> {
    return apiClient.put('/chatgpt-web/account-info', config);
  },

  patchAccountInfo(
    config: ChatGptWebAccountInfoConfigPatch,
    connection?: ApiClientConnectionSnapshot
  ): Promise<unknown> {
    return connection
      ? apiClient.patchAtConnection(connection, '/chatgpt-web/account-info', config)
      : apiClient.patch('/chatgpt-web/account-info', config);
  },

  getAccountInfoDiagnostics(
    connection?: ApiClientConnectionSnapshot,
    signal?: AbortSignal
  ): Promise<ChatGptWebAccountInfoDiagnosticsSnapshot> {
    const path = '/chatgpt-web/account-info/diagnostics';
    if (connection) {
      return signal
        ? apiClient.getAtConnection(connection, path, { signal })
        : apiClient.getAtConnection(connection, path);
    }
    return signal ? apiClient.get(path, { signal }) : apiClient.get(path);
  },

  clearAccountInfoDiagnostics(
    connection?: ApiClientConnectionSnapshot
  ): Promise<ChatGptWebAccountInfoDiagnosticsSnapshot> {
    const path = '/chatgpt-web/account-info/diagnostics';
    return connection ? apiClient.deleteAtConnection(connection, path) : apiClient.delete(path);
  },

  startAccountInfoRefreshTask(
    names: string[],
    force: boolean,
    connection: ApiClientConnectionSnapshot = apiClient.captureConnection()
  ): Promise<ChatGptWebAccountInfoRefreshTask> {
    return apiClient
      .postAtConnection<ChatGptWebAccountInfoRefreshTask>(
        connection,
        '/chatgpt-web/account-info/refresh-tasks',
        { names, force }
      )
      .then((task) => {
        if (!isChatGptWebAccountInfoRefreshTaskTerminal(task.state)) {
          accountInfoTaskConnections.set(task.id, connection);
        }
        return task;
      });
  },

  async getAccountInfoRefreshTask(
    id: string,
    signal?: AbortSignal
  ): Promise<ChatGptWebAccountInfoRefreshTask> {
    const path = `/chatgpt-web/account-info/refresh-tasks/${encodeURIComponent(id)}`;
    const connection = accountInfoTaskConnections.get(id);
    try {
      const task = connection
        ? signal
          ? await apiClient.getAtConnection<ChatGptWebAccountInfoRefreshTask>(connection, path, {
              signal,
            })
          : await apiClient.getAtConnection<ChatGptWebAccountInfoRefreshTask>(connection, path)
        : signal
          ? await apiClient.get<ChatGptWebAccountInfoRefreshTask>(path, { signal })
          : await apiClient.get<ChatGptWebAccountInfoRefreshTask>(path);
      if (isChatGptWebAccountInfoRefreshTaskTerminal(task.state)) {
        accountInfoTaskConnections.delete(id);
      }
      return task;
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        (error as { status?: unknown }).status === 404
      ) {
        accountInfoTaskConnections.delete(id);
      }
      throw error;
    }
  },

  async cancelAccountInfoRefreshTask(id: string): Promise<ChatGptWebAccountInfoRefreshTask> {
    const path = `/chatgpt-web/account-info/refresh-tasks/${encodeURIComponent(id)}`;
    const connection = accountInfoTaskConnections.get(id);
    try {
      return connection
        ? await apiClient.deleteAtConnection<ChatGptWebAccountInfoRefreshTask>(connection, path)
        : await apiClient.delete<ChatGptWebAccountInfoRefreshTask>(path);
    } finally {
      accountInfoTaskConnections.delete(id);
    }
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

  getUsageCache(): Promise<ChatGptWebUsageSnapshot> {
    return apiClient.get('/chatgpt-web/usage-cache');
  },

  putUsageCache(config: ChatGptWebUsageConfig): Promise<unknown> {
    return apiClient.put('/chatgpt-web/usage-cache', config);
  },

  patchUsageCache(config: ChatGptWebUsageConfig): Promise<unknown> {
    return apiClient.patch('/chatgpt-web/usage-cache', config);
  },
};
