import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  ChatGptWebImportPanel,
  type ChatGptWebImportPanelHandle,
} from '@/features/chatgptWeb/components/ChatGptWebImportPanel';
import { readChatGptWebImportConfig } from '@/features/chatgptWeb/chatGptWebImportConfig';
import { ChatGptWebMutationTaskPanel } from '@/features/chatgptWeb/components/ChatGptWebMutationTaskPanel';
import { apiClient } from '@/services/api/client';
import { chatGptWebApi } from '@/services/api/chatgptWeb';
import { useNotificationStore } from '@/stores';
import type { ChatGptWebImportSnapshot, ChatGptWebMutationTask } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) => {
        if (key === 'chatgpt_web.import.background_state_summary') {
          return `${values?.kind}: ${values?.state}`;
        }
        return key;
      },
    }),
  };
});

const createSnapshot = (workers = 4): ChatGptWebImportSnapshot => ({
  config: {
    workers,
    'validate-models-after-upload': false,
    'refresh-account-info-after-upload': false,
  },
  runtime: {
    queued_entries: 3,
    running_entries: 2,
    active_workers: 2,
    worker_limit: workers,
  },
});

describe('ChatGPT Web fast import settings', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('config-management:chatgpt-web-import-expanded', 'true');
    vi.restoreAllMocks();
    useNotificationStore.setState({ showNotification: vi.fn() });
  });

  test('uses the dedicated import configuration endpoints', async () => {
    const snapshot = createSnapshot();
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(snapshot);
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({});
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({});

    await chatGptWebApi.getImport();
    await chatGptWebApi.putImport(snapshot.config);
    await chatGptWebApi.patchImport({ workers: 8 });

    expect(get).toHaveBeenCalledWith('/chatgpt-web/import');
    expect(put).toHaveBeenCalledWith('/chatgpt-web/import', snapshot.config);
    expect(patch).toHaveBeenCalledWith('/chatgpt-web/import', { workers: 8 });
  });

  test('validates the shared worker range', () => {
    expect(
      readChatGptWebImportConfig({
        workers: '0',
        validateModelsAfterUpload: false,
        refreshAccountInfoAfterUpload: false,
      }).config
    ).toBeNull();
    expect(
      readChatGptWebImportConfig({
        workers: '32',
        validateModelsAfterUpload: true,
        refreshAccountInfoAfterUpload: true,
      }).config
    ).toEqual({
      workers: 32,
      'validate-models-after-upload': true,
      'refresh-account-info-after-upload': true,
    });
  });

  test('loads runtime counters and saves only changed fields', async () => {
    const panelRef = createRef<ChatGptWebImportPanelHandle>();
    const getImport = vi
      .spyOn(chatGptWebApi, 'getImport')
      .mockResolvedValueOnce(createSnapshot(4))
      .mockResolvedValueOnce(createSnapshot(8));
    const patchImport = vi.spyOn(chatGptWebApi, 'patchImport').mockResolvedValue({});

    render(<ChatGptWebImportPanel ref={panelRef} />);

    const workers = await screen.findByRole('spinbutton');
    expect(await screen.findByText('3')).toBeTruthy();
    fireEvent.change(workers, { target: { value: '8' } });

    await act(async () => {
      expect(await panelRef.current?.save()).toBe(true);
    });

    expect(getImport).toHaveBeenCalledTimes(2);
    expect(patchImport).toHaveBeenCalledWith({ workers: 8 });
    await waitFor(() => expect((workers as HTMLInputElement).value).toBe('8'));
  });

  test('shows queued background intentions on import results', () => {
    const task: ChatGptWebMutationTask = {
      id: 'task',
      kind: 'import',
      state: 'completed',
      created_at: '2026-08-06T00:00:00Z',
      total: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      canceled: 0,
      results: [
        {
          file: 'web.json',
          status: 'created',
          session_refresh_state: 'queued',
          model_validation_state: 'reused',
          account_info_refresh_state: 'skipped',
        },
      ],
    };

    render(
      <ChatGptWebMutationTaskPanel
        task={task}
        kind="import"
        onRefresh={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('chatgpt_web.import.background_task.session: queued')).toBeTruthy();
    expect(screen.getByText('chatgpt_web.import.background_task.models: reused')).toBeTruthy();
    expect(
      screen.getByText('chatgpt_web.import.background_task.account_info: skipped')
    ).toBeTruthy();
  });
});
