import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';
import { normalizeModelList, type ModelInfo } from '@/utils/models';

export type ProviderKind =
  | 'codex'
  | 'claude'
  | 'gemini'
  | 'interactions'
  | 'xai'
  | 'vertex'
  | 'openai';
export type CredentialValues = Record<string, unknown> & {
  models?: Record<string, unknown>[] | null;
  priority?: number | null;
};
export type CredentialDetail = {
  keys?: { id: string; name: string; disabled: boolean }[];
  id: string;
  kind: ProviderKind;
  revision: string;
  values: CredentialValues;
  parent?: CredentialValues;
  parent_id?: string;
  is_parent?: boolean;
};
export type ConfigRef = {
  id: string;
  kind: ProviderKind;
  revision: string;
  parent_id?: string;
  parent_name?: string;
};
const path = (id: string) => `/provider-credentials/${encodeURIComponent(id)}`;

export const providerCredentialsApi = {
  get: (id: string, connection = apiClient.captureConnection(), signal?: AbortSignal) =>
    apiClient.getAtConnection<CredentialDetail>(connection, path(id), { signal }),
  save: (
    detail: CredentialDetail,
    values: CredentialValues,
    connection = apiClient.captureConnection(),
    signal?: AbortSignal
  ) =>
    apiClient.patchAtConnection(
      connection,
      path(detail.id),
      { revision: detail.revision, values },
      { signal }
    ),
  create: (
    kind: ProviderKind,
    values: CredentialValues,
    connection = apiClient.captureConnection(),
    signal?: AbortSignal,
    parent?: CredentialDetail
  ) =>
    apiClient.postAtConnection<{ id: string }>(
      connection,
      '/provider-credentials',
      { kind, values, parent_id: parent?.id, revision: parent?.revision },
      { signal }
    ),
  remove: (
    ref: Pick<ConfigRef, 'id' | 'revision'>,
    connection = apiClient.captureConnection(),
    signal?: AbortSignal
  ) =>
    apiClient.deleteAtConnection(connection, path(ref.id), {
      data: { revision: ref.revision },
      signal,
    }),
  async discover(
    id: string | undefined,
    draft: { kind: ProviderKind; values: CredentialValues },
    connection: ApiClientConnectionSnapshot,
    signal: AbortSignal
  ): Promise<ModelInfo[]> {
    const result: ModelInfo[] = [];
    const seen = new Set<string>();
    const cursors = new Set<string>();
    let pageToken = '',
      afterId = '';
    do {
      const response = await apiClient.postAtConnection<{ status_code: number; body: string }>(
        connection,
        id ? `${path(id)}/models` : '/provider-credentials/models',
        { ...draft, page_token: pageToken, after_id: afterId },
        { signal }
      );
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(response.body) as Record<string, unknown>;
      } catch {
        throw new Error(`HTTP ${response.status_code}: ${String(response.body).slice(0, 500)}`);
      }
      if (response.status_code < 200 || response.status_code >= 300) {
        const error = body.error as { message?: string } | string | undefined;
        throw new Error(
          `HTTP ${response.status_code}: ${typeof error === 'string' ? error : (error?.message ?? JSON.stringify(body).slice(0, 500))}`
        );
      }
      for (const model of normalizeModelList(body, { dedupe: true })) {
        const name = ['gemini', 'interactions'].includes(draft.kind)
          ? model.name.replace(/^models\//, '')
          : model.name;
        if (!seen.has(name)) {
          seen.add(name);
          result.push({ ...model, name });
        }
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
      afterId = body.has_more === true && typeof body.last_id === 'string' ? body.last_id : '';
      const cursor = `${pageToken}:${afterId}`;
      if ((pageToken || afterId) && cursors.has(cursor))
        throw new Error('Repeated model pagination cursor');
      cursors.add(cursor);
    } while (pageToken || afterId);
    return result;
  },
};
