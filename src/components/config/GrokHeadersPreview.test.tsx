import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_GROK_CONFIG } from '@/types/grok';
import { authFilesApi } from '@/services/api/authFiles';
import { apiClient } from '@/services/api/client';
import { GrokHeadersPreview } from './GrokHeadersPreview';
import type { GrokTransmission } from '@/types/grokDiagnostics';

vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/api/authFiles', () => ({
  authFilesApi: { getGrokOptions: vi.fn(), previewGrokHeaders: vi.fn() },
}));
vi.mock('@/services/api/client', () => ({
  apiClient: {
    captureConnection: () => ({ apiBase: 'http://test', managementKey: 'fixture', timeout: 1000 }),
    getAtConnection: vi.fn(),
  },
}));
const result: GrokTransmission = {
  id: 1,
  preview: true,
  stage: 'http',
  url: 'https://api.x.ai/v1/responses',
  headers: [
    {
      name: 'Authorization',
      value: '[redacted sha256:fixture]',
      source: 'credential-auth',
      redacted: true,
    },
  ],
  compression: { enabled: false, reason: 'disabled' },
};
const options = {
  capabilities: { headers_preview: true },
  client_version: '1.0.52',
  version_source: 'builtin',
  credentials: [{ id: '1', name: 'fixture.json', models: ['grok-4.7'], disabled: false }],
};
async function openPreview() {
  const details = screen
    .getAllByText('grok_diagnostics.preview')
    .find((n) => n.tagName === 'SUMMARY')!
    .closest('details')!;
  act(() => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
  await waitFor(() => expect(authFilesApi.getGrokOptions).toHaveBeenCalled());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authFilesApi.getGrokOptions).mockResolvedValue(options);
  vi.mocked(apiClient.getAtConnection).mockResolvedValue(
    'xai:\n  future: retained\n  request-defaults:\n    include: []\n'
  );
  vi.mocked(authFilesApi.previewGrokHeaders).mockResolvedValue(result);
});
describe('Grok header preview', () => {
  it('previews the editor YAML without fetching another configuration snapshot', async () => {
    render(
      <GrokHeadersPreview
        sourceYaml="xai: {future: local-editor}"
        value={DEFAULT_GROK_CONFIG}
        baselineValue={DEFAULT_GROK_CONFIG}
      />
    );
    await openPreview();
    await screen.findByDisplayValue('grok-4.7');
    fireEvent.click(screen.getByRole('button', { name: 'grok_diagnostics.preview' }));
    await waitFor(() => expect(authFilesApi.previewGrokHeaders).toHaveBeenCalled());
    expect(apiClient.getAtConnection).not.toHaveBeenCalled();
    expect(vi.mocked(authFilesApi.previewGrokHeaders).mock.calls[0][0].config.future).toBe(
      'local-editor'
    );
  });
  it('uses unsaved fields and preserves unknown fields and explicit empty lists', async () => {
    render(
      <GrokHeadersPreview
        value={{ ...DEFAULT_GROK_CONFIG, officialBuild: true }}
        baselineValue={DEFAULT_GROK_CONFIG}
      />
    );
    await openPreview();
    await waitFor(() => expect(screen.getByDisplayValue('grok-4.7')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'grok_diagnostics.preview' }));
    await waitFor(() => expect(authFilesApi.previewGrokHeaders).toHaveBeenCalled());
    expect(vi.mocked(authFilesApi.previewGrokHeaders).mock.calls[0][0]).toMatchObject({
      name: 'fixture.json',
      model: 'grok-4.7',
      config: {
        future: 'retained',
        'request-defaults': { include: [] },
        'header-defaults': { 'official-build': true },
      },
    });
    expect(await screen.findByText('[redacted sha256:fixture]')).toBeTruthy();
  });
  it('blocks preview for an older backend', async () => {
    vi.mocked(authFilesApi.getGrokOptions).mockRejectedValue({ status: 404 });
    render(<GrokHeadersPreview value={DEFAULT_GROK_CONFIG} baselineValue={DEFAULT_GROK_CONFIG} />);
    await openPreview();
    expect((await screen.findByRole('alert')).textContent).toContain('grok_diagnostics.upgrade');
    const button = screen.getByRole('button', { name: 'grok_diagnostics.preview' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(authFilesApi.previewGrokHeaders).not.toHaveBeenCalled();
  });
  it('cancels and discards a result when the draft changes', async () => {
    let resolve!: (value: GrokTransmission) => void;
    vi.mocked(authFilesApi.previewGrokHeaders).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(
      <GrokHeadersPreview value={DEFAULT_GROK_CONFIG} baselineValue={DEFAULT_GROK_CONFIG} />
    );
    await openPreview();
    await screen.findByDisplayValue('grok-4.7');
    fireEvent.click(screen.getByRole('button', { name: 'grok_diagnostics.preview' }));
    await waitFor(() => expect(resolve).toBeDefined());
    const signal = vi.mocked(authFilesApi.previewGrokHeaders).mock.calls[0][2];
    view.rerender(
      <GrokHeadersPreview
        value={{ ...DEFAULT_GROK_CONFIG, clientVersion: '1.0.53' }}
        baselineValue={DEFAULT_GROK_CONFIG}
      />
    );
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(result));
    expect(screen.queryByText('[redacted sha256:fixture]')).toBeNull();
  });
});
