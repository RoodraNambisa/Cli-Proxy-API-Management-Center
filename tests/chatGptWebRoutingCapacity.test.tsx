import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatGptWebRoutingCapacityCard } from '@/features/authFiles/components/ChatGptWebRoutingCapacityCard';
import { apiClient, chatGptWebApi } from '@/services/api';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

const routingSnapshot = {
  routing: {
    provider: 'chatgpt-web',
    model: 'gpt-image-2',
    priorities: [
      {
        priority: 0,
        total: 1000,
        quota_exhausted: 100,
        cooldown: 20,
        unavailable: 30,
        ready_before_request_limit: 850,
        request_limited: 50,
        eligible_now: 800,
        earliest_request_limit_reset_at: '2026-08-16T00:10:00Z',
        request_capacity: {
          mode: 'limited',
          limited_credentials: 850,
          unlimited_credentials: 0,
          configured_slots: 850,
          remaining_slots: 800,
          configured_rpm: 850,
          earliest_consumed_reset_at: '2026-08-16T00:10:00Z',
        },
      },
    ],
  },
  request_execution_metrics: {},
};

describe('ChatGPT Web routing capacity on the auth files page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'captureConnection').mockReturnValue({
      apiBase: 'https://routing.example/v0/management',
      managementKey: 'secret',
      timeout: 30_000,
    });
  });

  test('loads and renders the fixed-window capacity for the credential pool', async () => {
    const getRouting = vi
      .spyOn(chatGptWebApi, 'getRoutingDiagnostics')
      .mockResolvedValue(routingSnapshot);

    render(<ChatGptWebRoutingCapacityCard />);

    await waitFor(() => expect(getRouting).toHaveBeenCalledTimes(1));
    expect(getRouting).toHaveBeenCalledWith(
      'chatgpt-web',
      'gpt-image-2',
      expect.objectContaining({ apiBase: 'https://routing.example/v0/management' }),
      expect.any(AbortSignal)
    );
    const card = screen
      .getByText('chatgpt_web.account_info.routing.title')
      .closest('section') as HTMLElement;
    expect(within(card).getByText('1000')).not.toBeNull();
    expect(within(card).getAllByText('800').length).toBeGreaterThan(0);
    expect(within(card).getAllByText('850').length).toBeGreaterThan(0);
  });

  test('does not poll while the auth files page is inactive', () => {
    const getRouting = vi.spyOn(chatGptWebApi, 'getRoutingDiagnostics');

    render(<ChatGptWebRoutingCapacityCard active={false} />);

    expect(getRouting).not.toHaveBeenCalled();
  });
});
