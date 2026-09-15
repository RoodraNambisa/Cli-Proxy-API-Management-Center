import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthFileModelProbe } from '@/features/authFiles/components/AuthFileModelProbe';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { authFilesApi, type ModelProbeResult } from '@/services/api/authFiles';

vi.mock('react-i18next', async (original) => ({ ...(await original<typeof import('react-i18next')>()), useTranslation: () => ({ t: (key: string) => key }) }));
const result: ModelProbeResult = { success: true, name: 'chosen.json', model: 'grok-4.6', upstream_model: 'grok-4.6', request_path: '/v1/responses', upstream_url: 'https://api.x.ai/v1/responses', stream: false, latency_ms: 240, response: 'OK' };
const models = [{ id: 'grok-4.6' }, { id: 'grok-4.5' }, { id: 'grok-imagine-image' }];

describe('credential model connection tests', () => {
  it('includes Codex text models and uses the selected credential', async () => {
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockResolvedValue(result);
    render(<AuthFileModelProbe fileName="codex.json" provider="codex" models={[{ id: 'gpt-5.5' }, { id: 'gpt-image-2' }]} />);
    expect(screen.getByText('model_probe.codex_conversion')).toBeTruthy();
    expect(screen.queryByText('gpt-image-2')).toBeNull();
    expect(screen.queryByRole('button', { name: 'model_probe.upstream' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test gpt-5.5' }));
    await waitFor(() => expect(screen.getByText('model_probe.states.success')).toBeTruthy());
    expect(probe.mock.calls[0][0]).toEqual({ name: 'codex.json', model: 'gpt-5.5', protocol: 'responses', stream: false });
    expect(screen.getByText('/v1/responses → https://api.x.ai/v1/responses')).toBeTruthy();
  });

  it('tests the chosen Grok node and protocol sequentially and selects successes', async () => {
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, success: false, error: 'model unavailable' });
    render(<AuthFileModelProbe fileName="chosen.json" provider="xai" models={models} />);
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.protocol' }));
    fireEvent.click(screen.getByRole('option', { name: 'model_probe.protocols.chat-direct' }));
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.upstream' }));
    fireEvent.click(screen.getByRole('option', { name: 'grok_upstream.modes.api' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'model_probe.stream' }));
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test_visible' }));
    await waitFor(() => expect(screen.getByText('model_probe.states.failed')).toBeTruthy());
    expect(probe).toHaveBeenCalledTimes(2);
    expect(probe.mock.calls[0][0]).toMatchObject({ protocol: 'chat-direct', upstream: 'api', stream: true, model: 'grok-4.6' });
    expect(probe.mock.calls[1][0].model).toBe('grok-4.5');
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.select_success' }));
    expect((screen.getByRole('checkbox', { name: 'model_probe.select grok-4.6' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'model_probe.select grok-4.5' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText('grok-imagine-image')).toBeNull();
  });

  it('stops queued tests and ignores a late response after cancellation', async () => {
    let finish!: (value: ModelProbeResult) => void;
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AuthFileModelProbe fileName="chosen.json" provider="xai" models={models} />);
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test_visible' }));
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.cancel' }));
    expect(probe.mock.calls[0][2].aborted).toBe(true);
    await act(async () => finish(result));
    expect(probe).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('model_probe.states.cancelled')).toHaveLength(2);
    expect(screen.queryByText('model_probe.states.success')).toBeNull();
  });

  it('allows manual model IDs and filters bulk tests', async () => {
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockResolvedValue(result);
    render(<AuthFileModelProbe fileName="chosen.json" provider="xai" models={models} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'model_probe.manual_model' }), { target: { value: 'grok-4.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.add_model' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'model_probe.filter' }), { target: { value: '4.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test_visible' }));
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    expect(probe.mock.calls[0][0].model).toBe('grok-4.3');
  });

  it('blocks invalid custom URLs and clears results when the route changes', async () => {
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockResolvedValue(result);
    render(<AuthFileModelProbe fileName="chosen.json" provider="xai" models={models} />);
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test grok-4.6' }));
    await waitFor(() => expect(screen.getByText('model_probe.states.success')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.upstream' }));
    fireEvent.click(screen.getByRole('option', { name: 'grok_upstream.modes.custom' }));
    expect(screen.queryByText('model_probe.states.success')).toBeNull();
    expect((screen.getByRole('button', { name: 'model_probe.test_visible' }) as HTMLButtonElement).disabled).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('aborts an active test when the modal closes or the connection changes', async () => {
    const probe = vi.spyOn(authFilesApi, 'probeModel').mockImplementation(() => new Promise(() => {}));
    const props = { open: true, fileName: 'chosen.json', fileType: 'xai', loading: false, error: null, models, loadedAtMs: 0, excluded: {}, onClose: () => {}, onCopyText: () => {}, connectionGenerationKey: 'server-a' };
    const view = render(<AuthFileModelsModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.title' }));
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test grok-4.6' }));
    view.rerender(<AuthFileModelsModal {...props} connectionGenerationKey="server-b" />);
    expect(probe.mock.calls[0][2].aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.title' }));
    fireEvent.click(screen.getByRole('button', { name: 'model_probe.test grok-4.6' }));
    view.rerender(<AuthFileModelsModal {...props} open={false} />);
    expect(probe.mock.calls[1][2].aborted).toBe(true);
  });
});
