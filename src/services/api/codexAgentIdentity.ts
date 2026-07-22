import type { CodexAgentIdentityTask, CodexAuthMode } from '@/types';
import { apiClient } from './client';

const CODEX_AGENT_IDENTITY_TASKS_ENDPOINT = '/codex/agent-identity/conversion-tasks';

const normalizeValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

export const codexAgentIdentityApi = {
  startNamesTask(names: string[], targetMode: CodexAuthMode): Promise<CodexAgentIdentityTask> {
    return apiClient.post(CODEX_AGENT_IDENTITY_TASKS_ENDPOINT, {
      names: normalizeValues(names),
      target_mode: targetMode,
    });
  },

  startAccessTokensTask(accessTokens: string[]): Promise<CodexAgentIdentityTask> {
    return apiClient.post(CODEX_AGENT_IDENTITY_TASKS_ENDPOINT, {
      access_tokens: normalizeValues(accessTokens),
      target_mode: 'agentIdentity',
    });
  },

  getTask(id: string): Promise<CodexAgentIdentityTask> {
    return apiClient.get(`${CODEX_AGENT_IDENTITY_TASKS_ENDPOINT}/${encodeURIComponent(id)}`);
  },

  cancelTask(id: string): Promise<CodexAgentIdentityTask> {
    return apiClient.delete(`${CODEX_AGENT_IDENTITY_TASKS_ENDPOINT}/${encodeURIComponent(id)}`);
  },
};
