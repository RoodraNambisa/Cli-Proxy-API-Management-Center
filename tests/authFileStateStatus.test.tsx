import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthFileStateStatus } from '@/features/authFiles/components/AuthFileStateStatus';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { CodexStateSnapshot } from '@/types/authFile';

const t = (key: string, options?: Record<string, unknown>) =>
  key === 'codex_state.returned_length'
    ? `${key} ${options?.length}`
    : key === 'codex_state.returned_model'
      ? `${key} ${options?.model}`
      : key;
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t }),
}));
const state = (status: string): CodexStateSnapshot => ({
  model: 'gpt-6-astra',
  status,
  length: status === 'valid' ? 292 : 0,
  acquired: status === 'valid' ? 1 : 0,
  attempts: 1,
  uses: 0,
  current_uses: 0,
  completed: 0,
  misses: 0,
  consecutive_failures: 0,
  exhausted: false,
  acquisition_tokens: 0,
});
const file = { name: 'fixture.json', codex_state: { enabled: true, models: [state('missing')] } };
beforeEach(() => {
  vi.useFakeTimers();
  useAuthStore.setState({ apiBase: 'http://fixture', connectionGeneration: 1 });
});
afterEach(() => vi.useRealTimers());

it.each([
  {
    reason: 'state_length_mismatch',
    length: 312,
    model: 'gpt-6-astra',
    detail: 'codex_state.returned_length 312',
  },
  {
    reason: 'invalid_or_missing_state',
    length: 0,
    model: '',
    detail: 'codex_state.returned_length 0',
  },
  {
    reason: 'response_model_mismatch',
    length: 292,
    model: 'gpt-5.5',
    detail: 'codex_state.returned_model gpt-5.5',
  },
])('shows the actual failed response metadata: $reason', ({ reason, length, model, detail }) => {
  render(
    <AuthFileStateStatus
      disabled={false}
      file={{
        ...file,
        codex_state: {
          enabled: true,
          models: [
            {
              ...state('failed'),
              last_error: reason,
              last_status: 200,
              last_returned_length: length,
              last_returned_model: model,
              routing_hidden: true,
            },
          ],
        },
      }}
    />
  );
  fireEvent.click(screen.getByText('codex_state.details'));
  expect(
    screen.getByText((_, element) => element?.textContent === `${reason}  · HTTP 200 · ${detail}`)
  ).toBeTruthy();
  expect(screen.getByText('codex_state.routing_hidden')).toBeTruthy();
});

it('automatically follows a card acquisition from queued to acquiring to valid, then stops', async () => {
  vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ models: [state('queued')] });
  const get = vi
    .spyOn(apiClient, 'getAtConnection')
    .mockResolvedValueOnce({ models: [state('acquiring')] })
    .mockResolvedValue({ models: [state('valid')] });
  render(<AuthFileStateStatus file={file} disabled={false} />);
  fireEvent.click(screen.getByText('codex_state.details'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.acquire' }));
  });
  expect(screen.getByText('codex_state.status_queued')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByText('codex_state.status_acquiring')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByText('codex_state.status_valid')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(get).toHaveBeenCalledTimes(2);
});

it('cancels card polling on unmount while leaving the backend task alone', async () => {
  const get = vi.spyOn(apiClient, 'getAtConnection').mockReturnValue(new Promise(() => {}));
  const post = vi.spyOn(apiClient, 'postAtConnection');
  const view = render(
    <AuthFileStateStatus
      file={{ ...file, codex_state: { enabled: true, models: [state('acquiring')] } }}
      disabled={false}
    />
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  const config = get.mock.calls[0][2] as { signal: AbortSignal };
  view.unmount();
  expect(config.signal.aborted).toBe(true);
  expect(post).not.toHaveBeenCalled();
});

it('does not let a stale polling result overwrite a pause operation', async () => {
  let resolve!: (value: unknown) => void;
  const get = vi.spyOn(apiClient, 'getAtConnection').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  vi.spyOn(apiClient, 'postAtConnection').mockResolvedValue({ models: [state('paused')] });
  render(
    <AuthFileStateStatus
      file={{ ...file, codex_state: { enabled: true, models: [state('acquiring')] } }}
      disabled={false}
    />
  );
  fireEvent.click(screen.getByText('codex_state.details'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'codex_state.pause' }));
  });
  await act(async () => {
    resolve({ models: [state('valid')] });
  });
  expect(screen.getByText('codex_state.status_paused')).toBeTruthy();
  expect((get.mock.calls[0][2] as { signal: AbortSignal }).signal.aborted).toBe(true);
});

it('shows round cooldown and polls long waits slowly, then resumes fast polling', async () => {
  const model = {
    ...state('retry_wait'),
    round_waiting: true,
    retry_rounds_used: 0,
    max_retry_rounds: 2,
    max_attempts: 10,
    consecutive_failures: 10,
    next_attempt: new Date(Date.now() + 30 * 60000).toISOString(),
  };
  const get = vi.spyOn(apiClient, 'getAtConnection').mockResolvedValue({ models: [model] });
  render(
    <AuthFileStateStatus
      file={{ ...file, codex_state: { enabled: true, models: [model] } }}
      disabled={false}
    />
  );
  fireEvent.click(screen.getByText('codex_state.details'));
  expect(screen.getByText('codex_state.status_retry_wait')).toBeTruthy();
  expect(screen.getByText('codex_state.retry_round_progress')).toBeTruthy();
  expect(screen.getByText('codex_state.retry_round_wait')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(29999);
  });
  expect(get).not.toHaveBeenCalled();
  get.mockResolvedValue({
    models: [{ ...model, status: 'acquiring', round_waiting: false, retry_rounds_used: 1 }],
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(get).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(get).toHaveBeenCalledTimes(2);
});
