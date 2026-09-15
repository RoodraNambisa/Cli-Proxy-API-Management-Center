import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SentinelSolverPage } from './SentinelSolverPage';
import type { SentinelSolverSnapshot, SentinelSolverConfig } from '@/types/sentinelCompute';

const api = vi.hoisted(() => ({ getSentinelSolver: vi.fn(), patchSentinelSolver: vi.fn() }));
vi.mock('@/services/api', () => ({ chatGptWebApi: api }));
vi.mock('@/stores', () => ({
  useAuthStore: (select: (state: { apiBase: string }) => unknown) =>
    select({ apiBase: 'https://proxy.example.com' }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/chatgptWeb/components/SentinelCompatibilityEditor', () => ({
  SentinelCompatibilityEditor: () => null,
}));

let snapshot: SentinelSolverSnapshot;
const save = () => screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;

describe('solver endpoint settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = { config: { enabled: false, 'sdk-fallback-enabled': false }, status: null };
    api.getSentinelSolver.mockImplementation(async () => structuredClone(snapshot));
    api.patchSentinelSolver.mockImplementation(async (patch: SentinelSolverConfig) => {
      snapshot.config = { ...snapshot.config, ...patch };
    });
  });
  it('uses only the main port and saves the complete, case-sensitive path', async () => {
    render(<SentinelSolverPage />);
    const input = (await screen.findByLabelText(
      'sentinel_compute.access_path'
    )) as HTMLInputElement;
    expect(input.value).toBe('/v1/sentinel');
    expect(save().disabled).toBe(true);
    expect(screen.queryByLabelText('sentinel_compute.listen')).toBeNull();
    expect(screen.queryByLabelText('TLS')).toBeNull();
    expect(screen.queryByLabelText('sentinel_compute.tls_cert')).toBeNull();
    fireEvent.change(input, { target: { value: '/afhkajf/Sentinel' } });
    expect(screen.getByText('https://proxy.example.com/afhkajf/Sentinel')).not.toBeNull();
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(api.patchSentinelSolver).toHaveBeenCalledTimes(1));
    const patch = api.patchSentinelSolver.mock.calls[0][0];
    expect(patch['access-path']).toBe('/afhkajf/Sentinel');
    expect(patch).not.toHaveProperty('listen');
    expect(patch).not.toHaveProperty('tls');
    await waitFor(() => expect(save().disabled).toBe(true));
    fireEvent.change(input, { target: { value: '/temporary' } });
    fireEvent.click(screen.getByRole('button', { name: 'sentinel_compute.reload' }));
    await waitFor(() => expect(input.value).toBe('/afhkajf/Sentinel'));
    expect(save().disabled).toBe(true);
  });
  it.each(['/', 'relative', '/bad//path', '/a/../b', '/a/%2f', '/key?secret=x', '/trailing/'])(
    'blocks invalid path %s',
    async (path) => {
      render(<SentinelSolverPage />);
      const input = await screen.findByLabelText('sentinel_compute.access_path');
      fireEvent.change(input, { target: { value: path } });
      expect(save().disabled).toBe(true);
    }
  );
  it('still requires a solver key when sharing the port', async () => {
    render(<SentinelSolverPage />);
    const enabled = await screen.findByRole('checkbox', { name: 'sentinel_compute.enabled' });
    fireEvent.click(enabled);
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'sentinel_compute.add_key' }));
    fireEvent.change(screen.getByLabelText('sentinel_compute.api-key 1'), {
      target: { value: 'fixture-key' },
    });
    expect(save().disabled).toBe(false);
  });
});
