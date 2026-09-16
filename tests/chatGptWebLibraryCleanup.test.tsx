import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatGptWebLibraryCleanup } from '@/components/config/ChatGptWebLibraryCleanup';
import {
  chatGptWebLibraryApi,
  isLibraryCleanupActive,
  parseLibraryConcurrency,
  readLibraryCleanupResponse,
  type LibraryCleanupTask,
} from '@/services/api/chatgptWebLibrary';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import en from '@/i18n/locales/en.json';
import cn from '@/i18n/locales/zh-CN.json';
import tw from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

const translate = vi.hoisted(() => (key: string) => key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }));

const running: LibraryCleanupTask = {
  id: 'job',
  state: 'running',
  started_at: '',
  concurrency: 4,
  total_credentials: 1,
  processed_credentials: 0,
  deleted_files: 0,
  page: 1,
  results: [
    {
      name: 'web.json',
      stage: 'waiting',
      scanned: 0,
      total_files: 0,
      deleted_files: 0,
      failed_files: 0,
      skipped_files: 0,
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(authFilesApi, 'listPaged').mockResolvedValue({ files: [{name:'web.json',provider:'chatgpt-web'}, {name:'codex.json',provider:'codex'}, {name:'grok.json',provider:'xai'}] });
  vi.spyOn(chatGptWebLibraryApi, 'get').mockResolvedValue({ task: null });
  vi.spyOn(chatGptWebLibraryApi, 'start').mockResolvedValue({ task: running });
  vi.spyOn(chatGptWebLibraryApi, 'cancel').mockResolvedValue({
    task: { ...running, state: 'canceling' },
  });
});

describe('library cleanup', () => {
  test('validates integer concurrency without coercing decimals or empty values', () => {
    for (const input of ['', '0', '-1', '33', '1.2', '1e1', 'Infinity'])
      expect(parseLibraryConcurrency(input)).toBeNull();
    for (const input of ['1', '4', '32'])
      expect(parseLibraryConcurrency(input)).toBe(Number(input));
    expect(isLibraryCleanupActive(running)).toBe(true);
    expect(isLibraryCleanupActive({ ...running, state: 'canceling' })).toBe(true);
    expect(() => readLibraryCleanupResponse({ task: { ...running, state: 'unknown' } })).toThrow();
    expect(() => readLibraryCleanupResponse({})).toThrow();
    expect(readLibraryCleanupResponse({ task: running }).task).toEqual(running);
  });

  test('requires explicit confirmation and sends only selected credentials', async () => {
    render(<ChatGptWebLibraryCleanup />);
    fireEvent.click(screen.getByText('library_cleanup.title'));
    await waitFor(() => expect(chatGptWebLibraryApi.get).toHaveBeenCalled());
    const start = await screen.findByRole('button', { name: 'library_cleanup.start' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'web.json' }));
    expect(screen.queryByRole('checkbox', {name: 'codex.json'})).toBeNull();
    expect(screen.queryByRole('checkbox', {name: 'grok.json'})).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'library_cleanup.confirm' }));
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(chatGptWebLibraryApi.start).toHaveBeenCalledTimes(1));
    expect(authFilesApi.listPaged).toHaveBeenCalledWith({ provider: 'chatgpt-web', page: 1, pageSize: 25 }, expect.any(Object), expect.any(AbortSignal));
    expect(chatGptWebLibraryApi.start).toHaveBeenCalledWith(
      expect.any(Object),
      { names: ['web.json'] },
      4
    );
  });

  test('reloads an active background task and prevents another start', async () => {
    vi.mocked(chatGptWebLibraryApi.get).mockResolvedValue({ task: running });
    render(<ChatGptWebLibraryCleanup />);
    fireEvent.click(screen.getByText('library_cleanup.title'));
    const cancel = await screen.findByRole('button', { name: 'library_cleanup.cancel' });
    expect(screen.queryByRole('button', { name: 'library_cleanup.start' })).toBeNull();
    expect(screen.getByText('library_cleanup.waiting')).toBeTruthy();
    fireEvent.click(cancel);
    await waitFor(() =>
      expect(chatGptWebLibraryApi.cancel).toHaveBeenCalledWith(expect.any(Object), 'job')
    );
    expect(chatGptWebLibraryApi.start).not.toHaveBeenCalled();
  });

  test('changing the credential selection requires a new confirmation', async () => {
    render(<ChatGptWebLibraryCleanup />);
    fireEvent.click(screen.getByText('library_cleanup.title'));
    const credential = await screen.findByRole('checkbox', { name: 'web.json' });
    fireEvent.click(credential);
    fireEvent.click(screen.getByRole('checkbox', { name: 'library_cleanup.confirm' }));
    fireEvent.click(credential);
    expect((screen.getByRole('checkbox', { name: 'library_cleanup.confirm' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: 'library_cleanup.start' }) as HTMLButtonElement).disabled).toBe(true);
    expect(chatGptWebLibraryApi.start).not.toHaveBeenCalled();
  });

  test('does not turn an empty selection into all accounts', async () => {
    render(<ChatGptWebLibraryCleanup />);
    fireEvent.click(screen.getByText('library_cleanup.title'));
    await waitFor(() => expect(chatGptWebLibraryApi.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('checkbox', { name: 'library_cleanup.confirm' }));
    expect(
      (screen.getByRole('button', { name: 'library_cleanup.start' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'library_cleanup.all' }));
    expect((screen.getByRole('checkbox', { name: 'library_cleanup.confirm' }) as HTMLInputElement).checked).toBe(false);
  });

  test('transport retains confirmation and the captured connection', async () => {
    vi.mocked(chatGptWebLibraryApi.start).mockRestore();
    const post = vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ task: running });
    const connection = { apiBase: '/old-server', managementKey: 'test-key', timeout: 1000 };
    await chatGptWebLibraryApi.start(connection, { all: true }, 2);
    expect(post).toHaveBeenCalledWith(connection, '/chatgpt-web/library-cleanup', {
      all: true,
      concurrency: 2,
      confirm_delete_all_files: true,
    });
  });

  test('all four locales cover the same controls and progress states', () => {
    const keys = Object.keys(en.library_cleanup).sort();
    for (const locale of [cn, tw, ru])
      expect(Object.keys(locale.library_cleanup).sort()).toEqual(keys);
  });
});
