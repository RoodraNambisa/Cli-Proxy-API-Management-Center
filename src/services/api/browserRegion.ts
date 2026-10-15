import type {
  BrowserRegionConfig,
  BrowserRegionPreview,
} from '@/features/chatgptWeb/browserRegion';
import { apiClient, type ApiClientConnectionSnapshot } from './client';

const path = '/chatgpt-web/browser-region';
export const browserRegionApi = {
  get: (connection: ApiClientConnectionSnapshot, signal?: AbortSignal) =>
    apiClient.getAtConnection<BrowserRegionConfig>(connection, path, { signal }),
  save: (
    connection: ApiClientConnectionSnapshot,
    config: Partial<BrowserRegionConfig>,
    signal?: AbortSignal
  ) => apiClient.patchAtConnection(connection, path, config, { signal }),
  preview: (connection: ApiClientConnectionSnapshot, index: string, signal?: AbortSignal) =>
    apiClient.getAtConnection<BrowserRegionPreview>(connection, `${path}/preview`, {
      signal,
      params: { auth_index: index },
    }),
  refresh: (connection: ApiClientConnectionSnapshot, index: string, signal?: AbortSignal) =>
    apiClient.postAtConnection<BrowserRegionPreview>(
      connection,
      `${path}/refresh`,
      { auth_index: index },
      { signal }
    ),
};
