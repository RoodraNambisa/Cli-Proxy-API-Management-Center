import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthFileResponseModelStatus } from './AuthFileResponseModelStatus';
import type { AuthFileItem } from '@/types/authFile';

const mocks = vi.hoisted(() => ({ load: vi.fn(), generation: 1 }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ apiBase: 'https://fixture', connectionGeneration: mocks.generation }),
}));
vi.mock('@/services/api/authFiles', () => ({ authFilesApi: { responseModelRewrite: mocks.load } }));
vi.mock('@/services/api/client', () => ({
  apiClient: { captureConnection: () => ({ apiBase: 'fixture' }) },
}));
const summary = {
  enabled: true,
  conditional: true,
  total: 3,
  since: '2026-09-18T00:00:00Z',
  rules: [{ rule: 1, models: ['gpt-*'] }],
};
const file: AuthFileItem = { name: 'fixture.json', response_model_rewrite: summary };

describe('credential response model status', () => {
  beforeEach(() => {
    mocks.load.mockReset();
    mocks.generation = 1;
  });
  it('loads details only on demand and displays both original and rewritten models', async () => {
    mocks.load.mockResolvedValue({
      ...summary,
      recent: [
        {
          at: summary.since,
          requested_model: 'gpt-6-astra',
          original_model: 'gpt-5.6-luna',
          response_model: 'gpt-6-astra',
          rule: 1,
          stream: true,
        },
      ],
    });
    render(<AuthFileResponseModelStatus file={file} disabled={false} />);
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'response_model_rewrite.details: fixture.json' })
    );
    expect(await screen.findByText('gpt-5.6-luna')).toBeTruthy();
    expect(screen.getAllByText('gpt-6-astra')).toHaveLength(2);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it('aborts details when the connection changes', async () => {
    mocks.load.mockImplementation(() => new Promise(() => {}));
    const view = render(<AuthFileResponseModelStatus file={file} disabled={false} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'response_model_rewrite.details: fixture.json' })
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    const signal = mocks.load.mock.calls[0][2] as AbortSignal;
    mocks.generation = 2;
    view.rerender(<AuthFileResponseModelStatus file={file} disabled={false} />);
    expect(signal.aborted).toBe(true);
  });
});
