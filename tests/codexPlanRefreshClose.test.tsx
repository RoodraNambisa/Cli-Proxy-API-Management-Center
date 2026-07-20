import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import {
  isCodexPlanRefreshClearBlocked,
  shouldShowCodexPlanRefreshPanel,
  useAuthFilesData,
} from '@/features/authFiles/hooks/useAuthFilesData';
import { CodexPlanRefreshActions } from '@/pages/AuthFilesPage';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { CodexPlanTypeRefreshTask } from '@/types';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const EMPTY_SUMMARY = {
  eligible: 0,
  processed: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  failed: 0,
};

const createTask = (
  overrides: Partial<CodexPlanTypeRefreshTask> = {}
): CodexPlanTypeRefreshTask => ({
  state: 'paused',
  running: false,
  paused: true,
  pauseRequested: false,
  canRetryFailed: false,
  summary: { ...EMPTY_SUMMARY },
  results: [],
  ...overrides,
});

const renderActions = (
  task: CodexPlanTypeRefreshTask,
  overrides: Partial<React.ComponentProps<typeof CodexPlanRefreshActions>> = {}
) => {
  const props: React.ComponentProps<typeof CodexPlanRefreshActions> = {
    task,
    disableControls: false,
    actionLoading: false,
    starting: false,
    loading: false,
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRetryFailed: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  return { props, view: render(<CodexPlanRefreshActions {...props} />) };
};

const loadTaskIntoHook = async (task: CodexPlanTypeRefreshTask) => {
  vi.spyOn(authFilesApi, 'getCodexPlanTypeRefreshStatus').mockResolvedValue(task);
  const hook = renderHook(() =>
    useAuthFilesData({ refreshKeyStats: vi.fn().mockResolvedValue(undefined), active: false })
  );
  await act(async () => hook.result.current.refreshCodexPlanTypeRefreshStatus());
  return hook;
};

describe('Codex plan refresh task closing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useNotificationStore.setState({
      notifications: [],
      confirmation: { isOpen: false, isLoading: false, options: null },
    });
  });

  test('disables close while running or pause is requested, but enables it when paused', () => {
    const running = createTask({ state: 'running', running: true, paused: false });
    const { view } = renderActions(running);
    expect(isCodexPlanRefreshClearBlocked(running)).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'auth_files.codex_plan_refresh_close_task' })
        .hasAttribute('disabled')
    ).toBe(true);

    const pauseRequested = createTask({
      state: 'running',
      running: true,
      paused: false,
      pauseRequested: true,
    });
    view.rerender(
      <CodexPlanRefreshActions
        task={pauseRequested}
        disableControls={false}
        actionLoading={false}
        starting={false}
        loading={false}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onRetryFailed={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(isCodexPlanRefreshClearBlocked(pauseRequested)).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'auth_files.codex_plan_refresh_close_task' })
        .hasAttribute('disabled')
    ).toBe(true);

    const paused = createTask();
    const onResume = vi.fn();
    view.rerender(
      <CodexPlanRefreshActions
        task={paused}
        disableControls={false}
        actionLoading={false}
        starting={false}
        loading={false}
        onPause={vi.fn()}
        onResume={onResume}
        onRetryFailed={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(isCodexPlanRefreshClearBlocked(paused)).toBe(false);
    expect(
      screen
        .getByRole('button', { name: 'auth_files.codex_plan_refresh_close_task' })
        .hasAttribute('disabled')
    ).toBe(false);
    const resume = screen.getByRole('button', { name: 'auth_files.codex_plan_refresh_resume' });
    expect(resume.hasAttribute('disabled')).toBe(false);
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  test('disables resume and close while a paused task action is pending', () => {
    renderActions(createTask(), { actionLoading: true });

    expect(
      screen
        .getByRole('button', { name: 'auth_files.codex_plan_refresh_resume' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'auth_files.codex_plan_refresh_close_task' })
        .hasAttribute('disabled')
    ).toBe(true);
  });

  test('confirms a paused close, sends DELETE, and hides the idle panel', async () => {
    const idle = createTask({ state: 'idle', paused: false });
    const clear = vi.spyOn(authFilesApi, 'clearCodexPlanTypeRefreshStatus').mockResolvedValue(idle);
    const { result } = await loadTaskIntoHook(createTask());

    await act(async () => result.current.clearCodexPlanTypeRefresh());
    expect(clear).not.toHaveBeenCalled();
    const confirmation = useNotificationStore.getState().confirmation;
    expect(confirmation.isOpen).toBe(true);
    expect(confirmation.options?.message).toBe(
      'auth_files.codex_plan_refresh_close_paused_confirm'
    );

    await act(async () => confirmation.options?.onConfirm());
    expect(clear).toHaveBeenCalledTimes(1);
    expect(result.current.codexPlanRefreshTask?.state).toBe('idle');
    expect(shouldShowCodexPlanRefreshPanel(result.current.codexPlanRefreshTask, false)).toBe(false);
  });

  test('does not send DELETE when the paused close confirmation is canceled', async () => {
    const clear = vi.spyOn(authFilesApi, 'clearCodexPlanTypeRefreshStatus');
    const { result } = await loadTaskIntoHook(createTask());

    await act(async () => result.current.clearCodexPlanTypeRefresh());
    render(<ConfirmationModal />);
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(clear).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().confirmation.isOpen).toBe(false);
  });

  test('keeps the existing resume request for a paused task', async () => {
    const resumed = createTask({ state: 'running', running: true, paused: false });
    const control = vi
      .spyOn(authFilesApi, 'controlCodexPlanTypeRefresh')
      .mockResolvedValue(resumed);
    const { result } = await loadTaskIntoHook(createTask());

    await act(async () => result.current.resumeCodexPlanTypeRefresh());

    expect(control).toHaveBeenCalledWith('resume');
    expect(result.current.codexPlanRefreshTask?.state).toBe('running');
  });

  test('applies the latest task snapshot and warns when DELETE returns 409', async () => {
    const requestRaw = vi.spyOn(apiClient, 'requestRaw').mockResolvedValue({
      status: 409,
      data: {
        state: 'running',
        running: true,
        paused: false,
        pause_requested: true,
        can_retry_failed: false,
        summary: EMPTY_SUMMARY,
        results: [],
      },
    } as never);
    const { result } = await loadTaskIntoHook(createTask());

    await act(async () => result.current.clearCodexPlanTypeRefresh());
    const confirmation = useNotificationStore.getState().confirmation;
    await act(async () => confirmation.options?.onConfirm());

    expect(requestRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/auth-files/codex/plan-type-refresh',
        method: 'DELETE',
      })
    );
    expect(result.current.codexPlanRefreshTask).toMatchObject({
      state: 'running',
      running: true,
      pauseRequested: true,
    });
    expect(shouldShowCodexPlanRefreshPanel(result.current.codexPlanRefreshTask, false)).toBe(true);
    expect(useNotificationStore.getState().notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'auth_files.codex_plan_refresh_clear_unavailable',
          type: 'warning',
        }),
      ])
    );
  });
});
